import "server-only";
import prisma from "./prisma";
import { requireAdmin, requireAuth } from "./auth";
import { canonicalSetting, DOCUMENT_LIMIT, documentSchema, documentsSnapshotSchema, SETTING_KEYS, settingDefault, settingsSnapshotSchema, type SettingEntry, type StudentCatalogItem } from "./configuration-model";
import type { DocumentConfig } from "@prisma/client";

export class ConfigurationReadError extends Error {}
export const documentSelect = { id: true, typeId: true, label: true, description: true, price: true, isActive: true, updatedAt: true } as const;
export function configDocument(row: Pick<DocumentConfig, keyof typeof documentSelect>) {
  return documentSchema.parse({ id: row.id, typeId: row.typeId, label: row.label, description: row.description, price: row.price, isActive: row.isActive, updatedAt: row.updatedAt.toISOString() });
}
export function settingEntry(key: SettingEntry["key"], row?: { value: string; updatedAt: Date } | null): SettingEntry {
  if (!row) return { key, value: null, version: null, valid: true };
  try { return { key, value: canonicalSetting(key, row.value), version: row.updatedAt.toISOString(), valid: true }; }
  catch { return { key, value: row.value.length <= 60000 ? row.value : null, version: row.updatedAt.toISOString(), valid: false }; }
}
export async function loadAdminDocuments() {
  const actorId = await requireAdmin();
  const rows = await prisma.documentConfig.findMany({ select: documentSelect, orderBy: [{ label: "asc" }, { id: "asc" }], take: DOCUMENT_LIMIT + 1 });
  if (rows.length > DOCUMENT_LIMIT) throw new ConfigurationReadError("The document catalog is too large to load completely.");
  const result = documentsSnapshotSchema.parse({ actorId, asOf: new Date().toISOString(), items: rows.map(configDocument) });
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2_000_000) throw new ConfigurationReadError("The document catalog is too large to load completely.");
  return result;
}
export async function loadAdminSettings() {
  const actorId = await requireAdmin();
  const rows = await prisma.systemSettings.findMany({ where: { key: { in: [...SETTING_KEYS] } }, select: { key: true, value: true, updatedAt: true } });
  return settingsSnapshotSchema.parse({ actorId, asOf: new Date().toISOString(), entries: SETTING_KEYS.map(key => settingEntry(key, rows.find(row => row.key === key))) });
}
/** Authenticated student catalog: read-only, active display/price fields only. */
export async function loadStudentCatalog(): Promise<StudentCatalogItem[]> {
  await requireAuth();
  const rows = await prisma.documentConfig.findMany({ where: { isActive: true }, select: { typeId: true, label: true, description: true, price: true, isActive: true }, orderBy: [{ label: "asc" }, { id: "asc" }], take: DOCUMENT_LIMIT + 1 });
  if (rows.length > DOCUMENT_LIMIT) throw new ConfigurationReadError("The document catalog is unavailable. Please contact the registrar.");
  const result = documentSchema.pick({ typeId: true, label: true, description: true, price: true, isActive: true }).array().parse(rows);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2_000_000) throw new ConfigurationReadError("The document catalog is unavailable. Please contact the registrar.");
  return result;
}
/** Only request-availability controls are readable by authenticated students. */
export async function readPublicSetting(key: unknown) {
  await requireAuth();
  if (key !== "MAINTENANCE_MODE" && key !== "PAYMENT_METHODS") throw new ConfigurationReadError("This setting is not available to students.");
  const row = await prisma.systemSettings.findUnique({ where: { key }, select: { value: true } });
  return canonicalSetting(key, row?.value ?? settingDefault(key));
}
/** Structured availability read for server rendering; never an admin action. */
export async function getRequestSetting(key: unknown) {
  try { return { success: true, value: await readPublicSetting(key) }; }
  catch { return { success: false, value: null, error: "Request settings are unavailable." }; }
}
