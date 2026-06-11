const prisma = require("../config/db");

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const getKycData = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-crm-api-key"];
    
    // Basic Authentication
    if (!apiKey || apiKey !== process.env.CRM_API_KEY) {
      return res.status(401).json({ success: false, error: "Unauthorized. Invalid or missing API Key." });
    }

    const { applicationId } = req.params;

    if (!applicationId) {
      return res.status(400).json({ success: false, error: "Application ID is required" });
    }

    const app = await prisma.kycApplication.findUnique({
      where: { applicationId },
      include: {
        user: true // Include user data like phone, email
      }
    });

    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    // Parse JSON fields to make it easier for the CRM
    const personalDetails = parseJsonField(app.personalDetails);
    const bankDetails = parseJsonField(app.bankDetails);
    const address = parseJsonField(app.address);
    const ocrData = parseJsonField(app.ocrData);
    const nsdlResponse = parseJsonField(app.nsdlResponse);
    const financialProof = parseJsonField(app.financialProof);

    // Extract Mandatory Fields for easy CRM mapping
    const mandatoryData = {
      userInfo: {
        fullName: personalDetails.name || "",
        panNumber: app.panUpload ? "Uploaded" : (ocrData.pan?.idNumber || ""),
        aadhaarNumber: ocrData.aadhaar?.idNumber || "",
        dob: personalDetails.dob || ocrData.pan?.dob || "",
        gender: personalDetails.gender || "",
        maritalStatus: personalDetails.maritalStatus || "",
        mobileNumber: app.user?.phone || "",
        email: app.user?.email || personalDetails.email || "",
        userAddress: address ? `${address.line1 || ''} ${address.line2 || ''} ${address.city || ''} ${address.state || ''} ${address.pincode || ''}`.trim() : "",
        applicationNo: app.applicationId,
        clientCode: nsdlResponse?.clientId || ""
      },
      bankFinancial: {
        bankAccountNumber: bankDetails.accountNumber || "",
        bankIfsc: bankDetails.ifsc || "",
        bankName: bankDetails.bankName || "",
        occupation: personalDetails.occupation || "",
        annualIncome: personalDetails.incomeRange || "",
        tradingExperience: personalDetails.tradingExperience || "",
        networth: financialProof?.networth || "",
        networthDate: financialProof?.networthDate || ""
      },
      companyInfo: {
        companyName: personalDetails.companyName || "", // If applicable
        companyAddress: personalDetails.companyAddress || "",
        companyLogo: "",
        authSign: ""
      },
      biometricsAssets: {
        signature: app.signature ? "Captured" : "",
        selfie: app.selfie ? "Captured" : "",
        currentDate: new Date().toISOString()
      }
    };

    // Return both the specifically formatted mandatory data AND the raw data
    res.json({
      success: true,
      mandatoryData,
      rawData: {
        ...app,
        personalDetails,
        bankDetails,
        address,
        ocrData,
        nsdlResponse,
        financialProof,
        user: {
          id: app.user.id,
          phone: app.user.phone,
          email: app.user.email
        }
      }
    });

  } catch (error) {
    console.error("[CRM API Error]", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
};

module.exports = {
  getKycData
};
