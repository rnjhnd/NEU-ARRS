-- Range-limited finance reads ordered by submission time and stable ID.
CREATE INDEX "Request_finance_period_idx" ON "Request"("createdAt", "id");
