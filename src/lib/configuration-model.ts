import { z } from "zod";
import { DEFAULT_OPERATIONS } from "./configuration-defaults.mjs";
export { DEFAULT_OPERATIONS, defaultEmailTemplates } from "./configuration-defaults.mjs";

export const CONFIG_URL = "/api/admin/configuration?format=config-v1&area=";
export const DOCUMENT_LIMIT = 1000;
export const SETTING_KEYS = ["MAINTENANCE_MODE", "PAYMENT_METHODS", "OPERATIONS_CONFIG", "EMAIL_TEMPLATES"] as const;
export const settingKeySchema = z.enum(SETTING_KEYS);
export type SettingKey = z.infer<typeof settingKeySchema>;
export const STATUS_KEYS = ["PENDING_PAYMENT", "PROCESSING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const;
export const paymentMethodsSchema = z.object({ online: z.boolean(), cash: z.boolean() }).strict().refine(value => value.online || value.cash, "Keep at least one payment method enabled.");
export const operationsSchema = z.object({ location: z.string().trim().min(1).max(500), hours: z.string().trim().min(1).max(500) }).strict();
export const emailTemplatesSchema = z.partialRecord(z.enum(STATUS_KEYS), z.string().trim().max(10000)).transform(value => Object.fromEntries(Object.entries(value).filter(([, message]) => message !== "")));
export function settingDefault(key: SettingKey): string {
  return key === "MAINTENANCE_MODE" ? "false" : key === "PAYMENT_METHODS" ? '{"online":true,"cash":true}' : key === "OPERATIONS_CONFIG" ? JSON.stringify(DEFAULT_OPERATIONS) : "{}";
}
export function canonicalSetting(key: SettingKey, value: unknown): string {
  if (typeof value !== "string" || value.length > 60000 || new TextEncoder().encode(value).length > 60000) throw new Error("Setting exceeds the allowed size.");
  const parsed: unknown = JSON.parse(value);
  const normalized = key === "MAINTENANCE_MODE" ? z.boolean().parse(parsed) : key === "PAYMENT_METHODS" ? paymentMethodsSchema.parse(parsed)
    : key === "OPERATIONS_CONFIG" ? operationsSchema.parse(parsed) : emailTemplatesSchema.parse(parsed);
  return JSON.stringify(normalized);
}
export const settingEntrySchema = z.object({ key: settingKeySchema, value: z.string().max(60000).nullable(), version: z.iso.datetime().nullable(), valid: z.boolean() }).strict().superRefine((entry, ctx) => {
  if (entry.valid && entry.value !== null) { try { canonicalSetting(entry.key, entry.value); } catch { ctx.addIssue({ code: "custom", message: "Invalid successful setting value" }); } }
  if (entry.version === null && (entry.value !== null || !entry.valid)) ctx.addIssue({ code: "custom", message: "Missing setting version" });
});
export type SettingEntry = z.infer<typeof settingEntrySchema>;
export const settingsSnapshotSchema = z.object({ actorId: z.string().min(1), asOf: z.iso.datetime(), entries: z.array(settingEntrySchema).length(4) }).strict()
  .refine(data => new Set(data.entries.map(entry => entry.key)).size === 4, "Missing/duplicate settings");
export type SettingsSnapshot = z.infer<typeof settingsSnapshotSchema>;
export const documentSchema = z.object({ id: z.string().min(1).max(255), typeId: z.string().min(1).max(255), label: z.string().min(1).max(200), description: z.string().max(2000),
  price: z.number().int().min(0).max(2147483647), isActive: z.boolean(), updatedAt: z.iso.datetime() }).strict();
export type ConfigDocument = z.infer<typeof documentSchema>;
export const documentsSnapshotSchema = z.object({ actorId: z.string().min(1), asOf: z.iso.datetime(), items: z.array(documentSchema).max(DOCUMENT_LIMIT) }).strict()
  .refine(data => new Set(data.items.map(item => item.id)).size === data.items.length && new Set(data.items.map(item => item.typeId)).size === data.items.length, "Duplicate documents");
export type DocumentsSnapshot = z.infer<typeof documentsSnapshotSchema>;
export const pesoInputSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Enter a PHP amount with at most two decimal places.")
  .transform(value => { const [whole, fraction = ""] = value.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); })
  .pipe(z.number().int().max(2147483647, "The maximum price is PHP 21,474,836.47."));
export const documentFieldsSchema = z.object({ label: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(2000),
  price: pesoInputSchema, isActive: z.enum(["true", "false"]).transform(value => value === "true") });
export const createDocumentSchema = documentFieldsSchema.extend({ intentId: z.uuid(), typeId: z.string().trim().max(64).optional() }).strict()
  .transform(value => ({ ...value, typeId: value.typeId || value.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) }))
  .refine(value => /^[A-Z][A-Z0-9_]{0,63}$/.test(value.typeId), "Use a document code starting with a letter, containing only A–Z, numbers, and underscores.");
export const updateDocumentSchema = documentFieldsSchema.extend({ id: z.string().min(1).max(255), expectedVersion: z.iso.datetime() }).strict();
export type ConfigResult<T> = { success: true; data: T; warning?: string } | { success: false; code: "auth" | "invalid" | "conflict" | "unavailable"; error: string };
export type StudentCatalogItem = Pick<ConfigDocument, "typeId" | "label" | "description" | "price" | "isActive">;
export function documentView(items: ConfigDocument[], search: string, requestedPage: number) {
  const query = search.trim().toLowerCase();
  const matches = items.filter(item => [item.typeId, item.label, item.description].some(value => value.toLowerCase().includes(query)))
    .sort((a, b) => a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id));
  const totalPages = Math.max(1, Math.ceil(matches.length / 7)), page = Math.min(Math.max(1, requestedPage), totalPages);
  return { page, totalPages, matched: matches.length, items: matches.slice((page - 1) * 7, page * 7) };
}
