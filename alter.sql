ALTER TABLE "Request" ALTER COLUMN "documentType" TYPE text USING "documentType"::text;
DROP TYPE IF EXISTS "DocumentType";
