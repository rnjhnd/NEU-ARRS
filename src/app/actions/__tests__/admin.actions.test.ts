import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateRequestStatus } from "../admin.actions";
import { requireAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Request, RequestStatus } from "@prisma/client";

describe("Admin Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail if user is not an admin", async () => {
    // Mock requireAdmin to throw an error
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("Unauthorized"));

    const formData = new FormData();
    formData.append("requestIds", "req_1");
    formData.append("newStatus", RequestStatus.PROCESSING);

    const result = await updateRequestStatus(formData);
    expect(result).toEqual({ success: false, error: "Unauthorized" });
  });

  it("should abort if an illegal status transition is attempted", async () => {
    // Mock the DB to return a request currently in COMPLETED status
    vi.mocked(prisma.request.findMany).mockResolvedValueOnce([
      { id: "cm0x2a3bc000008mia76m2p2g", status: RequestStatus.COMPLETED } as unknown as Request
    ]);

    const formData = new FormData();
    formData.append("requestIds", "cm0x2a3bc000008mia76m2p2g");
    // Trying to move COMPLETED -> PROCESSING (illegal)
    formData.append("newStatus", RequestStatus.PROCESSING);

    const result = await updateRequestStatus(formData);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain("Illegal state transition");
    expect(prisma.request.updateMany).not.toHaveBeenCalled();
  });

  it("should succeed for valid status transitions", async () => {
    // Mock DB: request is PENDING
    vi.mocked(prisma.request.findMany).mockResolvedValueOnce([
      { id: "cm0x2a3bc000008mia76m2p2g", status: RequestStatus.PENDING } as unknown as Request
    ]);

    const formData = new FormData();
    formData.append("requestIds", "cm0x2a3bc000008mia76m2p2g");
    formData.append("newStatus", RequestStatus.PROCESSING);

    const result = await updateRequestStatus(formData);
    
    expect(result.success).toBe(true);
    expect(prisma.request.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["cm0x2a3bc000008mia76m2p2g"] } },
      data: { status: "PROCESSING" },
    });
  });
});
