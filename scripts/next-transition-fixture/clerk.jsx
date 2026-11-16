"use client";
import { createContext, useContext, useMemo, useState } from "react";

const Auth = createContext(null);
export function FixtureAuth({ initialAccess, children }) {
  const [access, setAccess] = useState(initialAccess);
  const value = useMemo(() => ({ access, async signOut({ redirectUrl }) {
    const response = await fetch("/fixture-auth", { method: "DELETE" });
    if (!response.ok) throw Error("Synthetic sign-out failed");
    setAccess(null);
    window.location.replace(redirectUrl);
  } }), [access]);
  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}
export function useUser() {
  const { access } = useContext(Auth);
  return { isLoaded: true, user: access ? { id: access.userId, firstName: "Synthetic", lastName: "Student", imageUrl: "", primaryEmailAddress: null, publicMetadata: { role: access.role } } : null };
}
export function useSession() {
  const { access } = useContext(Auth);
  return { isLoaded: true, session: access ? { id: access.sessionId, user: { id: access.userId } } : null };
}
async function finalize() {
  const response = await fetch("/fixture-auth", { method: "POST" });
  if (!response.ok) throw Error("Synthetic sign-in failed");
  return { error: null };
}
export function useSignIn() {
  const signIn = useMemo(() => ({ status: "needs_first_factor", async create() { this.status = "complete"; return { error: null }; }, finalize }), []);
  return { signIn };
}
export function useSignUp() { return { signUp: undefined }; }
export function useClerk() {
  const { signOut } = useContext(Auth);
  return { signOut, async handleRedirectCallback(params, navigate) { await finalize(); await navigate(params.signInForceRedirectUrl); } };
}
