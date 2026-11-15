import { z } from "zod";
import { roleSchema } from "./role-policy";

export const sessionActorSchema = z.object({ userId: z.string().min(1), role: roleSchema }).strict();
export const pageAccessSchema = sessionActorSchema.extend({ sessionId: z.string().min(1) }).strict();
export type SessionActor = z.infer<typeof sessionActorSchema>;
export type PageAccess = z.infer<typeof pageAccessSchema>;
