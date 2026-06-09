const digioClient = require("./digioClient");
const crypto = require("crypto");

/**
 * Bank Account Verification Service (Penny Drop)
 */
class BankService {
  /**
   * Verify bank account using Penny Drop (v4)
   */
  async verifyAccount(accountNumber, ifsc, beneficiaryName) {
    const endpoint = "v4/client/verify/bank_account";
    const uniqueId = `BANK_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    const payload = {
      amount: 1,
      beneficiary_account_no: String(accountNumber || "").trim(),
      beneficiary_ifsc: String(ifsc || "").trim().toUpperCase(),
      unique_request_id: uniqueId,
      validation_mode: "PENNY_DROP"
    };

    if (beneficiaryName) {
      payload.beneficiary_name = beneficiaryName;
    }

    return await digioClient.post(endpoint, payload);
  }

  /**
   * Verify IFSC Code (v3)
   */
  async verifyIfsc(ifscCode) {
    const endpoint = "v3/client/kyc/verify/IFSC";
    return await digioClient.post(endpoint, {
      identifier: ifscCode
    });
  }

  /**
   * Create Digio Request for Bank Verification flow
   */
  async createRequest(customerIdentifier, accountNumber, ifsc) {
    const endpoint = "client/kyc/v2/request/with_template";
    
    // Build details object only if we have the data, otherwise let Digio collect it
    const details = {};
    if (accountNumber) details.account_number = String(accountNumber).trim();
    if (ifsc) details.ifsc = String(ifsc).trim().toUpperCase();

    return await digioClient.post(endpoint, {
      template_name: "BANK_VERIFICATION_TEMPLATE", 
      notify_customer: true, // Set to true to ensure Digio sends notifications if possible
      generate_access_token: true,
      customer_identifier: customerIdentifier,
      actions: [
        {
          type: "PENNY_DROP",
          title: "Bank Account Verification",
          description: "Verify your bank account securely via penny drop",
          details: Object.keys(details).length > 0 ? details : {}
        }
      ]
    });
  }
}

module.exports = new BankService();
