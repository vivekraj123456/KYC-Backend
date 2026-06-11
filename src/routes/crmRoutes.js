const express = require("express");
const router = express.Router();
const { getKycData } = require("../controllers/crmController");

// GET /api/crm/:applicationId
// Fetch complete KYC data for the CRM. Requires x-crm-api-key header.
router.get("/:applicationId", getKycData);

module.exports = router;
