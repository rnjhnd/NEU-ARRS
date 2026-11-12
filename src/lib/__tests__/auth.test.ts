import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";
const { mockAuth, getUser, getSession } = vi.hoisted(() => ({ mockAuth: vi.fn(), getUser: vi.fn(), getSession: vi.fn() }));
vi.unmock("@/lib/auth");
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth, clerkClient: async () => ({ users: { getUser }, sessions: { getSession } }) }));
import { AccessError, getVerifiedActor, requireAdmin, requireAuth, requireEmployeeOrAdmin, requireStudent } from "../auth";
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
});
