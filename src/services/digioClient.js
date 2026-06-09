const axios = require("axios");

/**
 * Digio Client for Backend API calls
 */
class DigioClient {
  constructor() {
    this.baseUrl = process.env.DIGIO_BASE_URL || "https://api.digio.in/";
    // Ensure base URL ends with a slash for consistency if needed, 
    // or handle it in the post/get methods.
    if (!this.baseUrl.endsWith('/')) {
      this.baseUrl += '/';
    }
    
    this.clientId = process.env.DIGIO_CLIENT_ID;
    this.clientSecret = process.env.DIGIO_CLIENT_SECRET;
    
    // Auth header (Basic Auth)
    this.auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        "Authorization": `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Set credentials dynamically (matching PHP implementation)
   */
  setCredentials(clientId, clientSecret, environment = 'sandbox') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.environment = environment;
    this.baseUrl = this.environment === 'production'
        ? 'https://api.digio.in/'
        : 'https://ext.digio.in/';

    this.auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000,
      headers: {
        "Authorization": `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
    });
    
    return this;
  }

  async post(endpoint, data = {}, config = {}) {
    const fullUrl = `${this.http.defaults.baseURL}${endpoint}`;
    console.log(`[Digio API Request] POST ${fullUrl}`);
    // Log non-sensitive parts of the body if needed, or log entirely for debugging
    if (process.env.NODE_ENV !== 'production') {
       console.log(`[Digio API Body]`, JSON.stringify(data, null, 2));
    }
    
    try {
      const response = await this.http.post(endpoint, data, config);
      return response.data;
    } catch (error) {
      const errorData = error.response?.data || {};
      console.error(`Digio API Error [POST ${endpoint}]:`, JSON.stringify(errorData, null, 2) || error.message);
      throw error;
    }
  }

  async get(endpoint) {
    const fullUrl = `${this.http.defaults.baseURL}${endpoint}`;
    console.log(`[Digio API Request] GET ${fullUrl}`);
    try {
      const response = await this.http.get(endpoint);
      return response.data;
    } catch (error) {
      const errorData = error.response?.data || {};
      console.error(`Digio API Error [GET ${endpoint}]:`, JSON.stringify(errorData, null, 2) || error.message);
      throw error;
    }
  }

  /**
   * Fetches full KYC request state and action results.
   */
  async getKycRequestResponse(requestId) {
    return this.post(`client/kyc/v2/${requestId}/response`, {});
  }

  /**
   * Downloads the document associated with a KYC request.
   */
  async downloadKycDocument(requestId) {
    return this.http.get(`client/kyc/v2/${requestId}/download`, {
      responseType: 'arraybuffer'
    });
  }

  /**
   * Download Media API — fetches DigiLocker issued documents (PDF/XML/ZIP).
   * @param {string} mediaId - execution_request_id (RID…) for DigiLocker actions
   * @param {{ docType?: string, xml?: boolean, base64?: boolean }} options
   */
  async downloadKycMedia(mediaId, options = {}) {
    const params = new URLSearchParams();
    if (options.docType) params.set("doc_type", options.docType);
    if (options.xml !== undefined) params.set("xml", String(options.xml));
    if (options.base64 !== undefined) params.set("base64", String(options.base64));

    const query = params.toString();
    const endpoint = `client/kyc/v2/media/${encodeURIComponent(mediaId)}${query ? `?${query}` : ""}`;

    return this.http.get(endpoint, {
      responseType: "arraybuffer",
      headers: { Accept: "*/*" },
      timeout: 60000,
    });
  }

  /**
   * Creates a KYC request using a template (KID flow).
   * Ref: client/kyc/v2/request/with_template
   */
  async createKycRequest(payload) {
    return this.post("client/kyc/v2/request/with_template", payload);
  }

  /**
   * Aadhaar Masking API (Base64 Approach)
   * Ref: v4/client/kyc/aadhaar/mask
   */
  async maskAadhaarImage(payload) {
    // payload should include: reference_id, unique_request_id, data, file_name, data_content_type, is_validate, consent, mask_qr
    return this.post("v4/client/kyc/aadhaar/mask", payload);
  }
}

module.exports = new DigioClient();
