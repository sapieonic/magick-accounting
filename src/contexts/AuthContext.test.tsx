import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signInWithPopup } from "firebase/auth";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

type AuthCallback = (user: unknown) => Promise<void> | void;
let onAuthChange: AuthCallback = () => {};

vi.mock("@/lib/firebase", () => ({ auth: {}, googleProvider: {} }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: AuthCallback) => {
    onAuthChange = cb;
    return () => {};
  }),
  // Like Firebase, signing out notifies the auth listener with no user.
  signOut: vi.fn(async () => {
    await onAuthChange(null);
  }),
  signInWithPopup: vi.fn(),
}));

const fbUser = { getIdToken: async () => "token" };

function Probe() {
  const { error, loading, user, signInWithGoogle } = useAuth();
  return (
    <div>
      <p data-testid="error">{error ?? ""}</p>
      <p data-testid="state">{loading ? "loading" : user ? "signed-in" : "signed-out"}</p>
      <button onClick={() => signInWithGoogle()}>Sign in</button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Your email domain is not allowed" }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a rejected domain's error through the sign-out that follows", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await act(async () => {
      await onAuthChange(fbUser);
    });

    expect(screen.getByTestId("state")).toHaveTextContent("signed-out");
    expect(screen.getByTestId("error")).toHaveTextContent("Your email domain is not allowed");
  });

  it("clears the error when a new sign-in starts", async () => {
    vi.mocked(signInWithPopup).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await act(async () => {
      await onAuthChange(fbUser);
    });
    expect(screen.getByTestId("error")).not.toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  });
});
