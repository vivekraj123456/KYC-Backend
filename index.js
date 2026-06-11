require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const authRoutes = require("./src/routes/authRoutes");
const kycRoutes = require("./src/routes/kycRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const digioRoutes = require("./src/routes/digioRoutes");
const agentRoutes = require("./src/routes/agentRoutes");
const crmRoutes = require("./src/routes/crmRoutes");
const errorHandler = require("./src/middlewares/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }
      if (/\.vercel\.app$/.test(origin) || origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
  }
});

// Make io available in the express app
app.set("io", io);

io.on("connection", (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  
  socket.on("join_application", (applicationId) => {
    if (applicationId) {
      socket.join(applicationId);
      console.log(`[Socket.IO] Client ${socket.id} joined room: ${applicationId}`);
    }
  });

  socket.on("join_staff", () => {
    socket.join("staff_room");
    console.log(`[Socket.IO] Client ${socket.id} joined staff_room`);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Security Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Disable CSP for easier dev with multiple ports
}));
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
      return callback(null, true);
    }
    if (/\.vercel\.app$/.test(origin) || origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Request Body Parser with increased limit for large PDFs
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Request Logging with Body Size
app.use((req, res, next) => {
  const size = req.headers['content-length'] ? (parseInt(req.headers['content-length']) / 1024).toFixed(2) + ' KB' : 'unknown size';
  console.log(`[Incoming Request] ${req.method} ${req.url} - ${size}`);
  next();
});

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Increased limit to prevent blocking during heavy polling
  message: { success: false, error: "Too many requests from this IP, please try again later." }
});
app.use("/api/", limiter);

// Static files fallback to production if not found locally
const fs = require("fs");
app.use("/uploads", (req, res, next) => {
  const filePath = path.join(__dirname, "uploads", req.path);
  if (!fs.existsSync(filePath)) {
    const remoteHost = process.env.REMOTE_UPLOADS_URL || "https://springgreen-duck-136962.hostingersite.com";
    const remoteUrl = `${remoteHost}/uploads${req.path}`;
    console.log(`[Uploads Fallback] File not found locally: ${req.path}. Redirecting to ${remoteUrl}`);
    return res.redirect(remoteUrl);
  }
  next();
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/digio", digioRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/crm", crmRoutes);

// Root route
app.get("/", (req, res) => {
  res.json({ message: "KYC API is running robustly on MySQL" });
});

// Error Handling
app.use(errorHandler);

// Start Server
server.listen(PORT, () => {
  console.log(`\n🚀 KYC API Server running on http://localhost:${PORT}`);
  console.log(`   Database: MySQL via Prisma`);
  console.log(`   Real-time: Socket.IO enabled`);
  console.log(`   Security: Helmet, Rate Limiting, Zod Validation`);
  console.log(`   SMS Service: ${process.env.SMS_AUTH ? "Configured" : "MISSING SMS_AUTH"}\n`);
});
// Server restarted at: 2026-05-18T17:56:00
