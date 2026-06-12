const express = require("express");
const {
  startKyc,
  getMyApplication,
  saveStep,
  uploadDocument,
  ocrExtract,
  faceMatch,
  submitKyc,
  getStatus,
  getKycConfig,
  getPincodeData,
  downloadPdf
} = require("../controllers/kycController");
const { auth } = require("../middlewares/auth");
const upload = require("../middlewares/upload");

const router = express.Router();

router.post("/start", auth, startKyc);
router.get("/me", auth, getMyApplication);

// Structured Step Endpoints for Clarity
router.put("/save/personal-details", auth, saveStep);
router.put("/save/address", auth, saveStep);
router.put("/save/bank", auth, saveStep);
router.put("/save/nominee", auth, saveStep);
router.put("/save/financials", auth, saveStep);
router.put("/save/signature", auth, saveStep);

// Legacy/Generic Sync Endpoint
router.put("/save-step", auth, saveStep);

router.post("/upload-document", auth, upload.single("document"), uploadDocument);
router.post("/ocr-extract", auth, ocrExtract);
router.post("/face-match", auth, faceMatch);
router.post("/submit", auth, submitKyc);
router.get("/status/:applicationId", auth, getStatus);
router.get("/download-pdf/:applicationId", auth, downloadPdf);
router.get("/config", getKycConfig);
router.get("/pincode/:pin", getPincodeData);

module.exports = router;
