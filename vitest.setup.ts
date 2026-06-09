import { vi } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  default: {
    request: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock Next.js Server Auth
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue("mock_student_id"),
  requireAdmin: vi.fn().mockResolvedValue("mock_admin_id"),
}));

// Mock Next Cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock global fetch
global.fetch = vi.fn() as unknown as typeof fetch;
