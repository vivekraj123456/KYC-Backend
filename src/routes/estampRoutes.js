const express = require('express');
const router = express.Router();
const estampController = require('../controllers/estampController');
const { adminAuth } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// Apply admin middleware to all routes
router.use(adminAuth);

// Upload E-Stamp (uses memory storage or local disk depending on uploadMiddleware)
// Assuming uploadMiddleware handles the 'file' field and attaches it to req.file
router.post('/upload', upload.single('file'), estampController.uploadEStamp);

// List E-Stamps with pagination and search
router.get('/', estampController.getEStamps);

// Get E-Stamp stats
router.get('/stats', estampController.getEStampStats);

module.exports = router;
