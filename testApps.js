const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const apps = await prisma.kycApplication.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 3
  });
  console.log("Last 3 Applications:");
  for (const app of apps) {
    console.log(`App ID: ${app.id}, UpdatedAt: ${app.updatedAt}`);
    const docs = JSON.parse(app.documents || "[]");
    console.log(`  Docs:`, docs.map(d => `${d.type} (issued: ${d.issued}, gen: ${d.generated}, time: ${d.uploadedAt})`));
  }
}
check().catch(console.error).finally(() => prisma.$disconnect());
