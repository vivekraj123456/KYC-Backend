const prisma = require("../config/db");
const { z } = require("zod");

// Fetch KYC submissions assigned to the currently logged in agent
const getAssignedApplications = async (req, res, next) => {
  try {
    const agentId = Number(req.user.id);
    const { status = "all", search = "", page = 1, limit = 15 } = req.query;
    
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const take = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 200);
    const skip = (pageNum - 1) * take;

    const where = { assignedCrmAgentId: agentId };
    
    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { applicationId: { contains: q } },
        { user: { phone: { contains: q } } },
        { user: { email: { contains: q } } },
        { personalDetails: { path: ["fullName"], string_contains: q } }
      ];
    }

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
          personalDetails: true,
          stepStatuses: true,
          riskScore: true,
          faceMatchScore: true,
          assignedCrmAgentId: true,
          user: { select: { email: true, phone: true } }
        }
      }),
      prisma.kycApplication.count({ where })
    ]);

    res.json({ 
      success: true, 
      applications,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / take)
    });
  } catch (error) {
    next(error);
  }
};

const reviewStepSchema = z.object({
  stepName: z.string(),
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional()
});

const REVIEW_STEP_ORDER = [
  { id: "phoneVerification", kycIndex: 1 },
  { id: "emailVerification", kycIndex: 2 },
  { id: "pricingSelection", kycIndex: 3 },
  { id: "panVerification", kycIndex: 4 },
  { id: "digilocker", kycIndex: 5 },
  { id: "personalDetails", kycIndex: 6 },
  { id: "nomineeChoice", kycIndex: 7 },
  { id: "nomineeDetails", kycIndex: 8 },
  { id: "nomineeAllocation", kycIndex: 9 },
  { id: "bankVerification", kycIndex: 10 },
  { id: "financialProof", kycIndex: 11 },
  { id: "signature", kycIndex: 12 },
  { id: "panUpload", kycIndex: 13 },
  { id: "ipv", kycIndex: 14 },
  { id: "esignPreview", kycIndex: 15 },
  { id: "aadhaarEsign", kycIndex: 16 },
  { id: "completion", kycIndex: 17 },
];

// Granular step-by-step review
const reviewStep = async (req, res, next) => {
  try {
    const { id, stepName } = req.params;
    const agentId = req.user.id;
    
    // Use req.user.email as the agent name for audit log if available
    const agentName = req.user.email || `Agent ${agentId}`;
    
    const { status, reason } = reviewStepSchema.parse({
      stepName,
      status: req.body.status,
      reason: req.body.reason
    });

    if (status === "rejected" && (!reason || reason.trim() === "")) {
      return res.status(400).json({ success: false, error: "Rejection reason is required" });
    }

    const app = await prisma.kycApplication.findUnique({
      where: { applicationId: id },
    });

    if (!app) {
      return res.status(404).json({ success: false, error: "Application not found" });
    }

    // Ensure the agent is assigned to this app or has admin privileges
    if (Number(app.assignedCrmAgentId) !== Number(agentId) && req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "You are not assigned to review this application" });
    }

    const configuredStep = REVIEW_STEP_ORDER.find((step) => step.id === stepName);
    if (!configuredStep) {
      return res.status(400).json({ success: false, error: "Unknown review step" });
    }

    if ((app.currentStep || 0) < configuredStep.kycIndex) {
      return res.status(400).json({
        success: false,
        error: "This step is not available yet because the applicant has not reached it"
      });
    }

    // Update stepStatuses JSON
    // stepStatuses structure: { [stepName]: { status, reason, reviewedAt, reviewedBy } }
    let stepStatuses = {};
    if (app.stepStatuses) {
      try {
        stepStatuses = JSON.parse(app.stepStatuses);
      } catch (e) {
        stepStatuses = {};
      }
    }

    // Automatically approve phone and email as they are OTP verified unless explicitly set
    if (!stepStatuses.phoneVerification || !stepStatuses.phoneVerification.status) {
      stepStatuses.phoneVerification = { status: "approved" };
    }
    if (!stepStatuses.emailVerification || !stepStatuses.emailVerification.status) {
      stepStatuses.emailVerification = { status: "approved" };
    }

    const unlockedSteps = REVIEW_STEP_ORDER.filter((step) => (app.currentStep || 0) >= step.kycIndex);
    const firstPendingStep = unlockedSteps.find((step) => stepStatuses[step.id]?.status !== "approved" && stepStatuses[step.id]?.status !== "rejected");
    const existingStatus = stepStatuses[stepName]?.status;

    if (firstPendingStep?.id !== stepName && existingStatus !== "approved" && existingStatus !== "rejected") {
      return res.status(400).json({
        success: false,
        error: `Please review ${firstPendingStep?.id || "the previous step"} before this step`
      });
    }



    stepStatuses[stepName] = {
      status,
      reason: status === "rejected" ? reason : null,
      reviewedAt: new Date().toISOString(),
      reviewedBy: agentId,
    };

    const updateData = {
      stepStatuses: JSON.stringify(stepStatuses),
      status: status === "rejected" ? "rejected" : "under_review",
      reviewedAt: new Date(),
    };

    if (status === "rejected") {
      updateData.rejectionReason = reason;
    }

    await prisma.kycApplication.update({
      where: { applicationId: id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: null, // Since this is a CRM agent, we use crmAgentId instead of standard userId
        crmAgentId: agentId,
        crmAgentName: agentName,
        action: `kyc_step_${status}`,
        details: JSON.stringify({ applicationId: id, stepName, reason: reason || null }),
        ipAddress: req.ip,
      },
    });

    res.json({ success: true, message: `Step ${stepName} ${status}` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors?.[0]?.message || error.message });
    }
    next(error);
  }
};

module.exports = {
  getAssignedApplications,
  reviewStep
};
