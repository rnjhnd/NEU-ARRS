CREATE INDEX "Request_staff_queue_idx" ON "Request"("updatedAt" DESC, "id");
CREATE INDEX "Request_staff_status_queue_idx" ON "Request"("status", "updatedAt" DESC, "id");
