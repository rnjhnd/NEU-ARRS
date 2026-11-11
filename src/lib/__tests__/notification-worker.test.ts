import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type CronJobState, type NotificationOutbox } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deliverNotificationOutbox } from "../notification-worker";

const NOW = new Date("2026-11-11T04:00:00Z");
const ID = "cm0x2a3bc000008mia76m2p2g";
const EMAIL_ID = "ad602791-fc9d-4f2c-babb-cb501dc54ed9";
let rows: NotificationOutbox[];
let job: CronJobState;
let version: number;
let owner: string;
let failAcceptance: boolean;
function fixture(changes: Partial<NotificationOutbox> = {}): NotificationOutbox {
  return { id: ID, requestId: "cm0x2a3bc000008mia76m2p2a", version: 1, studentId: "user_student123", status: "PROCESSING", correction: false,
    content: { studentName: "Synthetic Student", documentType: "TOR", status: "PROCESSING", cancelReason: null, customMessage: "Your document is being processed." },
    state: "QUEUED", payload: null, firstAttemptAt: null, credentialFingerprint: null, attempts: 0, retryLimit: 5,
    nextAttemptAt: NOW, leaseToken: null, providerEmailId: null, lastError: null, sentAt: null, createdAt: NOW, updatedAt: NOW, ...changes };
}
const recipient = (verified = true) => Response.json({ id: "user_student123", primary_email_address_id: "email_primary", email_addresses: [
  { id: "email_primary", email_address: "student@example.invalid", verification: { status: verified ? "verified" : "unverified" } },
] });
const sends = () => vi.mocked(fetch).mock.calls.filter(call => call[0] === "https://api.resend.com/emails");

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("RESEND_API_KEY", "re_synthetic"); vi.stubEnv("RESEND_FROM_EMAIL", "registrar@example.invalid");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_synthetic"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.invalid");
  rows = [fixture()]; version = 1; owner = "user_student123"; failAcceptance = false;
  job = { name: "deliver-notifications", leaseToken: null, leaseUntil: new Date(0), cursorId: null, cursorCreatedAt: null, updatedAt: NOW };
  vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(prisma));
  vi.mocked(prisma.cronJobState.upsert).mockResolvedValue(job);
  vi.mocked(prisma.cronJobState.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => {
    const time = where?.leaseUntil as { lte?: Date; gt?: Date } | undefined;
    if ((where?.leaseToken !== undefined && where.leaseToken !== job.leaseToken) ||
        (time?.lte && job.leaseUntil > time.lte) || (time?.gt && job.leaseUntil <= time.gt)) return { count: 0 };
    Object.assign(job, data); return { count: 1 };
  });
  vi.mocked(prisma.request.findUnique, { partial: true }).mockImplementation(async () => ({ studentId: owner, status: "PROCESSING", notificationVersion: version }));
  vi.mocked(prisma.notificationOutbox.findMany).mockImplementation((async args => rows.filter(row => ["QUEUED", "IN_FLIGHT"].includes(row.state) && row.nextAttemptAt <= new Date()).slice(0, args?.take ?? 10).map(row => structuredClone(row))) as typeof prisma.notificationOutbox.findMany);
  vi.mocked(prisma.notificationOutbox.findUnique, { partial: true }).mockImplementation(async ({ where }) => {
    const row = rows.find(row => row.id === where.id); return row ? structuredClone(row) : null;
  });
  const apply = (where: Prisma.NotificationOutboxWhereInput | undefined, data: Prisma.NotificationOutboxUpdateManyMutationInput) => {
    const row = rows.find(row => row.id === where?.id);
    if (!row || (where?.leaseToken !== undefined && where.leaseToken !== row.leaseToken) ||
        (typeof where?.state === "string" && where.state !== row.state) ||
        (where?.firstAttemptAt === null && row.firstAttemptAt !== null)) return null;
    if (data.state === "SENT" && failAcceptance) { failAcceptance = false; throw new Error("Synthetic result-save outage"); }
    for (const [key, value] of Object.entries(data)) {
      if (key === "attempts" && typeof value === "object") row.attempts += (value as { increment: number }).increment;
      else Object.assign(row, { [key]: value });
    }
    row.updatedAt = new Date(); return structuredClone(row);
  };
  vi.mocked(prisma.notificationOutbox.update, { partial: true }).mockImplementation(async ({ where, data }) => {
    const result = apply(where, data as Prisma.NotificationOutboxUpdateManyMutationInput);
    if (!result) throw new Prisma.PrismaClientKnownRequestError("Changed", { code: "P2025", clientVersion: "7.10.1" });
    return result;
  });
  vi.mocked(prisma.notificationOutbox.updateMany, { partial: true }).mockImplementation(async ({ where, data }) => ({ count: apply(where, data) ? 1 : 0 }));
  vi.mocked(prisma.auditLog.create, { partial: true }).mockResolvedValue({ id: "audit_synthetic" });
  vi.mocked(fetch).mockImplementation(async url => String(url).startsWith("https://api.clerk.com/") ? recipient() : Response.json({ id: EMAIL_ID }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("Durable notification delivery", () => {
  it("freezes a verified primary recipient and marks provider acceptance atomically", async () => {
    expect(await deliverNotificationOutbox()).toMatchObject({ accepted: 1, processed: 1 });
    expect(rows[0]).toMatchObject({ state: "SENT", attempts: 1, providerEmailId: EMAIL_ID, firstAttemptAt: NOW, sentAt: NOW, leaseToken: null });
    expect(job.leaseToken).toBeNull();
    const payload = JSON.parse(String(sends()[0][1]?.body));
    expect(payload.to).toEqual(["student@example.invalid"]);
    expect(payload.from).toBe("Registrar <registrar@example.invalid>");
    expect(payload.html).toContain("https://app.example.invalid/dashboard");
    expect(payload.html).toContain("Status recorded at");
    expect(sends()[0][1]?.headers).toMatchObject({ "Idempotency-Key": "notification:" + ID });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "NOTIFICATION_ACCEPTED" }) }));
  });
  it("does not treat an HTTP 200 error envelope as accepted", async () => {
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("api.clerk.com") ? recipient() : Response.json({ data: null, error: { message: "Do not log this private body" } }));
    expect(await deliverNotificationOutbox()).toMatchObject({ accepted: 0, retrying: 1 });
    expect(rows[0].state).toBe("QUEUED"); expect(rows[0].lastError).toBe("delivery_result_unconfirmed");
  });
  it.each([429, 500, 503, 409])("retains transient HTTP %s for bounded retry", async status => {
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("api.clerk.com") ? recipient() : new Response(null, { status }));
    expect(await deliverNotificationOutbox()).toMatchObject({ retrying: 1 });
    expect(rows[0].payload).not.toBeNull(); expect(rows[0].state).toBe("QUEUED");
  });
  it.each([400, 401, 403, 422])("puts terminal HTTP %s in operator review", async status => {
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("api.clerk.com") ? recipient() : new Response("private provider response", { status }));
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 });
    expect(rows[0].lastError).toBe("provider_http_" + status);
  });
  it("retries uncertain sends with identical body and key after recipient/settings changes", async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes("api.clerk.com")) return recipient();
      throw new Error("Synthetic timeout after acceptance");
    });
    await deliverNotificationOutbox();
    const original = sends()[0][1];
    vi.stubEnv("RESEND_FROM_EMAIL", "changed@example.invalid"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://changed.invalid");
    rows[0].content = { changed: "must never be rerendered after the first POST" };
    vi.setSystemTime(new Date(NOW.getTime() + 180000));
    vi.mocked(fetch).mockResolvedValue(Response.json({ id: EMAIL_ID }));
    expect(await deliverNotificationOutbox()).toMatchObject({ accepted: 1 });
    expect(sends()[1][1]?.body).toBe(original?.body);
    expect(sends()[1][1]?.headers).toEqual(original?.headers);
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).includes("api.clerk.com"))).toHaveLength(1);
  });
  it("recovers a successful provider send when local acceptance storage failed", async () => {
    failAcceptance = true;
    await deliverNotificationOutbox();
    expect(rows[0].state).toBe("QUEUED");
    const body = sends()[0][1]?.body;
    vi.setSystemTime(new Date(NOW.getTime() + 180000));
    expect(await deliverNotificationOutbox()).toMatchObject({ accepted: 1 });
    expect(sends()[1][1]?.body).toBe(body);
    expect(new Set(sends().map(call => (call[1]?.headers as Record<string, string>)["Idempotency-Key"])).size).toBe(1);
  });
  it.each([23, 24, 48])("stops sending after %s hours instead of reusing an expired key", async hours => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes("api.clerk.com")) return recipient();
      throw new Error("Uncertain POST");
    });
    await deliverNotificationOutbox(); vi.setSystemTime(new Date(NOW.getTime() + hours * 3600000));
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 });
    expect(sends()).toHaveLength(1); expect(rows[0].lastError).toBe("retry_window_expired");
  });
  it("blocks uncertain retries after a sender credential change", async () => {
    vi.mocked(fetch).mockImplementation(async url => { if (String(url).includes("api.clerk.com")) return recipient(); throw new Error("Uncertain"); });
    await deliverNotificationOutbox(); vi.stubEnv("RESEND_API_KEY", "re_different_account"); vi.setSystemTime(new Date(NOW.getTime() + 180000));
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 }); expect(sends()).toHaveLength(1);
  });
  it("supersedes an obsolete unattempted workflow version without sending", async () => {
    version = 2;
    expect(await deliverNotificationOutbox()).toMatchObject({ superseded: 1 });
    expect(rows[0].firstAttemptAt).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it("rechecks the workflow after recipient lookup before freezing a POST", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => { version = 2; return recipient(); });
    expect(await deliverNotificationOutbox()).toMatchObject({ superseded: 1 });
    expect(sends()).toHaveLength(0); expect(rows[0].payload).toBeNull();
  });
  it("does not send to a previous student's identity after ownership changes", async () => {
    owner = "user_other";
    expect(await deliverNotificationOutbox()).toMatchObject({ superseded: 1 }); expect(fetch).not.toHaveBeenCalled();
  });
  it("never falls back to an unverified email address", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(recipient(false));
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 });
    expect(sends()).toHaveLength(0); expect(rows[0].lastError).toBe("primary_email_unverified");
  });
  it.each(["RESEND_FROM_EMAIL", "RESEND_API_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_APP_URL"])("retains missing %s configuration for review without a send", async name => {
    vi.stubEnv(name, undefined);
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 }); expect(sends()).toHaveLength(0);
  });
  it("leaves rows unchanged when another worker owns the job lease", async () => {
    job.leaseToken = "other"; job.leaseUntil = new Date(NOW.getTime() + 120000);
    expect(await deliverNotificationOutbox()).toMatchObject({ busy: true, processed: 0 });
    expect(prisma.notificationOutbox.findMany).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("cannot acknowledge a send or release a newer worker's lease", async () => {
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes("api.clerk.com")) return recipient();
      job.leaseToken = "new_owner"; return Response.json({ id: EMAIL_ID });
    });
    await expect(deliverNotificationOutbox()).rejects.toThrow();
    expect(rows[0].state).toBe("IN_FLIGHT"); expect(job.leaseToken).toBe("new_owner");
  });
  it("bounds one run to ten messages", async () => {
    rows = Array.from({ length: 12 }, (_, index) => fixture({ id: "c" + String(index).padStart(24, "0"), requestId: "r" + index }));
    expect(await deliverNotificationOutbox()).toMatchObject({ processed: 10, accepted: 10 });
    expect(rows.filter(row => row.state === "QUEUED")).toHaveLength(2);
  });
  it("stops launching sends after its work budget", async () => {
    rows = [fixture(), fixture({ id: "cm0x2a3bc000008mia76m2p2b", requestId: "another" })];
    vi.mocked(fetch).mockImplementation(async url => {
      if (String(url).includes("api.clerk.com")) return recipient();
      vi.setSystemTime(new Date(NOW.getTime() + 31000)); return Response.json({ id: EMAIL_ID });
    });
    expect(await deliverNotificationOutbox()).toMatchObject({ processed: 1, accepted: 1 });
  });
  it("stops automatic attempts after the retry limit", async () => {
    rows[0].attempts = 5;
    expect(await deliverNotificationOutbox()).toMatchObject({ review: 1 }); expect(fetch).not.toHaveBeenCalled();
  });
});
