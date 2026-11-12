import { documentsSnapshotSchema, settingsSnapshotSchema } from "./configuration-model";
import { z } from "zod";

export const roleUserSchema = z.object({ id: z.string().min(1), name: z.string(), email: z.string().nullable(), role: z.enum(["admin", "employee", "student", "unknown"]) }).strict();
export const rolesSnapshotSchema = z.object({ actorId: z.string().min(1), asOf: z.iso.datetime(), users: z.array(roleUserSchema).max(5000) }).strict()
  .refine(data => new Set(data.users.map(user => user.id)).size === data.users.length, "Duplicate accounts");
export type RolesSnapshot = z.infer<typeof rolesSnapshotSchema>;
export class ConfigurationRefreshError extends Error { constructor(readonly status: number) { super("Configuration could not be refreshed. Verify it before making changes."); } }
async function read([url]: readonly [string, string]) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (response.redirected) throw new ConfigurationRefreshError(401);
  if (!response.ok) throw new ConfigurationRefreshError(response.status);
  return response.json() as Promise<unknown>;
}
function sameActor(data: { actorId: string }, actorId: string) { if (data.actorId !== actorId) throw new ConfigurationRefreshError(403); }
export async function fetchDocuments(key: readonly [string, string]) { const result = documentsSnapshotSchema.safeParse(await read(key)); if (!result.success) throw new ConfigurationRefreshError(502); sameActor(result.data, key[1]); return result.data; }
export async function fetchSettings(key: readonly [string, string]) { const result = settingsSnapshotSchema.safeParse(await read(key)); if (!result.success) throw new ConfigurationRefreshError(502); sameActor(result.data, key[1]); return result.data; }
export async function fetchRoles(key: readonly [string, string]) { const result = rolesSnapshotSchema.safeParse(await read(key)); if (!result.success) throw new ConfigurationRefreshError(502); sameActor(result.data, key[1]); return result.data; }
