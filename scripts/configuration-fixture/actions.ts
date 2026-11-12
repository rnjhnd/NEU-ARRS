import type { ConfigDocument, ConfigResult, SettingEntry } from "../../src/lib/configuration-model";
async function action<T>(kind: string, form: unknown): Promise<T> {
  const response = await fetch("/fixture/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, form }) });
  if (!response.ok) throw new Error("Synthetic action transport failure");
  return response.json() as Promise<T>;
}
export const createDocumentConfig = (form: FormData) => action<ConfigResult<ConfigDocument>>("create", Object.fromEntries(form));
export const updateDocumentConfig = (form: FormData) => action<ConfigResult<ConfigDocument>>("document", Object.fromEntries(form));
export const updateSystemSetting = (form: FormData) => action<ConfigResult<SettingEntry>>("setting", Object.fromEntries(form));
export const initializeDocumentDefaults = () => action<ConfigResult<number>>("defaults", {});
export const updateUserRole = (id: string, role: string, expectedRole: string, intentId: string, expectedOperationId: string) => action<{ success: true } | { success: false; code: string; error: string }>("role", { id, role, expectedRole, intentId, expectedOperationId });

export const resumeRoleChange = (operationId: string) => action<{ success: true } | { success: false; code: string; error: string }>("role-recovery", { operationId });
