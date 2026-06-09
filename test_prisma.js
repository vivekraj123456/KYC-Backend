const prisma = require("./src/config/db");

async function main() {
  try {
    const rawId = "KYCMP5FVGTQ4773";
    const numericId = Number(rawId);

    console.log("Searching for:", rawId);
    let app = await prisma.kycApplication.findFirst({
      where: {
        OR: [
          { applicationId: rawId },
          ...(Number.isInteger(numericId) && numericId > 0 ? [{ id: numericId }] : []),
        ],
      },
      include: {
        user: true,
        reviewer: true,
      },
    });
    console.log("Result (exact):", app ? "Found!" : "Null");

    if (!app) {
      app = await prisma.kycApplication.findFirst({
        where: {
          applicationId: {
            contains: rawId,
          },
        },
        include: {
          user: true,
          reviewer: true,
        },
      });
      console.log("Result (contains):", app ? "Found!" : "Null");
    }
  } catch (err) {
    console.error("Prisma error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
