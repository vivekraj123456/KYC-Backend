const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { z } = require("zod");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");
const crmService = require("../services/crmService");

const JWT_SECRET = process.env.JWT_SECRET || "kyc-secret-key-change-in-production";
const otpStore = new Map();

// Validation schemas
const sendOtpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number").optional(),
  email: z.string().email("Invalid email").optional(),
}).refine(data => data.phone || data.email, "Phone or Email is required");

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number").optional(),
  email: z.string().email("Invalid email").optional(),
  otp: z.string().length(6, "OTP must be 6 digits"),
}).refine(data => data.phone || data.email, "Phone or Email is required");

const sendOtp = async (req, res, next) => {
  try {
    const { phone, email } = sendOtpSchema.parse(req.body);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = email || phone;
    
    // Dedup Check BEFORE sending OTP (only for phone numbers)
    if (phone) {
      const user = await prisma.user.findUnique({
        where: { phone },
        include: { kycApplications: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });

      const existingApp = user?.kycApplications?.[0];

      if (existingApp && (existingApp.status === "verified" || existingApp.currentStep >= 17)) {
        console.log(`[Dedup] Blocking OTP for completed user: ${phone} (Step: ${existingApp.currentStep}, Status: ${existingApp.status})`);
        return res.status(400).json({ 
          success: false, 
          error: "You have already completed the application. Your account is either verified or currently under review.",
          code: "ALREADY_EXISTS"
        });
      }

      // Public KYC portal accepts new customers directly.
      // Existing users resume from their saved application step; completed users are blocked above.
    }

    otpStore.set(key, { otp, expiresAt: Date.now() + 300000 });
    
    if (email) {
      console.log(`[OTP] Attempting to send email to ${email}...`);
      await emailService.sendOtpEmail(email, otp);
      console.log(`[OTP] Success: Email sent to ${email}: ${otp}`);
      return res.json({ success: true, message: "OTP sent to your email" });
    } else {
      console.log(`[OTP] Attempting to send SMS to ${phone}...`);
      await smsService.sendMobileOtp(phone, otp);
      console.log(`[OTP] Success: SMS sent to ${phone}: ${otp}`);
      return res.json({ success: true, message: `OTP sent to ${phone}` });
    }
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { phone, email, otp } = verifyOtpSchema.parse(req.body);
    const key = email || phone;
    const stored = otpStore.get(key);

    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: "OTP expired" });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    otpStore.delete(key);

    // If it's a phone verification, we might want to create/find the user
    // If it's email verification in the middle of KYC, we might just return success
    
    if (phone) {
      // Find or create user in MySQL
      let user = await prisma.user.findUnique({
        where: { phone }
      });

      if (!user) {
        user = await prisma.user.create({
          data: { 
            phone, 
            role: "user" 
          }
        });
        console.log(`[Auth] Created local KYC user: ${phone}`);
      }

      const token = jwt.sign(
        { id: user.id, phone: user.phone, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        user: { id: user.id, phone: user.phone, role: user.role }
      });
    }

    // For email verification only (no user creation/login)
    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    next(error);
  }
};

const bcrypt = require("bcryptjs");

const adminLoginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password too short"),
});

const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    
    const user = await prisma.user.findFirst({
      where: { 
        email,
        role: "admin"
      }
    });

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials or unauthorized role" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    next(error);
  }
};

const kycTeamLogin = async (req, res, next) => {
  try {
    const { email, password } = adminLoginSchema.parse(req.body);
    
    // Check CRM database for KYC Team access
    const crmCheck = await crmService.checkKycTeamPermission(email);

    if (!crmCheck.authorized || !crmCheck.user.password) {
      console.warn(`[Auth] Failed login for ${email}: Not found or unauthorized role. Error:`, crmCheck.error || 'None');
      return res.status(401).json({ error: "Invalid credentials or unauthorized role" });
    }

    // Laravel PHP uses $2y$ bcrypt prefix, Node.js bcryptjs uses $2a$.
    // They are algorithmically identical — swap prefix for compatibility.
    let crmPasswordHash = crmCheck.user.password;
    if (crmPasswordHash.startsWith("$2y$")) {
      crmPasswordHash = "$2a$" + crmPasswordHash.slice(4);
    }

    const isValid = await bcrypt.compare(password, crmPasswordHash);
    if (!isValid) {
      console.warn(`[Auth] Failed login for ${email}: Password mismatch.`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Parse the stages from CRM (they are stored as JSON string in the DB)
    let kycStages = [];
    try {
      let userStages = [];
      let roleStages = [];
      
      if (crmCheck.user.kyc_portal_stages) {
        userStages = JSON.parse(crmCheck.user.kyc_portal_stages) || [];
      }
      
      if (crmCheck.user.role_kyc_stages) {
        roleStages = JSON.parse(crmCheck.user.role_kyc_stages) || [];
      }
      
      // Merge unique stages from both user-specific assignment and role-inherited assignment
      kycStages = [...new Set([...userStages, ...roleStages])];
    } catch (e) {
      console.warn("Could not parse kyc_portal_stages for user:", email);
    }

    const token = jwt.sign(
      { id: crmCheck.user.id, email: crmCheck.user.email, role: "kyc_team", kyc_stages: kycStages },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: { id: crmCheck.user.id, email: crmCheck.user.email, role: "kyc_team", kyc_stages: kycStages }
    });
  } catch (error) {
    next(error);
  }
};

const kycSignupSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password too short"),
  phone: z.string().min(10, "Invalid phone").optional(),
});

const kycTeamSignup = async (req, res, next) => {
  try {
    const { email, password, phone } = kycSignupSchema.parse(req.body);

    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        phone: phone || `kyc_${Date.now()}`, // phone is unique in schema, provide fallback
        password: hashedPassword,
        role: "kyc_team"
      }
    });

    res.json({ success: true, message: "KYC Team member created successfully." });
  } catch (error) {
    next(error);
  }
};

// Setup route to create initial admin (only works if no admin exists)
const setupAdmin = async (req, res, next) => {
  try {
    const adminExists = await prisma.user.findFirst({ where: { role: "admin" } });
    if (adminExists) {
      return res.status(403).json({ error: "Admin already exists" });
    }

    const { email, password, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        role: "admin"
      }
    });

    res.json({ success: true, message: "Initial admin created" });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendOtp, verifyOtp, adminLogin, kycTeamLogin, kycTeamSignup, setupAdmin };
