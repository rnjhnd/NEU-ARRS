import { z } from "zod";
export const roleSchema = z.enum(["admin", "employee", "student"]);
export type AppRole = z.infer<typeof roleSchema>;
export function providerRole(value: unknown): AppRole | null {
  if (value == null) return "student";
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
export function effectiveRole(metadata: { role?: unknown; roleOperationId?: unknown }, access: {
  role: string; operationId: string; blocked: boolean;
} | null): AppRole | null {
  const role = providerRole(metadata.role);
  if (!role || access && (access.blocked || access.role !== role || access.operationId !== metadata.roleOperationId)) return null;
  return role;
}
export const roleIntentSchema = z.object({ targetId: z.string().min(1).max(255), previousRole: roleSchema, nextRole: roleSchema, intentId: z.uuid(), expectedOperationId: z.string().min(1).max(255).default("unmanaged") }).strict();
export const roleOperationSchema = z.object({ id: z.string(), targetId: z.string(), previousRole: roleSchema, nextRole: roleSchema,
  stage: z.enum(["PREPARED", "APPLYING", "REVOKING", "COMPLETE", "REJECTED"]) }).strict();
export type RoleOperationView = z.infer<typeof roleOperationSchema>;
