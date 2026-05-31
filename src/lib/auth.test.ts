import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";

// --- Mocks for external dependencies ---
const verifyIdToken = vi.fn();
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: (...args: unknown[]) => verifyIdToken(...args) },
}));

const connectDB = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mongodb", () => ({ connectDB: () => connectDB() }));

const userFindOne = vi.fn();
const userCreate = vi.fn();
vi.mock("@/models/User", () => ({
  default: {
    findOne: (...args: unknown[]) => userFindOne(...args),
    create: (...args: unknown[]) => userCreate(...args),
  },
}));

const domainCountDocuments = vi.fn();
const domainFindOne = vi.fn();
const domainCreate = vi.fn();
vi.mock("@/models/AllowedDomain", () => ({
  default: {
    countDocuments: (...args: unknown[]) => domainCountDocuments(...args),
    findOne: (...args: unknown[]) => domainFindOne(...args),
    create: (...args: unknown[]) => domainCreate(...args),
  },
}));

import { requireAdmin, requireMasterAdmin, verifyAuth, verifyAndCreateUser } from "@/lib/auth";

function makeUser(role: AuthUser["role"]): AuthUser {
  return { _id: "507f1f77bcf86cd799439011", email: "u@example.com", name: "U", role };
}

// A minimal NextRequest-like object: only headers.get is used by verifyAuth.
function makeReq(authHeader: string | null): NextRequest {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? authHeader : null) },
  } as unknown as NextRequest;
}

describe("requireAdmin", () => {
  it("returns null for admin", () => {
    expect(requireAdmin(makeUser("admin"))).toBeNull();
  });

  it("returns null for master_admin", () => {
    expect(requireAdmin(makeUser("master_admin"))).toBeNull();
  });

  it("returns a 403 NextResponse for a regular user", () => {
    const res = requireAdmin(makeUser("user"));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(403);
  });
});

describe("requireMasterAdmin", () => {
  it("returns null for master_admin", () => {
    expect(requireMasterAdmin(makeUser("master_admin"))).toBeNull();
  });

  it("returns a 403 NextResponse for admin", () => {
    const res = requireMasterAdmin(makeUser("admin"));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(403);
  });

  it("returns a 403 NextResponse for a regular user", () => {
    const res = requireMasterAdmin(makeUser("user"));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res?.status).toBe(403);
  });
});

describe("verifyAuth", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    connectDB.mockClear();
    userFindOne.mockReset();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await verifyAuth(makeReq(null));
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 401 when the header is not a Bearer token", async () => {
    const res = await verifyAuth(makeReq("Basic abc"));
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 401 (Invalid token) when token verification throws", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = await verifyAuth(makeReq("Bearer xyz"));
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 401 when the user is not found", async () => {
    verifyIdToken.mockResolvedValue({ email: "nobody@example.com" });
    userFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await verifyAuth(makeReq("Bearer xyz"));
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns an AuthUser for a valid token and existing user", async () => {
    verifyIdToken.mockResolvedValue({ email: "u@example.com" });
    userFindOne.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: { toString: () => "507f1f77bcf86cd799439011" },
          email: "u@example.com",
          name: "Test User",
          role: "admin",
          photoURL: "http://img",
        }),
    });

    const res = await verifyAuth(makeReq("Bearer good-token"));
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(res).toEqual({
      _id: "507f1f77bcf86cd799439011",
      email: "u@example.com",
      name: "Test User",
      role: "admin",
      photoURL: "http://img",
    });
    expect(verifyIdToken).toHaveBeenCalledWith("good-token");
    expect(connectDB).toHaveBeenCalled();
  });
});

describe("verifyAndCreateUser", () => {
  const ORIGINAL_INITIAL = process.env.INITIAL_ALLOWED_DOMAIN;
  const ORIGINAL_MASTER = process.env.MASTER_ADMIN_EMAIL;

  beforeEach(() => {
    verifyIdToken.mockReset();
    connectDB.mockClear();
    userFindOne.mockReset();
    userCreate.mockReset();
    domainCountDocuments.mockReset();
    domainFindOne.mockReset();
    domainCreate.mockReset();
    delete process.env.INITIAL_ALLOWED_DOMAIN;
    delete process.env.MASTER_ADMIN_EMAIL;
  });

  afterEach(() => {
    if (ORIGINAL_INITIAL === undefined) delete process.env.INITIAL_ALLOWED_DOMAIN;
    else process.env.INITIAL_ALLOWED_DOMAIN = ORIGINAL_INITIAL;
    if (ORIGINAL_MASTER === undefined) delete process.env.MASTER_ADMIN_EMAIL;
    else process.env.MASTER_ADMIN_EMAIL = ORIGINAL_MASTER;
  });

  it("returns 401 (Invalid token) when verification throws", async () => {
    verifyIdToken.mockRejectedValue(new Error("nope"));
    const result = await verifyAndCreateUser("bad");
    expect(result).toEqual({ error: "Invalid token", status: 401 });
  });

  it("returns 400 when the token has no email", async () => {
    verifyIdToken.mockResolvedValue({ uid: "abc" });
    const result = await verifyAndCreateUser("tok");
    expect(result).toEqual({ error: "No email in token", status: 400 });
  });

  it("returns 403 when the email domain is not allowed", async () => {
    verifyIdToken.mockResolvedValue({ email: "x@blocked.com" });
    domainCountDocuments.mockResolvedValue(1);
    domainFindOne.mockResolvedValue(null);

    const result = await verifyAndCreateUser("tok");
    expect(result).toEqual({ error: "Email domain @blocked.com is not allowed", status: 403 });
  });

  it("seeds the allowed domain on first-ever sign-in", async () => {
    process.env.INITIAL_ALLOWED_DOMAIN = "@Example.COM";
    verifyIdToken.mockResolvedValue({ email: "first@example.com", uid: "u1" });
    domainCountDocuments.mockResolvedValue(0);
    domainCreate.mockResolvedValue({});
    domainFindOne.mockResolvedValue({ domain: "example.com" });
    userFindOne.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      _id: { toString: () => "id1" },
      email: "first@example.com",
      name: "first",
      role: "user",
      photoURL: "",
    });

    const result = await verifyAndCreateUser("tok");
    // Domain seeded, lowercased, @ stripped, trimmed.
    expect(domainCreate).toHaveBeenCalledWith({ domain: "example.com", addedBy: null });
    expect("user" in result).toBe(true);
  });

  it("does not seed when no INITIAL_ALLOWED_DOMAIN is set even if count is 0", async () => {
    verifyIdToken.mockResolvedValue({ email: "u@example.com", uid: "u1" });
    domainCountDocuments.mockResolvedValue(0);
    domainFindOne.mockResolvedValue(null);

    const result = await verifyAndCreateUser("tok");
    expect(domainCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Email domain @example.com is not allowed", status: 403 });
  });

  it("creates a new user with role 'user' (isNew=true)", async () => {
    verifyIdToken.mockResolvedValue({
      email: "new@example.com",
      name: "New User",
      picture: "http://pic",
      uid: "uid-1",
    });
    domainCountDocuments.mockResolvedValue(1);
    domainFindOne.mockResolvedValue({ domain: "example.com" });
    userFindOne.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      _id: { toString: () => "newid" },
      email: "new@example.com",
      name: "New User",
      role: "user",
      photoURL: "http://pic",
    });

    const result = await verifyAndCreateUser("tok");
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.com", role: "user", firebaseUid: "uid-1" })
    );
    expect(result).toEqual({
      user: {
        _id: "newid",
        email: "new@example.com",
        name: "New User",
        role: "user",
        photoURL: "http://pic",
      },
      isNew: true,
    });
  });

  it("promotes the MASTER_ADMIN_EMAIL user to master_admin on creation", async () => {
    process.env.MASTER_ADMIN_EMAIL = "boss@example.com";
    verifyIdToken.mockResolvedValue({ email: "boss@example.com", uid: "uid-boss" });
    domainCountDocuments.mockResolvedValue(1);
    domainFindOne.mockResolvedValue({ domain: "example.com" });
    userFindOne.mockResolvedValue(null);
    userCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: { toString: () => "bossid" },
      email: doc.email,
      name: doc.name,
      role: doc.role,
      photoURL: doc.photoURL,
    }));

    const result = await verifyAndCreateUser("tok");
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ role: "master_admin" }));
    expect("user" in result && result.user.role).toBe("master_admin");
  });

  it("falls back to the email local-part as name when none provided", async () => {
    verifyIdToken.mockResolvedValue({ email: "noname@example.com", uid: "u" });
    domainCountDocuments.mockResolvedValue(1);
    domainFindOne.mockResolvedValue({ domain: "example.com" });
    userFindOne.mockResolvedValue(null);
    userCreate.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: { toString: () => "id" },
      email: doc.email,
      name: doc.name,
      role: doc.role,
      photoURL: doc.photoURL,
    }));

    await verifyAndCreateUser("tok");
    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "noname" }));
  });

  it("returns an existing user with isNew=false (no create)", async () => {
    verifyIdToken.mockResolvedValue({ email: "existing@example.com", uid: "u" });
    domainCountDocuments.mockResolvedValue(1);
    domainFindOne.mockResolvedValue({ domain: "example.com" });
    userFindOne.mockResolvedValue({
      _id: { toString: () => "existid" },
      email: "existing@example.com",
      name: "Existing",
      role: "admin",
      photoURL: "",
    });

    const result = await verifyAndCreateUser("tok");
    expect(userCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      user: {
        _id: "existid",
        email: "existing@example.com",
        name: "Existing",
        role: "admin",
        photoURL: "",
      },
      isNew: false,
    });
  });
});
