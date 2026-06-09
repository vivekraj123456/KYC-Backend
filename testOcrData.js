const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const app = await prisma.kycApplication.findFirst({
    where: { ocrData: { not: null } },
    orderBy: { updatedAt: 'desc' }
  });
  console.log(JSON.stringify(app.ocrData, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
