import mongoose, { ClientSession } from "mongoose";

function isTransactionUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("transaction numbers are only allowed") ||
    message.includes("transactions are not supported") ||
    message.includes("replica set member or mongos")
  );
}

/**
 * Run related writes in a MongoDB transaction when the deployment supports
 * them. Local standalone MongoDB remains supported through a non-transactional
 * fallback; callers should retain compensation for that fallback path.
 */
export async function runInTransaction<T>(
  operation: (session: ClientSession | null, transactional: boolean) => Promise<T>,
  options: { allowStandaloneFallback?: boolean } = {}
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await operation(session, true);
    });
    if (result === undefined) throw new Error("Transaction completed without a result");
    return result;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      if (options.allowStandaloneFallback === false) {
        throw new Error(
          "This operation requires MongoDB replica-set transactions. Configure a replica set before changing or reversing assets."
        );
      }
      return operation(null, false);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export function sessionOptions(session: ClientSession | null): { session?: ClientSession } {
  return session ? { session } : {};
}
