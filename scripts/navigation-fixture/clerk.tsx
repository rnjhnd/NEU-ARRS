import { createContext, useContext } from "react";
import type { resolveProfileIdentity } from "../../src/lib/profile-identity";

export type FixtureUser = NonNullable<Parameters<typeof resolveProfileIdentity>[1]>;
export const AuthFixture = createContext<{ user: FixtureUser | null; signOut: () => Promise<void>; isLoaded?: boolean } | null>(null);
function useFixture() {
  const value = useContext(AuthFixture);
  if (!value) throw new Error("Synthetic auth provider missing.");
  return value;
}
export function useUser() { const fixture = useFixture(); return { isLoaded: fixture.isLoaded ?? true, user: fixture.user }; }
export function useClerk() { return { signOut: useFixture().signOut }; }
