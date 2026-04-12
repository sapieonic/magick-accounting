"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User as FirebaseUser, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

interface AppUser {
  _id: string;
  email: string;
  name: string;
  role: "master_admin" | "admin" | "user";
  photoURL?: string;
}

interface AuthContextType {
  user: AppUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const verifyUser = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const token = await fbUser.getIdToken();
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        await signOut(auth);
        setUser(null);
        return;
      }

      setUser(data.user);
      setError(null);

      // Run seed after first login
      if (data.isNew) {
        try {
          const seedToken = await fbUser.getIdToken();
          await fetch("/api/seed", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${seedToken}`,
              "Content-Type": "application/json",
            },
          });
        } catch {
          // Seed errors are non-critical
        }
      }
    } catch {
      setError("Failed to verify authentication");
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        await verifyUser(fbUser);
      } else {
        setUser(null);
        setError(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [verifyUser]);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        error,
        signInWithGoogle,
        logout,
        isAdmin: user?.role === "admin" || user?.role === "master_admin",
        isMasterAdmin: user?.role === "master_admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
