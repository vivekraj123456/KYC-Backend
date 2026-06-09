const express = require("express");
const {
  getApplications,
  getApplicationById,
  reviewApplication,
  deleteApplication,
  getStats,
  getAuditLogs,
  getUsers,
  getRiskFraud,
  getDocuments,
  getFaceMatchLogs,
  getUserKycDetails,
  refreshFromDigio,
  sendToBackoffice,
  getCrmEmployees,
  assignApplication
} = require("../controllers/adminController");
const { adminAuth } = require("../middlewares/auth");

const router = express.Router();

router.get("/applications", adminAuth, getApplications);
router.get("/application/:id", adminAuth, getApplicationById);
router.put("/review/:id", adminAuth, reviewApplication);
router.delete("/application/:id", adminAuth, deleteApplication);
router.get("/dashboard-data", adminAuth, getStats);
router.get("/audit-logs", adminAuth, getAuditLogs);
router.get("/users", adminAuth, getUsers);
router.get("/users/:id", adminAuth, getUserKycDetails);
router.get("/risk-fraud", adminAuth, getRiskFraud);
router.get("/documents", adminAuth, getDocuments);
router.get("/facematch", adminAuth, getFaceMatchLogs);
router.post("/application/:id/refresh-digio", adminAuth, refreshFromDigio);
router.post("/application/:id/send-backoffice", adminAuth, sendToBackoffice);
router.get("/crm-employees", adminAuth, getCrmEmployees);
router.post("/application/:id/assign", adminAuth, assignApplication);

module.exports = router;
