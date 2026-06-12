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
    const FormData = require('form-data');
    
    // 1. Generate the PDF locally on the server
    console.log(`[EsignService] Generating PDF for ${customerIdentifier}...`);
    const pdfBase64 = await generateKycPdf(applicationData);
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // 2. Prepare Digio Request (Multipart DID Flow)
    const endpoint = "v2/client/document/upload";
    
    // Parse personal details string
    let parsedPersonalDetails = {};
    try {
      if (typeof applicationData.personalDetails === 'string') {
        parsedPersonalDetails = JSON.parse(applicationData.personalDetails);
      } else if (typeof applicationData.personalDetails === 'object') {
        parsedPersonalDetails = applicationData.personalDetails;
      }
    } catch (e) {
      console.warn("Failed to parse personalDetails for eSign name");
    }

    const requestDetails = {
      signers: [
        {
          identifier: customerIdentifier,
          name: parsedPersonalDetails.fullName || "KYC User",
          reason: "KYC Application Signing by STOCKOLOGY SECURITIES PRIVATE LIMITED",
          sign_type: "aadhaar"
        }
      ],
      expire_in_days: 10,
      display_on_page: "all",
      notify_signers: true,
      send_sign_link: false,
      generate_access_token: true
    };

    const form = new FormData();
    form.append('file', pdfBuffer, { filename: `KYC_Application_${customerIdentifier}.pdf`, contentType: 'application/pdf' });
    form.append('request', JSON.stringify(requestDetails), { contentType: 'application/json' });

    console.log(`[EsignService] Uploading generated PDF via multipart for ${customerIdentifier} (Buffer size: ${pdfBuffer.length} bytes)`);
    
    try {
      // Pass the form and custom headers to the digioClient.post wrapper
      const response = await digioClient.post(endpoint, form, {
        headers: {
          ...form.getHeaders()
        }
      });
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
    return await digioClient.http.get(endpoint, { responseType: 'arraybuffer' });
  }
}

module.exports = new EsignService();
