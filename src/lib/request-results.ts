import type { StudentRequestChange } from "./student-request-model";
import type { QueueChange } from "./admin-queue-model";

export type SubmissionResult = { success: true; requestId: string; redirectUrl?: string; error?: never; code?: never } |
  { success: false; requestId?: string; redirectUrl?: never; error: string; code?: "invalid" };
export type CancellationResult = { success: true; request: StudentRequestChange; warning?: string; error?: never } |
  { success: false; request?: never; warning?: never; error: string };
export type CheckoutResult = { success: true; redirectUrl: string; error?: never } | { success: false; redirectUrl?: never; error: string };
export type StatusChangeResult = { success: true; changes: QueueChange[]; warning?: string; error?: never } |
  { success: false; changes?: never; warning?: never; error: string };
