import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { finishCancellationRefunds } from "../cancellation-refunds";
import { reconcileCancelledPayment } from "../cancelled-payment-reconciliation";
import { refundPayment } from "../paymongo";

vi.mock("../cancelled-payment-reconciliation", () => ({ reconcileCancelledPayment: vi.fn() }));
vi.mock("../paymongo", () => ({ refundPayment: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11")); });
afterEach(() => vi.useRealTimers());

it("bounds post-cancellation work and reports requests left for manual recovery", async () => {
  const requests = Array.from({ length: 4 }, (_, index) => ({ id: "request_" + index, paymentMethod: "online", paymentStatus: "UNPAID" as const, paymongoPaymentId: null }));
  let active = 0;
  let peak = 0;
  vi.mocked(reconcileCancelledPayment).mockImplementation(async () => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    vi.setSystemTime(new Date("2026-11-11T00:00:31Z"));
    active--;
    return { resolved: true, message: "Closed" };
  });
  expect(await finishCancellationRefunds(requests, "actor", "Cancelled by student")).toEqual({ reviewIds: ["request_3"], refundedIds: [] });
  expect(peak).toBe(3);
  expect(reconcileCancelledPayment).toHaveBeenCalledTimes(3);
  expect(refundPayment).not.toHaveBeenCalled();
});

it("keeps a committed cancellation successful when unpaid closure fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(reconcileCancelledPayment).mockRejectedValue(new Error("Synthetic provider error"));
  expect(await finishCancellationRefunds([{ id: "request_1", paymentMethod: "online", paymentStatus: "UNPAID", paymongoPaymentId: null }], "actor", "Cancelled"))
    .toEqual({ reviewIds: ["request_1"], refundedIds: [] });
  vi.restoreAllMocks();
});
