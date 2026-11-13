import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type DocumentConfig } from "@prisma/client";
import type { z } from "zod";
import prisma from "../prisma";
import { createDocumentSchema, updateDocumentSchema, DOCUMENT_LIMIT, canonicalSetting, type SettingEntry } from "../configuration-model";
import { configDocument, documentSelect, settingEntry } from "../configuration-data";
export class ConfigurationConflict extends Error {}
export class ConfigurationCapacity extends Error {}
async function enforceCatalogCapacity(tx: Prisma.TransactionClient) {
  const rows = await tx.documentConfig.findMany({ select: documentSelect, take: DOCUMENT_LIMIT + 1 });
  // Reserve room for the snapshot envelope; prevent writes that make the
  // complete catalog exceed its response budget.
  if (rows.length > DOCUMENT_LIMIT || Buffer.byteLength(JSON.stringify(rows), "utf8") + 1000 > 2_000_000) throw new ConfigurationCapacity();
}
function matches(row: DocumentConfig, data: { label: string; description: string; price: number; isActive: boolean }) {
  return row.label === data.label && row.description === data.description && row.price === data.price && row.isActive === data.isActive;
}

export async function createConfiguredDocument(actorId: string, input: z.infer<typeof createDocumentSchema>) {
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
  return configDocument(saved);
}
export async function updateConfiguredDocument(actorId: string, input: z.infer<typeof updateDocumentSchema>) {
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
  return configDocument(saved);
}
export async function saveSystemSetting(actorId: string, input: { key: SettingEntry["key"]; expectedVersion: string }, value: string) {
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
  return settingEntry(input.key, saved);
}
export async function initializeConfiguredDocuments(actorId: string) {
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
  return count;
}
