"use client";

import { useEffect, useRef, useState } from "react";
import { reconcileCancelledRequest } from "@/app/actions/payment-reconciliation.actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CancelledPaymentReview({ request, onReconciled, disabled = false, onPendingChange }: {
  request: { id: string; updatedAt: Date | string }; onReconciled: () => void; disabled?: boolean; onPendingChange?: (pending: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return (
    <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={async event => {
      event.preventDefault();
      if (inFlight.current || disabled || reason.trim().length < 5) return;
      inFlight.current = true; setPending(true); onPendingChange?.(true);
      try {
        const form = new FormData();
        form.set("requestId", request.id);
        form.set("expectedVersion", new Date(request.updatedAt).toISOString());
        form.set("reason", reason);
        const result = await reconcileCancelledRequest(form);
        if (!active.current) return;
        if (!result.success) toast.error(result.error);
        else {
          if (result.resolved) toast.success(result.message);
          else toast.warning(result.message);
          onReconciled();
        }
      } catch { if (active.current) toast.error("Payment review could not be confirmed. Refresh before checking again."); }
      finally { inFlight.current = false; setPending(false); onPendingChange?.(false); }
    }}>
      <p className="text-sm font-semibold">Cancelled payment review</p>
      <p className="text-xs text-muted-foreground">Check payment and refund records, close an unpaid checkout, or confirm a completed refund. This action does not issue a refund or reopen the request.</p>
      <Label htmlFor="payment-review-reason">Reason for review</Label>
      <textarea id="payment-review-reason" value={reason} onChange={event => setReason(event.target.value)} required minLength={5} maxLength={1000} disabled={pending || disabled} className="w-full rounded-md border border-input bg-background p-3 text-sm" />
      <Button type="submit" disabled={pending || disabled || reason.trim().length < 5}>{pending ? "Checking payment…" : "Reconcile payment"}</Button>
    </form>
  );
}
