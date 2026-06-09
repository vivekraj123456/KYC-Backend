const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Starting migration to shift KYC step indices due to IPV merge...");

  // We find all applications where currentStep is >= 15 (which used to be EsignPreview)
  // and decrement it by 1.
  
  const appsToUpdate = await prisma.kycApplication.findMany({
    where: {
      currentStep: {
        gte: 15
      }
    }
  });

  console.log(`Found ${appsToUpdate.length} applications to update.`);

  for (const app of appsToUpdate) {
    const newStep = app.currentStep - 1;
    await prisma.kycApplication.update({
      where: { id: app.id },
      data: { currentStep: newStep }
    });
    console.log(`Updated application ${app.applicationId} from step ${app.currentStep} to ${newStep}`);
  }

  console.log("Migration completed.");
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
