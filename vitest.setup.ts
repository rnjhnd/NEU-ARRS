import { vi } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    roleAccess: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), update: vi.fn() },
    roleChangeOperation: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    requestMoney: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    request: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
    checkoutAttempt: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    documentConfig: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    cronJobState: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    systemSettings: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    notificationOutbox: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("@/lib/notification-wakeup", () => ({ scheduleNotificationDelivery: vi.fn() }));

// Mock Next.js Server Auth
vi.mock("@/lib/auth", async importOriginal => ({
  AccessError: (await importOriginal<typeof import("@/lib/auth")>()).AccessError,
  getVerifiedActor: vi.fn(),
  requireStudent: vi.fn().mockResolvedValue("mock_student_id"),
  requireAuth: vi.fn().mockResolvedValue("mock_student_id"),
  requireAdmin: vi.fn().mockResolvedValue("mock_admin_id"),
  requireEmployeeOrAdmin: vi.fn().mockResolvedValue("mock_employee_id"),
}));

// Mock Next Cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn() as unknown as typeof fetch;
