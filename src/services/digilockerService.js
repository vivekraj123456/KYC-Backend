const digioClient = require("./digioClient");

/**
 * DigiLocker Integration Service
 */
class DigilockerService {
  /**
   * Create a DigiLocker request for fetching documents
   */
  async createRequest(customerIdentifier, aadhaar, documentTypes = ["AADHAAR", "PAN"], customerName = "") {
    const endpoint = "client/kyc/v2/request";

    return await digioClient.post(endpoint, {
      customer_identifier: customerIdentifier,
      customer_name: customerName || "KYC User",
      notify_customer: false,
      generate_access_token: true,
      actions: [
        {
          type: "DIGILOCKER",
          title: "Connect DigiLocker",
          description: "Connect your DigiLocker to fetch Aadhaar and PAN",
          document_types: documentTypes,
          digilocker_document_attributes: {
            "AADHAAR": { "mandatory": "true", "auto_select": "true" },
            "PAN": { "mandatory": "true", "auto_select": "true" }
          }
        },
        {
          type: "SELFIE",
          title: "Selfie Verification",
          description: "Capture a live selfie to verify your identity"
        }
      ]
    });
  }

  /**
   * Get documents fetched from DigiLocker for a request
   */
  async getDocuments(requestId) {
    return await digioClient.getKycRequestResponse(requestId);
  }
}

module.exports = new DigilockerService();
