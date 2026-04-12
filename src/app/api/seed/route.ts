import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Category, { DEFAULT_CATEGORIES } from "@/models/Category";
import Currency, { DEFAULT_CURRENCIES } from "@/models/Currency";
import Department from "@/models/Department";
import Expense from "@/models/Expense";
import AllowedDomain from "@/models/AllowedDomain";
import User from "@/models/User";

export async function POST() {
  try {
    await connectDB();

    // Seed default categories
    const existingCategories = await Category.countDocuments({ isDefault: true });
    if (existingCategories === 0) {
      await Category.insertMany(
        DEFAULT_CATEGORIES.map((name) => ({ name, isDefault: true }))
      );
    }

    // Seed default department
    const existingDept = await Department.findOne({ isDefault: true });
    if (!existingDept) {
      // Use master admin or first user as creator
      let creator = await User.findOne({ role: "master_admin" });
      if (!creator) {
        creator = await User.findOne();
      }

      if (creator) {
        await Department.create({
          name: "General",
          description: "Default department for all expenses",
          createdBy: creator._id,
          isDefault: true,
        });
      }
    }

    // Seed default allowed domain from env
    const masterEmail = process.env.MASTER_ADMIN_EMAIL;
    if (masterEmail) {
      const defaultDomain = masterEmail.split("@")[1];
      const existingDomain = await AllowedDomain.findOne({ domain: defaultDomain });

      if (!existingDomain) {
        const admin = await User.findOne({ role: "master_admin" });
        if (admin) {
          await AllowedDomain.create({
            domain: defaultDomain,
            addedBy: admin._id,
          });
        }
      }
    }

    // Seed default currency (INR)
    const existingBaseCurrency = await Currency.findOne({ isBase: true });
    if (!existingBaseCurrency) {
      await Currency.insertMany(DEFAULT_CURRENCIES);
    }

    // Backfill existing expenses with base currency
    const baseCurrency = await Currency.findOne({ isBase: true });
    if (baseCurrency) {
      const unfilled = await Expense.countDocuments({ currency: null });
      if (unfilled > 0) {
        await Expense.updateMany(
          { currency: null },
          [{ $set: { currency: baseCurrency._id, amountInBaseCurrency: "$amount" } }]
        );
      }
    }

    return NextResponse.json({ message: "Seed completed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Seed failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
