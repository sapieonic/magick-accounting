import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyAuth } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { renderPdfFirstPageToPng } from "@/lib/pdf";
import { callDatabricksClaude } from "@/lib/databricks";
import Category from "@/models/Category";
import Currency from "@/models/Currency";

vi.mock("@/lib/auth", () => ({ verifyAuth: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ connectDB: vi.fn() }));
vi.mock("@/lib/pdf", () => ({ renderPdfFirstPageToPng: vi.fn() }));
vi.mock("@/lib/databricks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/databricks")>()),
  callDatabricksClaude: vi.fn(),
}));
vi.mock("@/models/Category", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/Currency", () => ({ default: { find: vi.fn() } }));

const rows = (value: unknown) => ({ select: () => ({ lean: vi.fn().mockResolvedValue(value) }) }) as never;

function upload(type: string, name = "receipt") {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], name, { type }));
  return new NextRequest("https://app.example.com/api/expenses/extract", { method: "POST", body: form });
}

describe("POST /api/expenses/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(verifyAuth).mockResolvedValue({ _id: "u1", email: "a@x.com", name: "A", role: "user" });
    vi.mocked(Category.find).mockReturnValue(rows([{ _id: "cat-1", name: "Travel" }]));
    vi.mocked(Currency.find).mockReturnValue(rows([{ _id: "cur-1", code: "INR" }]));
  });

  it("returns the extracted fields mapped to ids", async () => {
    vi.mocked(callDatabricksClaude).mockResolvedValue(
      '```json\n{"title":"Uber","amount":"450","gstAmount":null,"currencyCode":"INR","category":"Travel","date":"2026-10-30","description":"Ride","travelType":"cab"}\n```'
    );
    const response = await POST(upload("image/png"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: "Uber",
      amount: 450,
      gstAmount: null,
      date: "2026-10-30",
      description: "Ride",
      currency: "cur-1",
      category: "cat-1",
      travelType: "cab",
    });
  });

  it("rejects unsupported file types with 415", async () => {
    expect((await POST(upload("text/plain"))).status).toBe(415);
  });

  it("reports an unreadable PDF as 422 before touching the database", async () => {
    vi.mocked(renderPdfFirstPageToPng).mockImplementation(() => {
      throw new Error("broken");
    });
    const response = await POST(upload("application/pdf"));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Could not read this PDF. Please fill the form manually.",
    });
    expect(connectDB).not.toHaveBeenCalled();
  });

  it("reports unparseable model output as 422", async () => {
    vi.mocked(callDatabricksClaude).mockResolvedValue("sorry, I can't read that");
    const response = await POST(upload("image/jpeg"));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Could not read details from this receipt. Please fill the form manually.",
    });
  });
});
