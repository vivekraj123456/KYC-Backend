const digioClient = require('./src/services/digioClient');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDownload() {
  const app = await prisma.kycApplication.findFirst({ orderBy: { updatedAt: 'desc' } });
  const digioData = JSON.parse(app.ocrData || "{}").digio || {};
  const requestId = digioData.DIGILOCKER?.requestId;
  if (!requestId) return console.log("No DIGILOCKER request ID found");

  const response = await digioClient.getKycRequestResponse(requestId);
  const actions = response.actions || [];
  let execId = null;
  for (const a of actions) {
    if (a.type?.toLowerCase() === "digilocker" && a.execution_request_id) {
      execId = a.execution_request_id;
      break;
    }
  }

  if (!execId) return console.log("No execution_request_id found");
  console.log("Found execId:", execId);

  try {
    const panResponse = await digioClient.downloadKycMedia(execId, { docType: "PAN", xml: false, base64: false });
    console.log("PAN Download Response Headers:", panResponse.headers);
    console.log("PAN Download Buffer Length:", panResponse.data ? panResponse.data.length : 0);
  } catch (err) {
    console.error("PAN Download Error:", err.response?.data?.toString() || err.message);
  }
}
testDownload().catch(console.error).finally(() => prisma.$disconnect());
