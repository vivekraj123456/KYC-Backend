const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const latestApp = await prisma.kycApplication.findFirst({
    orderBy: { updatedAt: 'desc' }
  });
  console.log("Latest App OCR Data Digio:", JSON.stringify(latestApp.ocrData?.digio, null, 2));
}
check().catch(console.error).finally(() => prisma.$disconnect());
