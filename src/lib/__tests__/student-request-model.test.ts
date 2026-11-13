import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStudentHistory } from "../student-request-fetcher";
import { DEFAULT_HISTORY_QUERY, historyQuerySchema, historyRefreshInterval, mergeCancelledRequest, studentHistorySchema, studentHistoryURL, toStudentRequest, type StudentRequest } from "../student-request-model";

const row: StudentRequest = { id: "request_a", documentTypeId: "TOR", documentLabel: "Transcript", purpose: "PERSONAL", status: "PENDING_PAYMENT",
  paymentMethod: "online", paymentStatus: "UNPAID", cancelReason: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const history = { studentId: "user_student123", items: [row], summary: { total: 1, active: 1, completed: 0 }, query: DEFAULT_HISTORY_QUERY, totalPages: 1 };
beforeEach(() => vi.resetAllMocks());

describe("Student request display contract", () => {
  it("serializes dates and only includes display fields", () => {
    const source = { ...row, documentType: "GOOD_MORAL", purpose: "PERSONAL" as const, status: "PENDING_PAYMENT" as const,
      paymentStatus: "UNPAID" as const, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
      paymongoPaymentId: "private_provider_reference", studentNumber: "private_number" };
    expect(toStudentRequest(source)).toEqual({ ...row, documentTypeId: "GOOD_MORAL", documentLabel: "Good Moral Certificate" });
    expect(toStudentRequest(source, "Configured Label")).toMatchObject({ documentTypeId: "GOOD_MORAL", documentLabel: "Configured Label" });
  });
  it("rejects malformed timestamps and status values", () => {
    expect(studentHistorySchema.safeParse({ ...history, items: [{ ...row, updatedAt: "invalid" }] }).success).toBe(false);
    expect(studentHistorySchema.safeParse({ ...history, items: [{ ...row, status: "UNKNOWN" }] }).success).toBe(false);
  });
  it("builds a canonical page URL and rejects unbounded or untrusted sort queries", () => {
    expect(studentHistoryURL({ page: 2, sort: "status", direction: "asc" })).toContain("format=history-v3&page=2&sort=status&direction=asc");
    for (const query of [{ page: -1 }, { page: 100001 }, { page: 1.5 }, { sort: "studentId" }, { direction: "DESC NULLS FIRST" }]) {
      expect(historyQuerySchema.safeParse(query).success).toBe(false);
    }
  });
  it("rejects inconsistent or oversized page envelopes", () => {
    for (const invalid of [{ ...history, totalPages: 2 }, { ...history, summary: { total: 1, active: 2, completed: 0 } },
      { ...history, items: [] }, { ...history, query: { ...history.query, page: 2 } },
      { ...history, items: Array.from({ length: 11 }, () => row), summary: { total: 11, active: 11, completed: 0 }, totalPages: 2 }]) {
      expect(studentHistorySchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("polls active histories at 30 seconds and leaves settled histories event-driven", () => {
    expect(historyRefreshInterval(history)).toBe(30000);
    expect(historyRefreshInterval({ ...history, summary: { total: 1, active: 0, completed: 1 } })).toBe(0);
    expect(historyRefreshInterval()).toBe(0);
  });
  it("uses authoritative cancellation results without overwriting newer polled state", () => {
    const saved = { ...row, status: "CANCELLED" as const, updatedAt: "2026-01-02T00:00:00.000Z" };
    expect(mergeCancelledRequest(history, saved).items[0].status).toBe("CANCELLED");
    expect(mergeCancelledRequest(history, saved).summary).toEqual({ total: 1, active: 0, completed: 0 });
    expect(mergeCancelledRequest(mergeCancelledRequest(history, saved), saved).summary.active).toBe(0);
    const newer = { ...history, items: [{ ...row, updatedAt: "2026-01-03T00:00:00.000Z" }] };
    expect(mergeCancelledRequest(newer, saved).items[0].status).toBe("PENDING_PAYMENT");
    expect(history.items[0].status).toBe("PENDING_PAYMENT");
  });
});

describe("Request history refresh boundary", () => {
  it("validates successful data and requests an uncached response", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(history));
    expect(await fetchStudentHistory(["/api/student/requests", history.studentId])).toEqual(history);
    expect(fetch).toHaveBeenCalledWith("/api/student/requests", expect.objectContaining({ cache: "no-store" }));
  });
  it.each([401, 403, 500])("rejects HTTP %s before parsing its body", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("private error body", { status }));
    await expect(fetchStudentHistory(["/api/student/requests", history.studentId])).rejects.toMatchObject({ status });
  });
  it.each([{ error: "not a list" }, { ...history, items: {} }, { ...history, items: [{ ...row, updatedAt: "bad" }] }])("rejects malformed JSON shapes", async response => {
    vi.mocked(fetch).mockResolvedValue(Response.json(response));
    await expect(fetchStudentHistory(["/api/student/requests", history.studentId])).rejects.toMatchObject({ status: 502 });
  });
  it("refuses a different authenticated student's response", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ ...history, studentId: "user_other" }));
    await expect(fetchStudentHistory(["/api/student/requests", history.studentId])).rejects.toMatchObject({ status: 401 });
  });
  it("rejects the wrong page/sort while accepting a server-clamped page", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(history));
    await expect(fetchStudentHistory([studentHistoryURL({ page: 1, sort: "status", direction: "asc" }), history.studentId])).rejects.toMatchObject({ status: 502 });
    vi.mocked(fetch).mockResolvedValue(Response.json(history));
    expect(await fetchStudentHistory([studentHistoryURL({ ...DEFAULT_HISTORY_QUERY, page: 2 }), history.studentId])).toEqual(history);
    const otherPage = { ...history, summary: { total: 11, active: 11, completed: 0 }, totalPages: 2, query: { ...history.query, page: 2 } };
    vi.mocked(fetch).mockResolvedValue(Response.json(otherPage));
    await expect(fetchStudentHistory([studentHistoryURL(DEFAULT_HISTORY_QUERY), history.studentId])).rejects.toMatchObject({ status: 502 });
  });
  it("rejects HTML and followed login redirects without treating them as an empty list", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>login</html>"));
    await expect(fetchStudentHistory(["/api/student/requests", history.studentId])).rejects.toThrow();
    const redirected = Response.json(history); Object.defineProperty(redirected, "redirected", { value: true });
    vi.mocked(fetch).mockResolvedValueOnce(redirected);
    await expect(fetchStudentHistory(["/api/student/requests", history.studentId])).rejects.toMatchObject({ status: 401 });
  });
});
