const prisma = require("../config/db");

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

    const whereClause = search ? {
      OR: [
        { certificateNo: { contains: search } },
        { serialNo: { contains: search } },
      ]
    } : {};

    const [eStamps, total] = await Promise.all([
      prisma.eStamp.findMany({
        where: whereClause,
        include: {
          user: {
            select: { id: true, personalDetails: true }
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
      if (stamp.user && stamp.user.personalDetails) {
        try {
          const details = JSON.parse(stamp.user.personalDetails);
          userName = details.fullName || details.name || "N/A";
        } catch(e) {}
      }
      return {
        ...stamp,
        userName
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
