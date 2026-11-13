"use client";

import { useEffect, useRef, useState } from "react";
import { reviewRequestIdentity } from "@/app/actions/identity.actions";
import { Button } from "@/components/ui/button";
import type { QueueItem } from "@/lib/admin-queue-model";

export function IdentityReview({ request, disabled, onPendingChange, onSaved }: {
  request: QueueItem; disabled: boolean; onPendingChange: (pending: boolean) => void; onSaved: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false), flight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const terminal = request.status === "COMPLETED" || request.status === "CANCELLED";
  return <section aria-label="Academic identity review" className="space-y-3 rounded border p-4">
    <p className="font-semibold">Academic identity: {request.identityVerified ? "Verified by registrar" : terminal ? "No active attestation recorded" : "Awaiting registrar verification"}</p>
    {request.identityVerifiedAt && <p className="text-xs">Verified {new Date(request.identityVerifiedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>}
    <p className="text-sm">Check the signed-in account holder, full name and student number against school records. Login and payment alone do not verify academic identity. Review applies to this request only.</p>
    {terminal && <p className="text-xs">A review recorded now does not establish that identity was verified before the earlier completion or cancellation.</p>}
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (disabled || flight.current || !confirmed || reason.trim().length < 10) return;
      flight.current = true; setPending(true); onPendingChange(true); setError("");
      try {
        const form = new FormData();
        Object.entries({ requestId: request.id, expectedVersion: request.updatedAt,
          decision: request.identityVerified ? "revoke" : "verify", reason, recordsChecked: "true" }).forEach(([key, value]) => form.set(key, value));
        const result = await reviewRequestIdentity(form);
        if (!active.current) return;
        if (result.success) onSaved(); else setError(result.error ?? "Review could not be confirmed. Refresh before retrying.");
      } catch { if (active.current) setError("Review could not be confirmed. Refresh before retrying."); }
      finally { flight.current = false; if (active.current) setPending(false); onPendingChange(false); }
    }}>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={disabled || pending} onChange={event => setConfirmed(event.target.checked)} />
        {request.identityVerified ? "I confirm this attestation must be revoked." : "I checked school records and confirmed this account holder owns the stated student identity."}</label>
      <label className="block space-y-1 text-sm"><span>{request.identityVerified ? "Revocation reason" : "Review reference or reason"}</span>
        <textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={500} required disabled={disabled || pending} className="w-full rounded border bg-background p-2" />
      </label>
      <p className="text-xs text-muted-foreground">Record a brief school-record reference. Do not enter ID images, passwords or sensitive document contents.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="outline" disabled={disabled || pending || !confirmed || reason.trim().length < 10}>
        {pending ? "Saving review..." : request.identityVerified ? "Revoke identity verification" : "Verify student identity"}
      </Button>
    </form>
  </section>;
}
