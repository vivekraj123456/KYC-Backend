const { generateKycPdf } = require('./src/utils/pdfGenerator');
const fs = require('fs');

async function test() {
  const mockData = {
    personalDetails: { fullName: "Test User", dob: "1990-01-01" },
    identityDetails: { pan: "ABCDE1234F", aadhaar: "123456789012" },
    address: { line1: "Test Address", city: "Mumbai", state: "MH", pincode: "400001" },
    bankDetails: { bankName: "Test Bank", accountNumber: "123456789", ifsc: "TEST000123" }
  };

  try {
    console.log("Generating PDF...");
    const base64 = await generateKycPdf(mockData);
    console.log("Success! PDF Base64 length:", base64.length);
    fs.writeFileSync('scratch/test_gen.pdf', Buffer.from(base64, 'base64'));
    console.log("Saved to scratch/test_gen.pdf");
  } catch (error) {
    console.error("Failed:", error);
  }
}

test();
