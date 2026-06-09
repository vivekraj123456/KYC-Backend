const axios = require("axios");

/**
 * Airtel IQ SMS Service — DLT OTP via api/v4/send-sms
 */

const SMS_CONFIG = {
  url: "https://iqmessaging.airtel.in/api/v4/send-sms",
  authorization: process.env.SMS_AUTH,
  customerId: process.env.SMS_CUSTOMER_ID_HEADER,
  bodyCustomerId: process.env.SMS_CUSTOMER_ID_BODY,
  entityId: process.env.SMS_ENTITY_ID,
  sourceAddress: process.env.SMS_SOURCE_ADDRESS,
  templateId: process.env.SMS_TEMPLATE_ID,
};

const REQUIRED_ENV = [
  "SMS_AUTH",
  "SMS_CUSTOMER_ID_HEADER",
  "SMS_CUSTOMER_ID_BODY",
  "SMS_ENTITY_ID",
  "SMS_SOURCE_ADDRESS",
  "SMS_TEMPLATE_ID",
];

function getMissingEnv() {
  return REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
}

function isSmsBypassEnabled() {
  return process.env.SMS_OTP_BYPASS === "true";
}

function formatAirtelError(error) {
  const data = error.response?.data;
  const airtel = data?.error;
  if (airtel?.code || airtel?.message) {
    return `Airtel SMS error ${airtel.code || ""}: ${airtel.message || "unknown"}`.trim();
  }
  if (error.response?.status) {
    return `Airtel SMS HTTP ${error.response.status}`;
  }
  return error.message || "SMS request failed";
}

/**
 * @param {string} phone - 10-digit mobile number
 * @param {string} otp - 6-digit OTP
 */
const sendMobileOtp = async (phone, otp) => {
  const missing = getMissingEnv();
  if (missing.length) {
    throw new Error(
      `SMS not configured on server (missing: ${missing.join(", ")}). Add variables to .env on Hostinger.`
    );
  }

  if (isSmsBypassEnabled()) {
    console.warn(`[SMS Service] SMS_OTP_BYPASS=true — OTP for ${phone}: ${otp} (not sent via Airtel)`);
    return { success: true, bypass: true };
  }

  const refNo = "KYC-" + Date.now().toString().slice(-6);
  const message = `Dear Sir/Madam, Your OTP For Mobile Verification at Stockology Securities Pvt. Ltd. is ${otp} With Respect to Token/Ref. No ${refNo} From. -STOCKOLOGY`;
  const fullPhone = phone.startsWith("91") ? phone : "91" + phone;

  const payload = {
    customerId: SMS_CONFIG.bodyCustomerId,
    destinationAddress: [fullPhone],
    message,
    sourceAddress: SMS_CONFIG.sourceAddress,
    messageType: "SERVICE_IMPLICIT",
    dltTemplateId: SMS_CONFIG.templateId,
    entityId: SMS_CONFIG.entityId,
    otp: true,
  };

  console.log(`[SMS Service] Sending OTP to ${phone}`);

  try {
    const response = await axios.post(SMS_CONFIG.url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: SMS_CONFIG.authorization,
        customerId: SMS_CONFIG.customerId,
      },
      timeout: 20000,
    });

    if (response.data?.success === false) {
      const msg = formatAirtelError({ response: { data: response.data, status: response.status } });
      console.error(`[SMS Service] ${msg}`, JSON.stringify(response.data));
      throw new Error(msg);
    }

    console.log(`[SMS Service] Sent OK:`, JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    const detail = formatAirtelError(error);
    console.error(`[SMS Service] Failed:`, detail);
    throw new Error(detail);
  }
};

function getSmsStatus() {
  const missing = getMissingEnv();
  return {
    configured: missing.length === 0,
    missing,
    bypass: isSmsBypassEnabled(),
  };
}

module.exports = { sendMobileOtp, getSmsStatus, getMissingEnv };
