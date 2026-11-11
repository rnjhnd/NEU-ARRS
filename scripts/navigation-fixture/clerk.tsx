import { createContext, useContext } from "react";
import type { resolveProfileIdentity } from "../../src/lib/profile-identity";

export type FixtureUser = NonNullable<Parameters<typeof resolveProfileIdentity>[1]>;
export const AuthFixture = createContext<{ user: FixtureUser | null; signOut: () => Promise<void> } | null>(null);
function useFixture() {
  const value = useContext(AuthFixture);
  if (!value) throw new Error("Synthetic auth provider missing.");
  return value;
}
export function useUser() { return { isLoaded: true, user: useFixture().user }; }
export function useClerk() { return { signOut: useFixture().signOut }; }
