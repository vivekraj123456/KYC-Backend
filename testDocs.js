const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const latestApp = await prisma.kycApplication.findFirst({
    orderBy: { updatedAt: 'desc' }
  });
  console.log("Documents JSON:");
  const docs = JSON.parse(latestApp.documents || "[]");
  console.dir(docs, { depth: null });
}
check().catch(console.error).finally(() => prisma.$disconnect());
