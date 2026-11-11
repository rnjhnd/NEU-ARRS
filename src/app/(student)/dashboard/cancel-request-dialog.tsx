"use client";

import { useEffect, useRef, useState } from "react";
import type { Request } from "@prisma/client";
import { toast } from "sonner";
import { cancelStudentRequest } from "@/app/actions/request.actions";
import type { StudentRequest } from "@/lib/student-request-model";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CancelRequestDialog({ request, onClose, onCommitted, canCancel }: {
  request: StudentRequest; onClose: () => void; onCommitted: (saved: Request) => void; canCancel: boolean;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const eligible = canCancel && request.status === "PENDING_PAYMENT";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || !eligible || !reason.trim()) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      const result = await cancelStudentRequest(request.id, reason.trim());
      if (!active.current) return;
      if (!result.success || !result.request) { setError(result.error || "Cancellation was not confirmed. Refresh before retrying."); return; }
      toast.success("Request cancelled successfully.");
      if (result.warning) toast.warning(result.warning);
      onCommitted(result.request);
      onClose();
    } catch { setError("Cancellation could not be confirmed. Refresh the history before trying again."); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="sm:max-w-[425px]" showCloseButton={!pending}>
      <form onSubmit={submit} className="space-y-4" aria-busy={pending}>
        <DialogHeader><DialogTitle>Cancel Request</DialogTitle>
          <DialogDescription>Provide a reason for cancelling this request. Check with the registrar about any unconfirmed payment or refund.</DialogDescription>
        </DialogHeader>
        <label htmlFor={"cancel-reason-" + request.id} className="text-sm font-medium">Cancellation reason</label>
        <textarea id={"cancel-reason-" + request.id} value={reason} onChange={event => setReason(event.target.value)}
          maxLength={1000} required disabled={pending} className="min-h-24 w-full rounded border p-3" />
        {!eligible && <p role="alert">This request changed and can no longer be cancelled here.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Back</Button>
          <Button type="submit" variant="destructive" disabled={pending || !eligible || !reason.trim()}>
            {pending ? "Cancelling..." : "Confirm Cancellation"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
