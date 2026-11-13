import "server-only";
import prisma from "../prisma";
import { movementVersion } from "../money-movement-data";
export class DateEvidenceError extends Error {}
export async function applyMovementDate(actorId: string, input: { requestId: string; kind: "COLLECTION" | "REFUND"; version: string; reason: string }, occurredAt: Date) {
  const { requestId, kind, version, reason } = input;
  await prisma.$transaction(async tx => {
    // Collection/refund amounts/evidence are immutable. Lock the canonical row
    // so an enrichment cannot race a second date review or financial write.
    await tx.$queryRaw`SELECT "requestId" FROM "RequestMoney" WHERE "requestId" = ${requestId} FOR UPDATE`;
    const money = await tx.requestMoney.findUnique({ where: { requestId }, include: { dates: true } });
    const amount = kind === "COLLECTION" ? money?.collectedCentavos : money?.refundedCentavos;
    const evidenceId = kind === "COLLECTION" ? money?.evidenceId : money?.refundEvidenceId;
    if (!money || amount == null || !evidenceId || movementVersion(requestId, kind, amount, evidenceId) !== version) throw new DateEvidenceError("The movement changed or has no confirmed evidence. Refresh before reviewing.");
    if (kind === "COLLECTION" && money.paidAt || money.dates.some(date => date.kind === kind)) throw new DateEvidenceError("This movement already has an evidenced date. It cannot be overwritten; reconcile conflicting evidence separately.");
    const collectionAt = money.paidAt ?? money.dates.find(date => date.kind === "COLLECTION")?.occurredAt;
    const refundAt = money.dates.find(date => date.kind === "REFUND")?.occurredAt;
    if (kind === "REFUND" && collectionAt && occurredAt < collectionAt || kind === "COLLECTION" && refundAt && occurredAt > refundAt) throw new DateEvidenceError("Refund occurrence cannot precede the evidenced collection. Reconcile conflicting records.");
    const audit = await tx.auditLog.create({ data: { adminId: actorId, requestId, action: "MONEY_MOVEMENT_DATE_ATTESTED",
      details: JSON.stringify({ kind, occurredAt: occurredAt.toISOString(), reason, amountCentavos: amount, originalEvidenceId: evidenceId, source: "registrar_original_evidence" }) } });
    await tx.moneyMovementDate.create({ data: { requestId, kind, occurredAt, evidenceId: audit.id } });
  }, { maxWait: 2000, timeout: 8000 });
}
