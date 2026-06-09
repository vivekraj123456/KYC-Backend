const nodemailer = require("nodemailer");

const sendOtpEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const mailOptions = {
      from: `"Stockology Securities" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your OTP for KYC Verification",
      text: `Your OTP for KYC verification is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">KYC Verification</h2>
          <p style="font-size: 16px; color: #555;">Hello,</p>
          <p style="font-size: 16px; color: #555;">Your One-Time Password (OTP) for KYC verification is:</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #888;">This OTP is valid for 5 minutes. Please do not share it with anyone.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #aaa; text-align: center;">&copy; 2026 Stockology Securities. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("CRITICAL ERROR sending email:", error.message);
    console.error(error.stack);
    throw new Error(`Email Service Error: ${error.message}`);
  }
};

module.exports = {
  sendOtpEmail,
};
