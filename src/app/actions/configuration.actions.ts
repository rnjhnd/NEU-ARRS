"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { canonicalSetting, createDocumentSchema, settingKeySchema, updateDocumentSchema, type ConfigDocument, type ConfigResult, type SettingEntry } from "@/lib/configuration-model";
import { createConfiguredDocument, updateConfiguredDocument, saveSystemSetting, initializeConfiguredDocuments, ConfigurationConflict, ConfigurationCapacity } from "@/lib/services/configuration";

function failure(error: unknown): ConfigResult<never> {
  if (error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message)) return { success: false, code: "auth", error: "Administrator authorization required. Reload this page." };
  if (error instanceof z.ZodError) return { success: false, code: "invalid", error: error.issues[0]?.message ?? "Invalid configuration." };
  if (error instanceof ConfigurationCapacity) return { success: false, code: "invalid", error: "The document catalog limit has been reached. Contact the system administrator." };
  if (error instanceof ConfigurationConflict || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2025", "P2034"].includes(error.code))) return { success: false, code: "conflict", error: "The configuration changed or that code is already in use. Refresh before saving again." };
  console.error("[CONFIGURATION_SAVE]", { error: error instanceof Error ? error.name : "UnknownError" });
  return { success: false, code: "unavailable", error: "The save could not be confirmed. Refresh and verify the stored value before trying again." };
}
function formObject(form: FormData) {
  if (!(form instanceof FormData)) throw new z.ZodError([{ code: "custom", path: [], message: "Invalid form." }]);
  const result: Record<string, FormDataEntryValue> = Object.create(null);
  for (const [key, value] of form) { if (key.startsWith("$ACTION_")) continue; if (Object.hasOwn(result, key)) throw new z.ZodError([{ code: "custom", path: [], message: "Duplicate form fields are not allowed." }]); result[key] = value; }
  return result;
}
function invalidate(paths: string[]) {
  // The database commit is authoritative even when cache invalidation fails.
  try { paths.forEach(path => revalidatePath(path)); } catch { console.error("[CONFIGURATION_REVALIDATE] Refresh required after committed save."); }
}
export async function createDocumentConfig(form: FormData): Promise<ConfigResult<ConfigDocument>> {
  try {
    const actorId = await requireAdmin(); const input = createDocumentSchema.parse(formObject(form));
    const saved = await createConfiguredDocument(actorId, input);
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: saved };
  } catch (error) { return failure(error); }
}
export async function updateDocumentConfig(form: FormData): Promise<ConfigResult<ConfigDocument>> {
  try {
    const actorId = await requireAdmin(); const input = updateDocumentSchema.parse(formObject(form));
    const saved = await updateConfiguredDocument(actorId, input);
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: saved };
  } catch (error) { return failure(error); }
}
export async function updateSystemSetting(form: FormData): Promise<ConfigResult<SettingEntry>> {
  try {
    const actorId = await requireAdmin();
    const input = z.object({ key: settingKeySchema, value: z.string().max(60000), expectedVersion: z.union([z.iso.datetime(), z.literal("")]) }).strict().parse(formObject(form));
    let value: string;
    try { value = canonicalSetting(input.key, input.value); } catch { return { success: false, code: "invalid", error: "Invalid setting. Check the fields, supported status keys, size limits, and enabled payment methods." }; }
    const saved = await saveSystemSetting(actorId, input, value);
    invalidate(["/admin/settings", "/dashboard", "/dashboard/new"]); return { success: true, data: saved };
  } catch (error) { return failure(error); }
}
export async function initializeDocumentDefaults(): Promise<ConfigResult<number>> {
  try {
    const actorId = await requireAdmin();
    const count = await initializeConfiguredDocuments(actorId);
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: count };
  } catch (error) { return failure(error); }
}
