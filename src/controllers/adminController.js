const prisma = require("../config/db");
const { z } = require("zod");
const digioClient = require("../services/digioClient");
const crmService = require("../services/crmService");
const backofficeService = require("../services/backofficeService");
const { ensureDigilockerVerificationDocuments } = require("../routes/digioRoutes");

const reviewSchema = z.object({
  status: z.enum(["pending", "under_review", "verified", "rejected", "on_hold"]),
  reason: z.string().optional().default(""),
  currentStep: z.number().int().min(0).max(50).optional(),
});

const JSON_FIELD_KEYS = [
  "personalDetails",
  "identityDetails",
  "ocrData",
  "address",
  "bankDetails",
  "nomineeDetails",
  "nomineeAllocation",
  "panUpload",
  "signature",
  "financialProof",
  "selfieDetails",
  "documents",
  "nsdlRequest",
  "nsdlResponse",
  "segments",
  "stepStatuses",
];

const parseJsonField = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeApplication = (app) => {
  if (!app) return app;
  const normalized = { ...app };
  JSON_FIELD_KEYS.forEach((key) => {
    normalized[key] = parseJsonField(app[key], key === "documents" ? [] : {});
  });
  return normalized;
};

const getApplications = async (req, res, next) => {
  const { status, search = "", page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const skip = (pageNum - 1) * take;

  try {
    const where = {};
    const normalizedStatus = String(status || "").toLowerCase();
    if (normalizedStatus && normalizedStatus !== "all") {
      where.status = normalizedStatus;
    }

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { applicationId: { contains: q } },
        { user: { phone: { contains: q } } },
        { user: { email: { contains: q } } },
        { personalDetails: { contains: q } }
      ];
    }

    // Optimization: Only fetch fields needed for the list view
    const [applications, total] = await Promise.all([
      prisma.kycApplication.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          applicationId: true,
          status: true,
          currentStep: true,
          updatedAt: true,
          createdAt: true,
          personalDetails: true, // Needed for name
          identityDetails: true, // Needed for PAN/Aadhaar status
          assignedCrmAgentId: true,
          user: {
            select: {
              id: true,
              phone: true,
              email: true,
              eStamp: true
            }
          }
        }
      }),
      prisma.kycApplication.count({ where })
    ]);

    res.json({
      success: true,
      applications,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    next(error);
  }
};

const getApplicationById = async (req, res, next) => {
  try {
    const rawId = String(req.params.id || "").trim();
    const numericId = Number(rawId);

    let app = await prisma.kycApplication.findFirst({
      where: {
        OR: [
          { applicationId: rawId },
          ...(Number.isInteger(numericId) && numericId > 0 ? [{ id: numericId }] : []),
        ],
      },
      include: {
        user: true,
        reviewer: true,
      },
    });

    if (!app) {
      app = await prisma.kycApplication.findFirst({
        where: {
          applicationId: {
            contains: rawId,
          },
        },
        include: {
          user: true,
          reviewer: true,
        },
      });
    }

    if (!app) return res.status(404).json({ success: false, error: "Not found" });

    if (req.user.role === "kyc_team" && Number(app.assignedCrmAgentId) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, error: "You are not assigned to review this application" });
    }

    try {
      app = await ensureDigilockerVerificationDocuments(app);
    } catch (pdfError) {
      console.warn("[Admin] Could not ensure DigiLocker verification PDF:", pdfError.message);
    }

    const allLogs = await prisma.auditLog.findMany({
      where: { userId: app.userId },
      orderBy: { timestamp: "desc" },
      take: 500,
    });

    const logs = allLogs.map((log) => ({
      ...log,
      details: parseJsonField(log.details, log.details),
    })).filter((log) => {
      const linkedAppId = log.details?.applicationId;
      return !linkedAppId || linkedAppId === app.applicationId;
    });

    res.json({ success: true, application: normalizeApplication(app), logs });
  } catch (error) {
    next(error);
  }
};

const reviewApplication = async (req, res, next) => {
  let payload;
  try {
    payload = reviewSchema.parse(req.body || {});
  } catch (error) {
    return res.status(400).json({ success: false, error: error.errors?.[0]?.message || "Invalid review payload" });
  }

  const { status, reason, currentStep } = payload;
  try {
    const app = await prisma.kycApplication.findUnique({
      where: { applicationId: req.params.id },
    });
    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    const isKycAgent = req.user.role === "kyc_team";
    const updateData = {
      status,
      rejectionReason: reason || null,
      reviewedAt: new Date(),
    };

    if (!isKycAgent) {
      updateData.reviewedBy = req.user.id;
    }

    if (currentStep !== undefined) {
      updateData.currentStep = currentStep;
    }

    await prisma.kycApplication.update({
      where: { applicationId: req.params.id },
      data: updateData,
    });

    if (status === "verified") {
      const user = await prisma.user.findUnique({ where: { id: app.userId } });
      if (user && !user.eStamp) {
        await prisma.$transaction(async (tx) => {
          const availableStamp = await tx.eStamp.findFirst({
            where: { status: "available" },
            orderBy: { createdAt: "asc" }
          });

          if (availableStamp) {
            await tx.eStamp.update({
              where: { id: availableStamp.id },
              data: { status: "assigned", assignedTo: user.id }
            });
            await tx.user.update({
              where: { id: app.userId },
              data: { eStamp: availableStamp.certificateNo }
            });
          } else {
            console.warn(`[KYC Verification] No available E-Stamps for user ${user.id}`);
          }
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: isKycAgent ? null : req.user.id,
        crmAgentId: isKycAgent ? req.user.id : null,
        crmAgentName: isKycAgent ? (req.user.email || `Agent ${req.user.id}`) : null,
        action: `kyc_${status}`,
        details: JSON.stringify({ applicationId: req.params.id, reason: reason || null, currentStep }),
        ipAddress: req.ip,
      },
    });

    // Notify client via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(req.params.id).emit("kyc_updated", { status, currentStep });
      io.to("staff_room").emit("applications_updated");
    }

    res.json({ success: true, message: `Application ${status}` });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const [
      total, pending, review, verified, rejected, onHold, recent, 
      recentAppsForTrend, allAppsForDropoff, recentLogs
    ] = await Promise.all([
      prisma.kycApplication.count(),
      prisma.kycApplication.count({ where: { status: "pending" } }),
      prisma.kycApplication.count({ where: { status: "under_review" } }),
      prisma.kycApplication.count({ where: { status: "verified" } }),
      prisma.kycApplication.count({ where: { status: "rejected" } }),
      prisma.kycApplication.count({ where: { status: "on_hold" } }),
      prisma.kycApplication.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: { select: { email: true, phone: true } } }
      }),
      // For Weekly Trend (14 days)
      prisma.kycApplication.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true }
      }),
      // For Drop-off Funnel
      prisma.kycApplication.groupBy({
        by: ['currentStep'],
        _count: { currentStep: true }
      }),
      // For Live Activity
      prisma.auditLog.findMany({
        orderBy: { timestamp: "desc" },
        take: 6,
        include: { user: { select: { email: true, phone: true } } }
      })
    ]);

    // 1. Calculate Weekly Trend
    const weeklyTrend = Array(14).fill(0);
    const now = new Date();
    recentAppsForTrend.forEach(app => {
      const diffDays = Math.floor((now - app.createdAt) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 14) {
        weeklyTrend[13 - diffDays]++;
      }
    });

    // 2. Calculate Drop-off Funnel
    let stepCounts = { setup: 0, identity: 0, personal: 0, docs: 0, esign: 0 };
    allAppsForDropoff.forEach(group => {
      const step = group.currentStep;
      const count = group._count.currentStep;
      if (step <= 3) stepCounts.setup += count;
      else if (step <= 5) stepCounts.identity += count;
      else if (step <= 10) stepCounts.personal += count;
      else if (step <= 12) stepCounts.docs += count;
      else stepCounts.esign += count;
    });

    const dropOff = total > 0 ? [
      { step: "Contact & Setup", rate: Math.round((stepCounts.setup / total) * 100) },
      { step: "Identity & Address", rate: Math.round((stepCounts.identity / total) * 100) },
      { step: "Personal & Bank", rate: Math.round((stepCounts.personal / total) * 100) },
      { step: "Documents & Selfie", rate: Math.round((stepCounts.docs / total) * 100) },
      { step: "eSign & Completion", rate: Math.round((stepCounts.esign / total) * 100) },
    ] : [
      { step: "Contact & Setup", rate: 0 },
      { step: "Identity & Address", rate: 0 },
      { step: "Personal & Bank", rate: 0 },
      { step: "Documents & Selfie", rate: 0 },
      { step: "eSign & Completion", rate: 0 },
    ];

    // 3. Format Live Activity
    const mapAction = (action) => {
      if (action.includes("verified")) return { name: "KYC Approved", color: "#30a46c" };
      if (action.includes("rejected")) return { name: "KYC Rejected", color: "#e5484d" };
      if (action.includes("submitted")) return { name: "KYC Submitted", color: "#0091ff" };
      if (action.includes("review")) return { name: "Moved to Review", color: "#ffb224" };
      if (action.includes("client_update")) return { name: "Backoffice Sync", color: "#8E4EC6" };
      if (action.includes("assigned")) return { name: "Agent Assigned", color: "#0091ff" };
      return { name: action.replace("kyc_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()), color: "#888" };
    };

    const formatTimeAgo = (date) => {
      const mins = Math.floor((now - date) / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
      return `${Math.floor(hrs / 24)} days ago`;
    };

    const liveActivity = recentLogs.map(log => {
      const actionDetails = mapAction(log.action);
      let userName = "System";
      if (log.user?.email) userName = log.user.email.split("@")[0];
      else if (log.user?.phone) userName = log.user.phone;
      else if (log.crmAgentName) userName = log.crmAgentName;

      return {
        action: actionDetails.name,
        user: userName,
        time: formatTimeAgo(log.timestamp),
        color: actionDetails.color
      };
    });

    res.json({ 
      success: true, total, pending, review, verified, rejected, onHold, recent,
      weeklyTrend, dropOff, liveActivity
    });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  const { page = 1, limit = 50, severity = "all", search = "" } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const take = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const skip = (pageNum - 1) * take;

  try {
    const where = {};
    if (severity !== "all") {
      where.details = { path: ["severity"], string_contains: severity };
    }

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { action: { contains: q } },
        { user: { email: { contains: q } } },
        { user: { phone: { contains: q } } }
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take,
        skip,
        include: {
          user: {
            select: { id: true, email: true, phone: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      success: true,
      logs,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    next(error);
  }
};

const deleteApplication = async (req, res, next) => {
  const { deleteUser = false } = req.query;
  const { id } = req.params;

  try {
    const app = await prisma.kycApplication.findUnique({
      where: { applicationId: id },
      include: { user: true }
    });

    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    const userId = app.userId;

    if (deleteUser) {
      // Safety check: Don't let admin delete themselves
      if (userId === req.user.id) {
        return res.status(400).json({ success: false, error: "You cannot delete your own admin account" });
      }

      // Delete user (cascade will handle KycApplication and AuditLogs if configured, otherwise manual)
      // Prisma cascade is defined in schema if set, but we'll do it safely
      await prisma.$transaction([
        prisma.auditLog.deleteMany({ where: { userId } }),
        prisma.kycApplication.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } })
      ]);
      
      const io = req.app.get("io");
      if (io) io.to("staff_room").emit("applications_updated");

      res.json({ success: true, message: "User and all related data deleted permanently" });
    } else {
      // Just delete the application
      await prisma.kycApplication.delete({
        where: { applicationId: id }
      });

      await writeAuditLog({
        userId: req.user.id,
        action: "kyc_deleted",
        details: { applicationId: id, userId },
        ipAddress: req.ip,
      });

      const io = req.app.get("io");
      if (io) io.to("staff_room").emit("applications_updated");

      res.json({ success: true, message: "KYC application deleted permanently" });
    }
  } catch (error) {
    next(error);
  }
};

async function writeAuditLog({ userId, action, details, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("[AuditLog] Failed to persist log:", error.message);
  }
}

const getUsers = async (req, res, next) => {
  const { search = "", page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const skip = (pageNum - 1) * take;

  try {
    const where = {};
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { email: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          kycApplications: {
            select: {
              applicationId: true,
              status: true,
              updatedAt: true
            }
          }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      success: true,
      users,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    next(error);
  }
};


const getUserKycDetails = async (req, res, next) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: "Invalid user id" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        kycApplications: {
          orderBy: { updatedAt: "desc" }
        },
        auditLogs: {
          orderBy: { timestamp: "desc" },
          take: 100
        }
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

const getRiskFraud = async (req, res, next) => {
  try {
    const highRisk = await prisma.kycApplication.findMany({
      where: {
        OR: [
          { faceMatchScore: { lt: 80 } },
          { status: "rejected" }
        ]
      },
      orderBy: { updatedAt: "desc" },
      include: {
        user: { select: { email: true, phone: true } }
      }
    });

    res.json({ success: true, highRisk });
  } catch (error) {
    next(error);
  }
};

const getDocuments = async (req, res, next) => {
  try {
    const apps = await prisma.kycApplication.findMany({
      where: { documents: { not: null } },
      select: { applicationId: true, documents: true, user: { select: { email: true } } }
    });
    
    let allDocs = [];
    apps.forEach(app => {
      const docs = parseJsonField(app.documents, []);
      docs.forEach(d => {
        allDocs.push({ ...d, applicationId: app.applicationId, user: app.user?.email });
      });
    });

    res.json({ success: true, documents: allDocs });
  } catch (error) {
    next(error);
  }
};

const getFaceMatchLogs = async (req, res, next) => {
  try {
    const logs = await prisma.kycApplication.findMany({
      where: { faceMatchScore: { not: null } },
      select: { 
        applicationId: true, 
        faceMatchScore: true, 
        updatedAt: true,
        user: { select: { email: true } } 
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
};


const refreshFromDigio = async (req, res, next) => {
  try {
    const rawId = String(req.params.id || "").trim();
    const app = await prisma.kycApplication.findFirst({ where: { OR: [{ applicationId: rawId }, { id: Number(rawId) || -1 }] } });
    if (!app) return res.status(404).json({ success: false, error: "Application not found" });

    const digio = app.ocrData?.digio || {};
    const candidates = ["SELFIE", "DIGILOCKER", "PAN_VERIFICATION"].map((k) => ({ type: k, requestId: digio?.[k]?.requestId })).filter((x) => x.requestId);
    if (!candidates.length) return res.status(400).json({ success: false, error: "No Digio request IDs found on this application" });

    const nextSelfieDetails = { ...(parseJsonField(app.selfieDetails, {})) };
    const nextOcrData = { ...(parseJsonField(app.ocrData, {})) };
    let nextFaceMatchScore = app.faceMatchScore;

    const findVal = (obj, keys) => {
      if (!obj || typeof obj !== "object") return null;
      for (const [k, v] of Object.entries(obj)) {
        if (keys.includes(k) && typeof v === "string" && v.trim()) return v;
        if (v && typeof v === "object") {
          const nested = findVal(v, keys);
          if (nested) return nested;
        }
      }
      return null;
    };

    for (const c of candidates) {
      let response;
      try { response = await digioClient.getKycRequestResponse(c.requestId); } catch (_) { continue; }
      nextOcrData.digio = nextOcrData.digio || {};
      nextOcrData.digio[c.type] = { ...(nextOcrData.digio[c.type] || {}), requestId: c.requestId, fetchedAt: new Date().toISOString(), status: response?.status || "fetched", response };

      const image = findVal(response, ["image_url", "imageUrl", "selfie_url", "selfieUrl", "photo", "preview"]);
      const video = findVal(response, ["video_url", "videoUrl", "recording_url", "recordingUrl", "videoPreview", "video"]);
      const geoAddress = findVal(response, ["address", "formatted_address", "location_address"]);
      const geoAccuracy = findVal(response, ["accuracy", "accuracy_in_meters", "accuracyMeters"]);
      const geoLat = findVal(response, ["latitude", "lat"]);
      const geoLng = findVal(response, ["longitude", "lng", "lon"]);
      const score = Number(findVal(response, ["face_match_score", "faceMatchScore", "score", "similarity"]));
      if (!Number.isNaN(score)) nextFaceMatchScore = score <= 1 ? Math.round(score * 100) : Math.round(score);

      if (c.type === "SELFIE" && image) nextSelfieDetails.preview = image;
      if (c.type === "SELFIE" && video) nextSelfieDetails.videoPath = video;
      if (c.type === "SELFIE" && (geoAddress || geoLat || geoLng)) {
        nextSelfieDetails.geo = { address: geoAddress || null, accuracy: geoAccuracy || null, latitude: geoLat || null, longitude: geoLng || null, provider: "digio", fetchedAt: new Date().toISOString() };
      }
    }

    await prisma.kycApplication.update({
      where: { id: app.id },
      data: {
        ocrData: nextOcrData,
        selfieDetails: nextSelfieDetails,
        ...(nextSelfieDetails.preview ? { selfie: nextSelfieDetails.preview } : {}),
        ...(nextFaceMatchScore !== null && nextFaceMatchScore !== undefined ? { faceMatchScore: nextFaceMatchScore } : {}),
      },
    });

    // Notify client via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(rawId).emit("kyc_updated", { action: "digio_refreshed" });
      io.to("staff_room").emit("applications_updated");
    }

    res.json({ success: true, message: "Digio data refreshed successfully" });
  } catch (error) {
    next(error);
  }
};

const sendToBackoffice = async (req, res, next) => {
  const rawId = String(req.params.id || "").trim();
  const numericId = Number(rawId);
  const { clientCode, clientType = "A" } = req.body || {};

  try {
    const app = await prisma.kycApplication.findFirst({
      where: {
        OR: [
          { applicationId: rawId },
          ...(Number.isInteger(numericId) && numericId > 0 ? [{ id: numericId }] : []),
        ],
      },
      include: { user: true },
    });

    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    const resolvedClientCode = backofficeService.deriveClientCode(app, clientCode);
    if (!resolvedClientCode) {
      return res.status(400).json({ success: false, error: "clientCode is required because this application does not have a generated client id" });
    }

    let existingData = {};
    try {
      existingData = await backofficeService.fetchExistingClientDetail(resolvedClientCode, clientType);
    } catch (fetchError) {
      const status = fetchError.response?.status;
      if (status && status !== 404) {
        throw fetchError;
      }
      existingData = {};
    }

    const payload = backofficeService.buildModificationPayload(app, existingData, resolvedClientCode, clientType);
    const response = await backofficeService.submitClientModification(resolvedClientCode, payload);

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "backoffice_client_update",
        details: JSON.stringify({
          applicationId: app.applicationId,
          clientCode: resolvedClientCode,
          clientType,
          response,
        }),
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, clientCode: resolvedClientCode, payload, response });
  } catch (error) {
    console.error("Backoffice submission failed:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error || error.response?.data?.message || error.message || "Failed to send data to backoffice";
    res.status(status).json({ success: false, error: message, details: error.response?.data || null });
  }
};

const getCrmEmployees = async (req, res, next) => {
  try {
    const { role, department } = req.query;
    const employees = await crmService.getKycEmployees({ role, department });
    res.json({ success: true, employees });
  } catch (error) {
    next(error);
  }
};

const assignApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { crmAgentId, crmAgentName } = req.body;

    if (!crmAgentId) {
      return res.status(400).json({ success: false, error: "crmAgentId is required" });
    }

    const app = await prisma.kycApplication.findUnique({
      where: { applicationId: id },
    });

    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    await prisma.kycApplication.update({
      where: { applicationId: id },
      data: { assignedCrmAgentId: Number(crmAgentId) },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id, // the admin who assigned it
        action: "assigned_to_agent",
        details: JSON.stringify({ applicationId: id, crmAgentId, crmAgentName }),
        ipAddress: req.ip,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(id).emit("kyc_updated", { action: "assigned_to_agent" });
      io.to("staff_room").emit("applications_updated");
    }

    res.json({ success: true, message: `Application assigned to ${crmAgentName || crmAgentId}` });
  } catch (error) {
    next(error);
  }
};

const updateUserEstamp = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { eStamp } = req.body;
    
    if (!eStamp || typeof eStamp !== "string") {
      return res.status(400).json({ success: false, error: "Valid eStamp is required" });
    }

    // Check if duplicate eStamp exists
    const existing = await prisma.user.findUnique({ where: { eStamp } });
    if (existing && existing.id !== Number(id)) {
      return res.status(400).json({ success: false, error: "This E-Stamp is already assigned to another user" });
    }

    await prisma.user.update({
      where: { id: Number(id) },
      data: { eStamp }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "updated_estamp",
        details: JSON.stringify({ targetUserId: id, eStamp }),
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, message: "E-Stamp updated successfully", eStamp });
  } catch (error) {
    next(error);
  }
};

const updateEstampSequence = async (req, res, next) => {
  try {
    const { nextSequenceValue } = req.body;
    
    if (typeof nextSequenceValue !== "number" || nextSequenceValue < 0) {
      return res.status(400).json({ success: false, error: "Valid numeric sequence value is required" });
    }

    const seq = await prisma.sequence.upsert({
      where: { name: 'eStamp' },
      update: { value: nextSequenceValue - 1 }, // we subtract 1 because generation increments it by 1
      create: { name: 'eStamp', value: nextSequenceValue - 1 }
    });

    res.json({ success: true, message: "E-Stamp sequence updated successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
  assignApplication,
  updateUserEstamp,
  updateEstampSequence
};
