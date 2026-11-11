"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyedMutator } from "swr";
import { toast } from "sonner";
import { updateRequestStatus } from "@/app/actions/admin.actions";
import { mergeQueueChanges, type AdminQueue, type QueueItem } from "@/lib/admin-queue-model";

export type QueueUpdate = {
  status: QueueItem["status"]; cancelReason?: string; isOverride?: boolean; overrideReason?: string;
  confirmCashCollected?: boolean; sendCorrection?: boolean;
};
export type QueueUpdateResult = { success: true } | { success: false; error: string };
export type SaveQueueUpdate = (snapshot: QueueItem[], update: QueueUpdate) => Promise<QueueUpdateResult>;

export function useQueueUpdate(mutate: KeyedMutator<AdminQueue>, blocked: boolean, sessionValid: boolean, onCommitted: () => void, requireRefresh: () => void) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = sessionValid; return () => { active.current = false; }; }, [sessionValid]);
  const save: SaveQueueUpdate = async (snapshot, update) => {
    if (inFlight.current || blocked || !snapshot.length || snapshot.length > 50) return { success: false, error: "Refresh the queue and select the requests again." };
    inFlight.current = true; setPending(true);
    try {
      const form = new FormData();
      snapshot.forEach(item => form.append("requestIds", item.id));
      form.set("expectedVersions", JSON.stringify(snapshot.map(item => ({ id: item.id, updatedAt: item.updatedAt }))));
      form.set("newStatus", update.status);
      form.set("isOverride", String(Boolean(update.isOverride)));
      form.set("confirmCashCollected", String(Boolean(update.confirmCashCollected)));
      form.set("sendCorrectionEmail", String(Boolean(update.sendCorrection)));
      if (update.cancelReason) form.set("cancelReason", update.cancelReason.trim());
      if (update.overrideReason) form.set("overrideReason", update.overrideReason.trim());
      const result = await updateRequestStatus(form);
      if (!active.current) return { success: false, error: "Your staff session changed. Reload the queue." };
      if (!result.success) {
        void mutate().catch(() => {});
        toast.error(result.error || "The update was rejected. Refresh before trying again.");
        return { success: false, error: result.error || "The update was rejected. Refresh before trying again." };
      }
      requireRefresh();
      onCommitted();
      toast.success("Updated " + snapshot.length + " request(s) to " + update.status.replace(/_/g, " ") + ".");
      if (result.warning) toast.warning(result.warning);
      // A committed action remains successful even if cache refresh fails.
      void (async () => {
        try {
          await mutate(current => current ? mergeQueueChanges(current, result.changes ?? []) : current, { revalidate: false });
          await mutate();
        } catch { if (active.current) toast.warning("Changes were saved. Refresh the queue before another update."); }
      })();
      return { success: true };
    } catch {
      if (active.current) {
        requireRefresh();
        toast.error("The update could not be confirmed. Refresh the queue before retrying.");
      }
      return { success: false, error: "The update could not be confirmed. Refresh the queue before retrying." };
    } finally { inFlight.current = false; setPending(false); }
  };
  return { save, pending };
}
