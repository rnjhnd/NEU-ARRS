const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Configs:', await prisma.documentConfig.findMany());
  const reqs = await prisma.request.findMany({ select: { id: true, documentType: true } });
  console.log('Requests:', reqs.slice(0, 5));
}
main().catch(console.error).finally(() => prisma.$disconnect());
