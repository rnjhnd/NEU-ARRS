import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.unmock("@/lib/auth");
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
import { requireAdmin, requireAuth, requireEmployeeOrAdmin } from "../auth";

beforeEach(() => mockAuth.mockReset());

describe("Real server-side role guards", () => {
  it.each(["admin", "employee", "student", undefined])("rejects unauthenticated users regardless of claimed role (%s)", async role => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: { metadata: { role } } });
    await expect(requireAuth()).rejects.toThrow("Unauthorized");
    await expect(requireEmployeeOrAdmin()).rejects.toThrow("Unauthorized");
    await expect(requireAdmin()).rejects.toThrow("Unauthorized");
  });

  it.each(["employee", "student", "superadmin", undefined])("does not grant admin privileges to role %s", async role => {
    mockAuth.mockResolvedValue({ userId: "user123", sessionClaims: { metadata: { role } } });
    await expect(requireAdmin()).rejects.toThrow("Forbidden");
  });

  it.each(["admin", "employee"])("allows role %s to use normal staff operations", async role => {
    mockAuth.mockResolvedValue({ userId: "user123", sessionClaims: { metadata: { role } } });
    await expect(requireEmployeeOrAdmin()).resolves.toBe("user123");
  });

  it.each(["student", "superadmin", undefined])("rejects role %s from staff operations", async role => {
    mockAuth.mockResolvedValue({ userId: "user123", sessionClaims: { metadata: { role } } });
    await expect(requireEmployeeOrAdmin()).rejects.toThrow("Forbidden");
  });

  it("allows an authenticated administrator to override", async () => {
    mockAuth.mockResolvedValue({ userId: "admin123", sessionClaims: { metadata: { role: "admin" } } });
    await expect(requireAdmin()).resolves.toBe("admin123");
  });
});
