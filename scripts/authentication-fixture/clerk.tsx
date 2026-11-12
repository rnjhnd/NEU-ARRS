import { useMemo } from "react";
import { useUser, useClerk as useBaseClerk } from "../navigation-fixture/clerk";
import { syntheticAction } from "./actions";
export { useUser };
export function useSession() {
  const { user } = useUser();
  const session = useMemo(() => user ? { id: "session_" + user.id, user: { id: user.id } } : null, [user]);
  return { session, isLoaded: true };
}
export function useClerk() {
  const base = useBaseClerk();
  return { ...base, client: { signIn: { authenticateWithRedirect: (input: unknown) => syntheticAction("oauth", input) } } };
}
function useResource(prefix: "signin" | "signup") {
  return useMemo(() => {
    const resource = { status: "needs_first_factor", async create(input: unknown) {
      const result = await syntheticAction(prefix + "-create", input); resource.status = result.status ?? "complete"; return result;
    }, finalize: () => syntheticAction(prefix + "-finalize"), verifications: {
      sendEmailCode: () => syntheticAction("send-code"), verifyEmailCode: async (input: unknown) => {
        const result = await syntheticAction("verify-code", input); resource.status = result.status ?? "complete"; return result;
      },
    } }; return resource;
  }, [prefix]);
}
export function useSignIn() { return { signIn: useResource("signin") }; }
export function useSignUp() { return { signUp: useResource("signup") }; }
