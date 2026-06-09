const jwt = require("jsonwebtoken");
const prisma = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "kyc-secret-key-change-in-production";

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // For CRM KYC Team agents, their ID belongs to the CRM DB, not the local DB.
    // Fetching from the local DB would risk ID collisions with regular users,
    // which would overwrite the agent's role and email.
    if (decoded.role === "kyc_team") {
      req.user = decoded;
      return next();
    }

    // Check if user exists in MySQL
    const user = await prisma.user.findUnique({
      where: { id: parseInt(decoded.id) || 0 }
    });

    if (!user && decoded.id !== "demo") {
      return res.status(401).json({ error: "User not found in local database" });
    }

    req.user = { ...decoded, ...user };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (!["admin", "kyc_team"].includes(req.user.role)) {
      return res.status(403).json({ error: "Admin/KYC team access required" });
    }
    next();
  });
};

module.exports = { auth, adminAuth };
