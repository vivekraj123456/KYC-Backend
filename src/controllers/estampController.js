const prisma = require("../config/db");
const Tesseract = require('tesseract.js');

exports.uploadEStamp = async (req, res) => {
  try {
    const { certificateNo, serialNo } = req.body;
    
    if (!certificateNo || !serialNo) {
      return res.status(400).json({ success: false, error: "Certificate No and Serial No are required." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: "E-Stamp file is required." });
    }

    const fileUrl = req.file.path; // Cloudinary URL from uploadMiddleware

    const eStamp = await prisma.eStamp.create({
      data: {
        certificateNo,
        serialNo,
        fileUrl,
        status: "available",
      },
    });

    res.json({ success: true, eStamp });
  } catch (error) {
    console.error("Error uploading E-Stamp:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: "Certificate No or Serial No already exists." });
    }
    res.status(500).json({ success: false, error: "Server error during upload." });
  }
};

exports.getEStamps = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const statusFilter = req.query.status || "";

    const whereClause = {};
    if (search) {
      whereClause.OR = [
        { certificateNo: { contains: search } },
        { serialNo: { contains: search } },
      ];
    }
    if (statusFilter && statusFilter !== "all") {
      whereClause.status = statusFilter;
    }

    const [eStamps, total] = await Promise.all([
      prisma.eStamp.findMany({
        where: whereClause,
        include: {
          user: {
            select: { 
              id: true, 
              phone: true,
              email: true,
              kycApplications: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { applicationId: true, personalDetails: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.eStamp.count({ where: whereClause })
    ]);

    // Parse user personalDetails to get name
    const formattedEStamps = eStamps.map(stamp => {
      let userName = "N/A";
      let kycApplicationId = null;
      if (stamp.user) {
        // Fallback to phone or email if name isn't found
        userName = stamp.user.email || stamp.user.phone || "N/A";
        if (stamp.user.kycApplications && stamp.user.kycApplications.length > 0) {
          kycApplicationId = stamp.user.kycApplications[0].applicationId;
          try {
            const details = JSON.parse(stamp.user.kycApplications[0].personalDetails);
            if (details && (details.fullName || details.name)) {
              userName = details.fullName || details.name;
            }
          } catch(e) {}
        }
      }
      return {
        ...stamp,
        userName,
        kycApplicationId
      };
    });

    res.json({
      success: true,
      eStamps: formattedEStamps,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching E-Stamps:", error);
    res.status(500).json({ success: false, error: "Server error fetching E-Stamps." });
  }
};

exports.getEStampStats = async (req, res) => {
  try {
    const [total, assigned, available] = await Promise.all([
      prisma.eStamp.count(),
      prisma.eStamp.count({ where: { status: "assigned" } }),
      prisma.eStamp.count({ where: { status: "available" } })
    ]);

    res.json({
      success: true,
      stats: {
        totalUploaded: total,
        totalUsed: assigned,
        totalLeft: available
      }
    });
  } catch (error) {
    console.error("Error fetching E-Stamp stats:", error);
    res.status(500).json({ success: false, error: "Server error fetching stats." });
  }
};

exports.bulkUploadEStamps = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No E-Stamp files provided." });
    }

    const results = [];

    for (const file of req.files) {
      const fileUrl = file.path; // Cloudinary URL
      let certificateNo = "";
      let serialNo = "";

      try {
        // Run OCR on the uploaded image
        const { data: { text } } = await Tesseract.recognize(fileUrl, 'eng');
        
        // Extract Certificate No (usually IN-something)
        const certMatch = text.match(/IN-[A-Z0-9]+/i);
        if (certMatch) {
          certificateNo = certMatch[0].toUpperCase();
        }

        // Try to extract serial no (assuming it's a 6 digit number somewhere, this is a basic heuristic)
        // Red color extraction isn't natively supported by basic tesseract without image preprocessing
        const serialMatch = text.match(/\b\d{6,8}\b/g);
        if (serialMatch && serialMatch.length > 0) {
          // just pick the first likely one if found, admin can correct it
          serialNo = serialMatch[0];
        }
      } catch (ocrError) {
        console.error("OCR Failed for image:", fileUrl, ocrError);
      }

      results.push({
        fileUrl,
        certificateNo: certificateNo || "",
        serialNo: serialNo || "",
        status: "pending_verification"
      });
    }

    res.json({ success: true, extractedData: results });
  } catch (error) {
    console.error("Error during bulk upload:", error);
    res.status(500).json({ success: false, error: "Server error during bulk upload." });
  }
};

exports.bulkSaveEStamps = async (req, res) => {
  try {
    const { eStamps } = req.body; // Array of { certificateNo, serialNo, fileUrl }

    if (!eStamps || !Array.isArray(eStamps) || eStamps.length === 0) {
      return res.status(400).json({ success: false, error: "No E-Stamps provided to save." });
    }

    const savedStamps = [];
    const errors = [];

    for (const stamp of eStamps) {
      if (!stamp.certificateNo || !stamp.serialNo || !stamp.fileUrl) {
        errors.push({ stamp, error: "Missing required fields" });
        continue;
      }

      try {
        const newStamp = await prisma.eStamp.create({
          data: {
            certificateNo: stamp.certificateNo,
            serialNo: stamp.serialNo,
            fileUrl: stamp.fileUrl,
            status: "available",
          },
        });
        savedStamps.push(newStamp);
      } catch (dbError) {
        if (dbError.code === 'P2002') {
          errors.push({ stamp, error: "Duplicate Certificate No or Serial No" });
        } else {
          errors.push({ stamp, error: dbError.message });
        }
      }
    }

    res.json({ 
      success: true, 
      savedCount: savedStamps.length, 
      errors, 
      message: `Successfully saved ${savedStamps.length} E-Stamps.` 
    });
  } catch (error) {
    console.error("Error saving bulk E-Stamps:", error);
    res.status(500).json({ success: false, error: "Server error saving E-Stamps." });
  }
};
exports.updateEStamp = async (req, res) => {
  try {
    const { id } = req.params;
    const { certificateNo, serialNo } = req.body;

    const existing = await prisma.eStamp.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "E-Stamp not found" });
    }

    if (existing.status !== "available") {
      return res.status(400).json({ success: false, error: "Cannot edit an assigned E-Stamp." });
    }

    const updated = await prisma.eStamp.update({
      where: { id: parseInt(id) },
      data: {
        certificateNo: certificateNo || existing.certificateNo,
        serialNo: serialNo || existing.serialNo
      }
    });

    res.json({ success: true, eStamp: updated });
  } catch (error) {
    console.error("Update EStamp Error:", error);
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, error: "Certificate No or Serial No already exists." });
    }
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.deleteEStamp = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.eStamp.findUnique({ where: { id: parseInt(id) } });
    
    if (!existing) {
      return res.status(404).json({ success: false, error: "E-Stamp not found" });
    }

    if (existing.status !== "available") {
      return res.status(400).json({ success: false, error: "Cannot delete an assigned E-Stamp." });
    }

    await prisma.eStamp.delete({ where: { id: parseInt(id) } });

    res.json({ success: true, message: "E-Stamp deleted successfully" });
  } catch (error) {
    console.error("Delete EStamp Error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
