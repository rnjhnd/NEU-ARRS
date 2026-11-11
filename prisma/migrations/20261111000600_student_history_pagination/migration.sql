-- Default history ordering and whole-history summary scans, both owner-scoped.
CREATE INDEX "Request_student_history_idx" ON "Request"("studentId", "updatedAt" DESC, "id");
CREATE INDEX "Request_student_summary_idx" ON "Request"("studentId", "status");
