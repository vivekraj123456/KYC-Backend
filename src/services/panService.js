const digioClient = require("./digioClient");

/**
 * PAN Verification Service
 */
class PanService {
  /**
   * Creates a PAN-focused DigiLocker request.
   * This account's DigiO KYC surface accepts DIGILOCKER/PENNY_DROP/SELFIE actions
   * and does not accept a dedicated PAN action type on /kyc/v2/request.
   */
  /**
   * Creates a PAN-focused DigiLocker request.
   */
  async createPanRequest(customerIdentifier, pan, dob, fullName = "") {
    const endpoint = "client/kyc/v2/request/with_template";
    
    return await digioClient.post(endpoint, {
      customer_identifier: customerIdentifier,
      template_name: "DIGILOCKER_AADHAAR_PAN",
      notify_customer: false,
      generate_access_token: true,
      digilocker_document_attributes: {
        "AADHAAR": { "mandatory": "true", "auto_select": "true" },
        "PAN": { 
          "mandatory": "true", 
          "auto_select": "true",
          "pan_no": pan,
          "name": fullName || ""
        }
      }
    });
  }

  /**
   * Directly verify PAN details using Digio API
   * @param {string} panNumber - The PAN card number
   * @param {string} fullName - The full name as per PAN
   * @param {string} dob - Date of birth (YYYY-MM-DD)
   */
  async verifyPan(panNumber, fullName, dob) {
    try {
      // Digio expects DD/MM/YYYY for most PAN APIs
      const date = new Date(dob);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const formattedDob = `${day}/${month}/${year}`;

      const endpoint = "v3/client/kyc/fetch_id_data/PAN";
      
      console.log('Digio PAN Request URL:', digioClient.baseUrl + endpoint);
      console.log('Digio PAN Payload:', JSON.stringify({
        id_no: panNumber.substring(0, 5) + '...',
        name: fullName,
        dob: formattedDob
      }));

      const payload = {
        id_no: panNumber.toUpperCase(),
        name: fullName,
        dob: formattedDob,
        unique_request_id: `PAN_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`
      };

      const data = await digioClient.post(endpoint, payload);

      console.log('Digio PAN Response:', JSON.stringify(data));

      // Explicitly check for matches if provided by API
      if (data.name_as_per_pan_match === false) {
        return {
          success: false,
          message: 'Name mismatch: The name provided does not match the name on the PAN card.',
          data: data
        };
      }

      if (data.date_of_birth_match === false) {
        return {
          success: false,
          message: 'DOB mismatch: The date of birth provided does not match our records.',
          data: data
        };
      }

      if (data.status && data.status.toLowerCase() !== 'valid') {
        return {
          success: false,
          message: `This PAN card is currently marked as ${data.status || 'invalid'}.`,
          data: data
        };
      }

      return {
        success: true,
        data: data,
      };

    } catch (error) {
      console.error('Digio PAN Verification Error:', error.message);
      
      const status = error.response?.status;
      const errorData = error.response?.data;
      let errorMsg = errorData?.message || 'PAN Verification failed at Digio';

      if (status === 404) {
        errorMsg = "Digio endpoint not found. Please verify the API version.";
      } else if (status === 401) {
        errorMsg = "Digio Authentication failed. Please check your Client ID/Secret.";
      }

      return {
        success: false,
        message: `${errorMsg} (Status: ${status || 'Unknown'})`,
      };
    }
  }
}

module.exports = new PanService();
