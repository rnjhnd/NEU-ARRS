const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Altering column type...');
  await prisma.$executeRawUnsafe('ALTER TABLE "Request" ALTER COLUMN "documentType" TYPE text USING "documentType"::text;');
  console.log('Dropping enum type if exists...');
  await prisma.$executeRawUnsafe('DROP TYPE IF EXISTS "DocumentType";');
  console.log('Success!');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
