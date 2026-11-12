import { beforeEach, expect, it, vi } from "vitest";
import { CONFIG_URL, SETTING_KEYS } from "../configuration-model";
import { fetchDocuments, fetchRoles, fetchSettings } from "../configuration-fetcher";
import { loadRoleAccounts } from "../configuration-roles";
import { requireAdmin } from "@/lib/auth";
const { getUserList } = vi.hoisted(() => ({ getUserList: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUserList } }) }));
const head = { actorId: "admin", asOf: "2026-11-12T00:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireAdmin).mockResolvedValue("admin"); });
it("accepts validated same-actor snapshots for each area", async () => {
  const documents = { ...head, items: [] }, settings = { ...head, entries: SETTING_KEYS.map(key => ({ key, value: null, version: null, valid: true })) }, roles = { ...head, users: [] };
  for (const [area, fn, body] of [["documents", fetchDocuments, documents], ["settings", fetchSettings, settings], ["roles", fetchRoles, roles]] as const) {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body)); expect(await fn([CONFIG_URL + area, "admin"])).toEqual(body);
  }
  expect(fetch).toHaveBeenCalledWith(CONFIG_URL + "documents", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
});
it.each([401, 403, 404, 409, 500])("preserves HTTP failure status %s", async status => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status }));
  await expect(fetchDocuments([CONFIG_URL + "documents", "admin"])).rejects.toMatchObject({ status });
});
it("distinguishes malformed data from access failures and rejects redirects/actor changes", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
  await expect(fetchDocuments([CONFIG_URL + "documents", "admin"])).rejects.toMatchObject({ status: 502 });
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...head, actorId: "other", items: [] }));
  await expect(fetchDocuments([CONFIG_URL + "documents", "admin"])).rejects.toMatchObject({ status: 403 });
  const redirected = Response.json({ ...head, items: [] }); Object.defineProperty(redirected, "redirected", { value: true }); vi.mocked(fetch).mockResolvedValueOnce(redirected);
  await expect(fetchDocuments([CONFIG_URL + "documents", "admin"])).rejects.toMatchObject({ status: 401 });
});
it("pages a complete role list, projects primary contacts and marks unknown roles for review", async () => {
  const accounts = Array.from({ length: 505 }, (_, i) => ({ id: "user_" + i, firstName: "Synthetic", lastName: String(i), publicMetadata: { role: i === 504 ? "owner" : "student" }, imageUrl: "", primaryEmailAddressId: "primary", emailAddresses: [{ id: "secondary", emailAddress: "secondary@example.invalid" }, { id: "primary", emailAddress: "primary@example.invalid" }], privateMetadata: { confidential: true } }));
  getUserList.mockImplementation(async ({ offset, limit }: { offset: number; limit: number }) => ({ data: accounts.slice(offset, offset + limit), totalCount: accounts.length }));
  const snapshot = await loadRoleAccounts(); expect(snapshot.users).toHaveLength(505); expect(snapshot.users[504]).toMatchObject({ role: "unknown", email: "primary@example.invalid" });
  expect(getUserList).toHaveBeenCalledTimes(2); expect(JSON.stringify(snapshot)).not.toContain("privateMetadata"); expect(JSON.stringify(snapshot)).not.toContain("secondary@example");
});
it("does not query provider identities before administrator authorization", async () => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Forbidden")); await expect(loadRoleAccounts()).rejects.toThrow("Forbidden"); expect(getUserList).not.toHaveBeenCalled();
});
