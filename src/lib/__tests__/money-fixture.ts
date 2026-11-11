import type { RequestMoney } from "@prisma/client";
export function moneyFixture(requestId = "cm0x2a3bc000008mia76m2p2g", overrides: Partial<RequestMoney> = {}): RequestMoney {
  return { requestId, currency: "PHP", method: "online", collectedCentavos: 15050, source: "PAYMONGO_PAYMENT", reference: "paymongo:test:pay_test123",
    evidenceId: "verified_fixture", verifiedAt: new Date("2026-11-11T04:00:00Z"), paidAt: null, refundedCentavos: null, refundEvidenceId: null, refundVerifiedAt: null, ...overrides };
}
