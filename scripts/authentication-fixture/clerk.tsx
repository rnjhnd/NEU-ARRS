import { useMemo } from "react";
import { useUser, useClerk as useBaseClerk } from "../navigation-fixture/clerk";
import { syntheticAction } from "./actions";
export { useUser };
export function useSession() {
  const { user, isLoaded } = useUser();
  const session = useMemo(() => user ? { id: "session_" + user.id, user: { id: user.id } } : null, [user]);
  return { session, isLoaded };
}
export function useClerk() {
  const base = useBaseClerk();
  return { ...base, client: { signIn: { authenticateWithRedirect: (input: unknown) => syntheticAction("oauth", input) } },
    handleRedirectCallback: async (input: unknown, navigate: (destination: string) => Promise<unknown>) => {
      const result = await syntheticAction("oauth-callback", input);
      await navigate(typeof result.destination === "string" ? result.destination : "/");
    } };
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
