const digioClient = require("./digioClient");

/**
 * Selfie & Liveness Verification Service
 */
class SelfieService {
  /**
   * Create a Liveness verification request
   */
  async createRequest(customerIdentifier, customerName = "") {
    const endpoint = "client/kyc/v2/request/with_template";
    
    // Generate a unique transaction ID if not present
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

    return await digioClient.post(endpoint, {
      customer_identifier: customerIdentifier,
      customer_name: customerName,
      template_name: "DIGILOCKER_CONDITIONAL_JOURNEY_PAN_V0702", // Updated to combined journey template
      notify_customer: false,
      generate_access_token: true,
      transaction_id: transactionId,
      generate_deeplink_info: true
    });
  }

  /**
   * Compare two faces (e.g. Selfie vs ID Card)
   */
  async faceMatch(image1, image2) {
    const endpoint = "v3/client/kyc/face/match";
    
    return await digioClient.post(endpoint, {
      image1: image1, // Base64 or URL
      image2: image2,
    });
  }
}

module.exports = new SelfieService();
