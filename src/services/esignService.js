const digioClient = require("./digioClient");
const { generateKycPdf } = require("../utils/pdfGenerator");

/**
 * Aadhaar eSign Service
 */
class EsignService {
  /**
   * Creates an Aadhaar eSign request for a document.
   * Generates the PDF on the backend to avoid payload size issues.
   */
  async createRequest(customerIdentifier, aadhaar, applicationData = {}) {
    // 1. Generate the PDF locally on the server
    console.log(`[EsignService] Generating PDF for ${customerIdentifier}...`);
    const pdfBase64 = await generateKycPdf(applicationData);

    // 2. Prepare Digio Request (DID Flow - Document ID)
    const endpoint = "v2/client/document/uploadpdf";
    const payload = {
      file_name: `KYC_Application_${customerIdentifier}.pdf`,
      file_data: pdfBase64,
      signature_type: "aadhaar", // Mandatory at root for some versions
      signers: [
        {
          identifier: customerIdentifier,
          name: applicationData.personalDetails?.fullName || "KYC User",
          reason: "KYC Application Signing",
          sign_type: "aadhaar"
        }
      ],
      expire_in_days: 10,
      display_on_page: "last", // Only sign the last page (the Summary Annexure)
      notify_signers: true,
      send_sign_link: false, // We use the SDK/modal, so don't send link automatically
      generate_access_token: true
    };

    console.log(`[EsignService] Uploading generated PDF for ${customerIdentifier} (Base64 length: ${pdfBase64.length})`);
    
    try {
      const response = await digioClient.post(endpoint, payload);
      console.log(`[EsignService] Digio Request Created: ${response.id}`);
      return { ...response, pdfBase64 };
    } catch (error) {
      const errorData = error.response?.data || {};
      console.error(`[EsignService] Digio API Error [${error.response?.status}]:`, JSON.stringify(errorData, null, 2));
      throw new Error(errorData.message || error.message || "Failed to create eSign request");
    }
  }

  /**
   * Get details of a sign request/document
   */
  async getRequestDetails(docId) {
    const endpoint = `v2/client/document/${docId}`;
    return await digioClient.get(endpoint);
  }

  /**
   * Cancel a pending sign request
   */
  async cancelRequest(docId) {
    const endpoint = `v2/client/document/${docId}/cancel`;
    return await digioClient.post(endpoint, {});
  }

  /**
   * Download the signed document
   * Returns a buffer/stream
   */
  async downloadDocument(docId) {
    const endpoint = `v2/client/document/download?document_id=${docId}`;
    return await digioClient.get(endpoint, { responseType: 'arraybuffer' });
  }
}

module.exports = new EsignService();
