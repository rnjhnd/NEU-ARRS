import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

describe("PayMongo Webhook Handler", () => {
  const MOCK_SECRET = "test_secret_key";
  
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMONGO_WEBHOOK_SECRET = MOCK_SECRET;
  });

  function createMockRequest(payload: object, overrideSignature?: string) {
    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Generate valid signature
    const signaturePayload = `${timestamp}.${rawBody}`;
    const validSignature = crypto
      .createHmac("sha256", MOCK_SECRET)
      .update(signaturePayload)
      .digest("hex");

    const signatureHeader = overrideSignature ?? `t=${timestamp},te=${validSignature},li=`;

    // NextRequest mock
    return new NextRequest("http://localhost/api/webhooks/paymongo", {
      method: "POST",
      headers: {
        "Paymongo-Signature": signatureHeader,
      },
      body: rawBody,
    });
  }

  it("should return 401 if signature is invalid", async () => {
    const req = createMockRequest({ dummy: "data" }, "t=123,te=invalidhash,li=");
    const res = await POST(req);
    
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid signature");
    expect(prisma.request.update).not.toHaveBeenCalled();
  });

  it("should process valid payment webhook and update Prisma", async () => {
    const payload = {
      data: {
        attributes: {
          type: "checkout.session.payment.paid",
          data: {
            attributes: {
              metadata: { requestId: "req_123" },
              payments: [
                { id: "pay_123", attributes: { status: "paid", amount: 15000, source: { type: "gcash" } } }
              ]
            }
          }
        }
      }
    };

    const req = createMockRequest(payload);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.request.update).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        status: "PENDING",
        paymentStatus: "PAID",
        paymongoPaymentId: "pay_123",
        paymongoPaymentType: "gcash",
        amountPaid: 15000,
      },
    });
  });
});
