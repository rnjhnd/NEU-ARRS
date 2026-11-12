export async function syntheticAction(kind: string, input: unknown = {}) {
  const response = await fetch("/fixture/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, input }) });
  if (!response.ok) throw new Error("Synthetic transport failure");
  return response.json();
}
export const createRequest = (form: FormData) => syntheticAction("request", Object.fromEntries(form));
