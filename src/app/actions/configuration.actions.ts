"use server";

import { createHash } from "node:crypto";
import { Prisma, type DocumentConfig } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { canonicalSetting, createDocumentSchema, DOCUMENT_LIMIT, settingKeySchema, updateDocumentSchema, type ConfigDocument, type ConfigResult, type SettingEntry } from "@/lib/configuration-model";
import { configDocument, documentSelect, settingEntry } from "@/lib/configuration-data";

class ConfigurationConflict extends Error {}
class ConfigurationCapacity extends Error {}
async function enforceCatalogCapacity(tx: Prisma.TransactionClient) {
  const rows = await tx.documentConfig.findMany({ select: documentSelect, take: DOCUMENT_LIMIT + 1 });
  // Reserve room for the snapshot envelope; prevent writes that make the
  // complete catalog exceed its response budget.
  if (rows.length > DOCUMENT_LIMIT || Buffer.byteLength(JSON.stringify(rows), "utf8") + 1000 > 2_000_000) throw new ConfigurationCapacity();
}
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
function matches(row: DocumentConfig, data: { label: string; description: string; price: number; isActive: boolean }) {
  return row.label === data.label && row.description === data.description && row.price === data.price && row.isActive === data.isActive;
}
function invalidate(paths: string[]) {
  // The database commit is authoritative even when cache invalidation fails.
  try { paths.forEach(path => revalidatePath(path)); } catch { console.error("[CONFIGURATION_REVALIDATE] Refresh required after committed save."); }
}
export async function createDocumentConfig(form: FormData): Promise<ConfigResult<ConfigDocument>> {
  try {
    const actorId = await requireAdmin(); const input = createDocumentSchema.parse(formObject(form));
    const id = "doc_" + createHash("sha256").update(actorId + ":" + input.intentId).digest("hex").slice(0, 40);
    const saved = await prisma.$transaction(async tx => {
      const existing = await tx.documentConfig.findUnique({ where: { id } });
      if (existing) { if (existing.typeId !== input.typeId || !matches(existing, input)) throw new ConfigurationConflict(); return existing; }
      if (await tx.documentConfig.count() >= DOCUMENT_LIMIT) throw new ConfigurationCapacity();
      const row = await tx.documentConfig.create({ data: { id, typeId: input.typeId, label: input.label, description: input.description, price: input.price, isActive: input.isActive } });
      await enforceCatalogCapacity(tx);
      await tx.auditLog.create({ data: { id: "document-create:" + id, adminId: actorId, action: "DOCUMENT_CREATED", details: JSON.stringify(configDocument(row)) } });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 5000 });
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: configDocument(saved) };
  } catch (error) { return failure(error); }
}
export async function updateDocumentConfig(form: FormData): Promise<ConfigResult<ConfigDocument>> {
  try {
    const actorId = await requireAdmin(); const input = updateDocumentSchema.parse(formObject(form));
    const saved = await prisma.$transaction(async tx => {
      const current = await tx.documentConfig.findUnique({ where: { id: input.id } });
      if (!current) throw new ConfigurationConflict();
      if (matches(current, input)) return current;
      if (current.updatedAt.toISOString() !== input.expectedVersion) throw new ConfigurationConflict();
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const row = await tx.documentConfig.update({ where: { id: input.id, updatedAt: current.updatedAt }, data: { label: input.label, description: input.description, price: input.price, isActive: input.isActive, updatedAt } });
      await enforceCatalogCapacity(tx);
      await tx.auditLog.create({ data: { adminId: actorId, action: "DOCUMENT_UPDATED", details: JSON.stringify({ before: configDocument(current), after: configDocument(row) }) } });
      return row;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 5000 });
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: configDocument(saved) };
  } catch (error) { return failure(error); }
}
export async function updateSystemSetting(form: FormData): Promise<ConfigResult<SettingEntry>> {
  try {
    const actorId = await requireAdmin();
    const input = z.object({ key: settingKeySchema, value: z.string().max(60000), expectedVersion: z.union([z.iso.datetime(), z.literal("")]) }).strict().parse(formObject(form));
    let value: string;
    try { value = canonicalSetting(input.key, input.value); } catch { return { success: false, code: "invalid", error: "Invalid setting. Check the fields, supported status keys, size limits, and enabled payment methods." }; }
    const saved = await prisma.$transaction(async tx => {
      const current = await tx.systemSettings.findUnique({ where: { key: input.key } });
      let previous: string | null = null; try { previous = current ? canonicalSetting(input.key, current.value) : null; } catch { /* Explicit repair of a malformed stored setting. */ }
      if (current && current.value === value) return current;
      if ((current?.updatedAt.toISOString() ?? "") !== input.expectedVersion) throw new ConfigurationConflict();
      const data = { value, updatedAt: new Date(Math.max(Date.now(), (current?.updatedAt.getTime() ?? 0) + 1)) };
      const row = current ? await tx.systemSettings.update({ where: { key: input.key, updatedAt: current.updatedAt }, data }) : await tx.systemSettings.create({ data: { key: input.key, ...data } });
      await tx.auditLog.create({ data: { adminId: actorId, action: "SYSTEM_SETTING_UPDATED", details: JSON.stringify({ key: input.key, previousVersion: current?.updatedAt.toISOString() ?? null, version: row.updatedAt.toISOString(),
        previousHash: current ? createHash("sha256").update(current.value).digest("hex") : null, valueHash: createHash("sha256").update(value).digest("hex"), repaired: current !== null && previous === null }) } });
      return row;
    });
    invalidate(["/admin/settings", "/dashboard", "/dashboard/new"]); return { success: true, data: settingEntry(input.key, saved) };
  } catch (error) { return failure(error); }
}
export async function initializeDocumentDefaults(): Promise<ConfigResult<number>> {
  try {
    const actorId = await requireAdmin();
    const count = await prisma.$transaction(async tx => {
      const standards = [
        { typeId: "TOR", label: "Transcript of Records", description: "Official academic history", price: 15000 },
        { typeId: "GOOD_MORAL", label: "Good Moral Certificate", description: "Behavioral clearance", price: 5000 },
        { typeId: "DIPLOMA", label: "Official Diploma", description: "Graduation certificate", price: 50000 },
        { typeId: "ENROLLMENT", label: "Cert. of Enrollment", description: "Current academic status", price: 10000 },
      ];
      const existing = await tx.documentConfig.findMany({ where: { typeId: { in: standards.map(item => item.typeId) } }, select: { typeId: true } });
      const missing = standards.filter(item => !existing.some(row => row.typeId === item.typeId));
      if (await tx.documentConfig.count() + missing.length > DOCUMENT_LIMIT) throw new ConfigurationCapacity();
      const added = missing.length ? await tx.documentConfig.createMany({ skipDuplicates: true, data: missing }) : { count: 0 };
      await enforceCatalogCapacity(tx);
      if (added.count) await tx.auditLog.create({ data: { adminId: actorId, action: "DOCUMENT_DEFAULTS_ADDED", details: JSON.stringify({ count: added.count, existingDocumentsPreserved: true }) } });
      return added.count;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2000, timeout: 5000 });
    invalidate(["/admin/documents", "/dashboard/new"]); return { success: true, data: count };
  } catch (error) { return failure(error); }
}
