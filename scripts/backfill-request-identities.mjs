import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { z } from "zod";

const mappingSchema = z.array(z.object({
  studentId: z.string().trim().min(1).max(255),
  studentName: z.string().trim().min(2).max(200),
  studentNumber: z.string().regex(/^\d{2}-\d{5}-\d{3}$/),
}).strict()).max(100_000);

export function validateIdentityMapping(input) {
  if (!Array.isArray(input) || input.length > 100_000) throw new Error("Identity mapping must be a bounded JSON array.");
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid identity mapping. Provide only studentId, verified studentName, and a ##-#####-### studentNumber.");
  const seen = new Set();
  for (const entry of parsed.data) {
    if (seen.has(entry.studentId)) throw new Error("Duplicate studentId in identity mapping.");
    seen.add(entry.studentId);
  }
  return parsed.data;
}

export async function backfillRequestIdentities(client, input, { apply = false, actorId } = {}) {
  const mapping = new Map(validateIdentityMapping(input).map(entry => [entry.studentId, entry]));
  if (apply && (typeof actorId !== "string" || !actorId.trim() || actorId.length > 255)) {
    throw new Error("An operator actor ID is required when applying an identity backfill.");
  }
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const { rows } = await client.query(`
      SELECT "id", "studentId", "studentName", "studentNumber", "updatedAt" FROM "Request"
      WHERE NULLIF(btrim("studentName"), '') IS NULL OR NULLIF(btrim("studentNumber"), '') IS NULL
      ORDER BY "id" FOR UPDATE
    `);
    // Validate full coverage/conflicts before changing any request.
    for (const row of rows) {
      const entry = mapping.get(row.studentId);
      if (!entry) throw new Error("Verified mapping does not cover every request missing identity. No backfill was applied.");
      for (const field of ["studentName", "studentNumber"]) {
        if (row[field]?.trim() && row[field].trim() !== entry[field]) throw new Error("Mapping conflicts with an existing identity field. Resolve it manually; existing values are never overwritten.");
      }
    }
    if (apply) {
      for (const row of rows) {
        const entry = mapping.get(row.studentId);
        await client.query(`
          UPDATE "Request" SET
            "studentName" = CASE WHEN NULLIF(btrim("studentName"), '') IS NULL THEN $1 ELSE "studentName" END,
            "studentNumber" = CASE WHEN NULLIF(btrim("studentNumber"), '') IS NULL THEN $2 ELSE "studentNumber" END,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $3
        `, [entry.studentName, entry.studentNumber, row.id]);
        await client.query(`
          INSERT INTO "AuditLog" ("id", "adminId", "action", "details", "requestId")
          VALUES ($1, $2, 'MIGRATION_IDENTITY_BACKFILLED', $3, $4)
        `, [
          `migration:identity:${row.id}`, actorId.trim(),
          JSON.stringify({ source: "operator_verified_mapping", previousUpdatedAt: row.updatedAt, fields: ["studentName", "studentNumber"].filter(field => !row[field]?.trim()) }), row.id,
        ]);
      }
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    return { applied: apply, requestCount: rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, actor: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!values.file || !process.env.MIGRATION_DATABASE_URL) throw new Error("Usage: set MIGRATION_DATABASE_URL explicitly, then pass --file <verified-mapping.json> [--apply --actor <operator-id>].");
  if ((await stat(values.file)).size > 10 * 1024 * 1024) throw new Error("Identity mapping file exceeds 10 MiB.");
  const mapping = validateIdentityMapping(JSON.parse(await readFile(values.file, "utf8")));
  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  try {
    await client.connect();
    console.log(JSON.stringify(await backfillRequestIdentities(client, mapping, { apply: values.apply, actorId: values.actor })));
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
