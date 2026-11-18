import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
const { mockAuth, getUser, getSession } = vi.hoisted(() => ({ mockAuth: vi.fn(), getUser: vi.fn(), getSession: vi.fn() }));
vi.unmock("@/lib/auth");
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth, clerkClient: async () => ({ users: { getUser }, sessions: { getSession } }) }));
import { AccessError, getVerifiedAccount, getVerifiedActor, requireAdmin, requireAuth, requireEmployeeOrAdmin, requireStudent } from "../auth";
const session = () => ({ id: "session_a", userId: "user_a", status: "active", expireAt: Date.now() + 60000 });
const user = (role: unknown = "student") => ({ id: "user_a", publicMetadata: { role }, banned: false, locked: false });
beforeEach(() => {
  vi.resetAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_a", sessionId: "session_a", sessionClaims: { metadata: { role: "admin" } } });
  getSession.mockResolvedValue(session()); getUser.mockResolvedValue(user()); vi.mocked(prisma.roleAccess.findUnique).mockResolvedValue(null);
});
describe("current server-side session and role guards", () => {
  it.each([null, "admin", "employee", "student"])("rejects signed-out callers before provider/DB calls (%s)", async role => {
    mockAuth.mockResolvedValue({ userId: null, sessionId: null, sessionClaims: { metadata: { role } } });
    await expect(requireAuth()).rejects.toMatchObject({ status: 401 }); expect(getSession).not.toHaveBeenCalled(); expect(prisma.roleAccess.findUnique).not.toHaveBeenCalled();
  });
  it.each(["admin", "employee", "student"])("uses current provider role %s instead of stale JWT metadata", async role => {
    getUser.mockResolvedValue(user(role));
    await expect(getVerifiedActor()).resolves.toEqual({ userId: "user_a", role });
    if (role === "admin") await expect(requireAdmin()).resolves.toBe("user_a"); else await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    if (role !== "student") await expect(requireEmployeeOrAdmin()).resolves.toBe("user_a"); else await expect(requireEmployeeOrAdmin()).rejects.toMatchObject({ status: 403 });
    if (role === "student") await expect(requireStudent()).resolves.toBe("user_a"); else await expect(requireStudent()).rejects.toMatchObject({ status: 403 });
  });
  it.each(["revoked", "ended", "expired", "abandoned", "pending"])("rejects %s sessions despite a still-valid JWT", async status => {
    getSession.mockResolvedValue({ ...session(), status }); await expect(requireAuth()).rejects.toMatchObject({ status: 401 }); expect(getUser).not.toHaveBeenCalled();
  });
  it.each([{ userId: "other" }, { id: "other" }, { expireAt: 0 }, { expireAt: NaN }])("rejects invalid session ownership/expiry (%j)", async change => {
    getSession.mockResolvedValue({ ...session(), ...change }); await expect(requireAuth()).rejects.toMatchObject({ status: 401 });
  });
  it.each([{ banned: true }, { locked: true }, { id: "other" }, { publicMetadata: { role: "superadmin" } }])("rejects blocked or unknown accounts (%j)", async change => {
    getUser.mockResolvedValue({ ...user(), ...change }); await expect(requireAuth()).rejects.toMatchObject({ status: 403 });
  });
  it("treats missing metadata as student without writing to the identity provider", async () => {
    getUser.mockResolvedValue({ ...user(), publicMetadata: {} }); await expect(requireStudent()).resolves.toBe("user_a"); await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it.each([true, false])("requires managed policy/marker agreement (blocked=%s)", async blocked => {
    getUser.mockResolvedValue({ ...user("admin"), publicMetadata: { role: "admin", roleOperationId: "new" } });
    vi.mocked(prisma.roleAccess.findUnique).mockResolvedValue({ userId: "user_a", role: "admin", operationId: "new", blocked, updatedAt: new Date() });
    if (blocked) await expect(requireAdmin()).rejects.toMatchObject({ status: 403 }); else await expect(requireAdmin()).resolves.toBe("user_a");
  });
  it("rejects a delayed old provider write even if it tries to restore an admin role", async () => {
    getUser.mockResolvedValue({ ...user("admin"), publicMetadata: { role: "admin", roleOperationId: "old" } });
    vi.mocked(prisma.roleAccess.findUnique).mockResolvedValue({ userId: "user_a", role: "student", operationId: "new", blocked: false, updatedAt: new Date() });
    await expect(requireAuth()).rejects.toMatchObject({ status: 403 });
  });
  it.each(["provider", "database"])("fails closed when %s verification is unavailable", async where => {
    if (where === "provider") getSession.mockRejectedValue(new Error("synthetic private provider details")); else vi.mocked(prisma.roleAccess.findUnique).mockRejectedValue(new Error("synthetic private database details"));
    await expect(requireAuth()).rejects.toEqual(new AccessError(503));
  });
  it("overlaps independent profile/policy reads and waits for both before returning an account", async () => {
    const { promise, resolve } = Promise.withResolvers<ReturnType<typeof user>>();
    getUser.mockReturnValue(promise);
    const account = getVerifiedAccount();
    await vi.waitFor(() => expect(prisma.roleAccess.findUnique).toHaveBeenCalledTimes(1));
    expect(getUser).toHaveBeenCalledTimes(1);
    let granted = false;
    void account.then(() => { granted = true; });
    await Promise.resolve();
    expect(granted).toBe(false);
    resolve(user());
    await expect(account).resolves.toMatchObject({ userId: "user_a", role: "student" });
  });
  it("waits for the policy even when the profile is already available", async () => {
    const { promise, resolve } = Promise.withResolvers<null>();
    vi.mocked(prisma.roleAccess.findUnique).mockReturnValue(promise as ReturnType<typeof prisma.roleAccess.findUnique>);
    const account = getVerifiedAccount();
    await vi.waitFor(() => expect(getUser).toHaveBeenCalledTimes(1));
    let granted = false;
    void account.then(() => { granted = true; });
    await Promise.resolve();
    expect(granted).toBe(false);
    resolve(null);
    await expect(account).resolves.toMatchObject({ role: "student" });
  });
  it("returns an allowlisted profile without Clerk metadata or credentials", async () => {
    getUser.mockResolvedValue({ ...user(), firstName: "Synthetic", lastName: "Student", primaryEmailAddress: { emailAddress: "synthetic@example.invalid" }, imageUrl: "https://example.invalid/avatar", privateMetadata: { secret: "never-serialize" }, publicMetadata: { role: "student", unrelated: "never-serialize" }, emailAddresses: [{ id: "private-address-id" }] });
    await expect(getVerifiedAccount()).resolves.toEqual({ userId: "user_a", role: "student", profile: { id: "user_a", firstName: "Synthetic", name: "Synthetic Student", email: "synthetic@example.invalid", imageUrl: "https://example.invalid/avatar" } });
    await expect(getVerifiedActor()).resolves.toEqual({ userId: "user_a", role: "student" });
  });
  it("does not reuse verified profiles between uncached action/route-handler calls", async () => {
    await getVerifiedAccount();
    getSession.mockResolvedValue({ ...session(), status: "revoked" });
    await expect(getVerifiedAccount()).rejects.toMatchObject({ status: 401 });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
