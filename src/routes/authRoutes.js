const express = require("express");
const { sendOtp, verifyOtp, adminLogin, kycTeamLogin, kycTeamSignup, setupAdmin } = require("../controllers/authController");

const router = express.Router();

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/admin-login", adminLogin);
router.post("/kyc-login", kycTeamLogin);
router.post("/agent/login", kycTeamLogin); // Alias for agent portal
router.post("/kyc-signup", kycTeamSignup);
router.post("/setup-admin", setupAdmin);

module.exports = router;
