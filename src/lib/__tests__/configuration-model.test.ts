import { expect, it } from "vitest";
import { canonicalSetting, createDocumentSchema, documentView, pesoInputSchema, settingEntrySchema, type ConfigDocument } from "../configuration-model";

it.each([["0", 0], ["0.01", 1], ["150.50", 15050], [" 150.5 ", 15050], ["21474836.47", 2147483647]])("parses PHP %s as exact integer centavos", (raw, expected) => {
  expect(pesoInputSchema.parse(raw)).toBe(expected);
});
it.each(["-1", "+1", "1e2", "0x10", "1,000", "1.005", "1.", "", "01", "21474836.48", "21474837", "99999999", "NaN", "Infinity", "1\n2"])("rejects malformed/out-of-range price %j", raw => {
  expect(pesoInputSchema.safeParse(raw).success).toBe(false);
});
it("validates settings shapes, limits and active methods instead of accepting arbitrary JSON", () => {
  expect(canonicalSetting("MAINTENANCE_MODE", "true")).toBe("true");
  expect(canonicalSetting("PAYMENT_METHODS", '{"online":false,"cash":true}')).toBe('{"online":false,"cash":true}');
  for (const [key, raw] of [["MAINTENANCE_MODE", '"true"'], ["PAYMENT_METHODS", '{"online":false,"cash":false}'], ["PAYMENT_METHODS", '{"online":"true","cash":true}'],
    ["OPERATIONS_CONFIG", '{"location":"","hours":"9-5"}'], ["OPERATIONS_CONFIG", '{"location":"A","hours":"B","secret":"x"}'],
    ["EMAIL_TEMPLATES", '{"UNKNOWN":"message"}'], ["EMAIL_TEMPLATES", JSON.stringify({ PROCESSING: "a".repeat(10001) })]] as const) expect(() => canonicalSetting(key, raw)).toThrow();
  expect(() => canonicalSetting("EMAIL_TEMPLATES", "a".repeat(60001))).toThrow();
});
it("treats blank email overrides as reset-to-default and supports cancelled notifications", () => {
  expect(canonicalSetting("EMAIL_TEMPLATES", '{"PROCESSING":"  ","CANCELLED":"Contact the registrar"}')).toBe('{"CANCELLED":"Contact the registrar"}');
});
it("rejects invalid successful setting DTOs before editors parse them", () => {
  expect(settingEntrySchema.safeParse({ key: "PAYMENT_METHODS", value: "malformed", version: "2026-11-12T00:00:00Z", valid: true }).success).toBe(false);
  expect(settingEntrySchema.safeParse({ key: "PAYMENT_METHODS", value: "malformed", version: "2026-11-12T00:00:00Z", valid: false }).success).toBe(true);
  expect(settingEntrySchema.safeParse({ key: "PAYMENT_METHODS", value: null, version: null, valid: false }).success).toBe(false);
});
it("generates stable document codes while rejecting unusable codes and fields", () => {
  const fields = { intentId: "9d23e101-9e88-42e7-9ca5-b6c5fc65fabc", label: " Report Card ", description: "Official report", price: "150.50", isActive: "true" };
  expect(createDocumentSchema.parse(fields)).toMatchObject({ typeId: "REPORT_CARD", label: "Report Card", price: 15050, isActive: true });
  for (const change of [{ label: " " }, { typeId: "bad code" }, { typeId: "__proto__" }, { typeId: "X".repeat(65) }, { isActive: "yes" }, { description: "x".repeat(2001) }, { secret: "forged" }]) expect(createDocumentSchema.safeParse({ ...fields, ...change }).success).toBe(false);
});
it("filters the full catalog and clamps pages without mutating source documents", () => {
  const items: ConfigDocument[] = Array.from({ length: 16 }, (_, i) => ({ id: String(i), typeId: "CODE_" + i, label: "Document " + i, description: "Synthetic", price: 0, isActive: true, updatedAt: "2026-11-12T00:00:00Z" }));
  expect(documentView(items, "", 9)).toMatchObject({ page: 3, totalPages: 3 });
  expect(documentView(items.slice(0, 2), "", 3)).toMatchObject({ page: 1, matched: 2 });
  expect(documentView(items, " code_15 ", 2).items[0].id).toBe("15");
  expect(documentView(items, "missing", 3)).toMatchObject({ page: 1, totalPages: 1, items: [] });
  expect(items[0].id).toBe("0");
});
