import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI environment variable is required");

await mongoose.connect(uri, { bufferCommands: false, autoIndex: false });
try {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection is unavailable");
  const assets = db.collection("assets");
  const assignments = db.collection("assetassignments");
  const expenses = db.collection("expenses");

  await assets.updateMany(
    { $or: [{ creationBatchId: { $exists: false } }, { creationBatchId: "" }] },
    [{ $set: { creationBatchId: { $concat: ["legacy-", { $toString: "$_id" }] } } }]
  );

  const duplicateAssignments = await assignments.aggregate([
    { $match: { returnedAt: null } },
    { $sort: { assignedAt: -1, _id: -1 } },
    { $group: { _id: "$asset", openAssignments: { $push: { id: "$_id", assignedAt: "$assignedAt" } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  const recordedAt = new Date();
  for (const duplicate of duplicateAssignments) {
    const [current, ...older] = duplicate.openAssignments;
    await assignments.updateMany(
      { _id: { $in: older.map((entry) => entry.id) } },
      { $set: { returnedAt: current.assignedAt, returnedRecordedAt: recordedAt } }
    );
  }

  const duplicateReceipts = await expenses.aggregate([
    { $match: { receiptKey: { $type: "string", $ne: "" } } },
    { $group: { _id: "$receiptKey", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicateReceipts.length > 0) {
    throw new Error(`Duplicate receipt attachment must be resolved first: ${duplicateReceipts[0]._id}`);
  }
  await expenses.updateMany(
    { receiptKey: "" },
    { $unset: { receiptKey: "", receiptFilename: "" } }
  );

  await expenses.updateMany({}, {
    $set: { assetAllocatedAmount: 0, assetAllocatedGstAmount: 0 },
    $inc: { assetAllocationRevision: 1 },
  });
  const allocations = await assets.aggregate([
    { $group: { _id: "$purchaseExpense", amount: { $sum: "$allocatedAmount" }, gstAmount: { $sum: "$allocatedGstAmount" } } },
  ]).toArray();
  if (allocations.length > 0) {
    await expenses.bulkWrite(allocations.map((allocation) => ({
      updateOne: {
        filter: { _id: allocation._id },
        update: { $set: { assetAllocatedAmount: allocation.amount, assetAllocatedGstAmount: allocation.gstAmount } },
      },
    })));
  }

  await assets.createIndex({ creationBatchId: 1 });
  await assignments.createIndex(
    { asset: 1 },
    { unique: true, partialFilterExpression: { returnedAt: null } }
  );
  await expenses.createIndex(
    { receiptKey: 1 },
    { unique: true, partialFilterExpression: { receiptKey: { $type: "string" } } }
  );
  console.log("Asset migration completed successfully.");
} finally {
  await mongoose.disconnect();
}
