const express = require('express');
const router = express.Router();
const estampController = require('../controllers/estampController');
const { adminAuth } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// Apply admin middleware to all routes
router.use(adminAuth);

// Bulk Upload E-Stamps (returns OCR extracted data)
router.post('/bulk-upload', upload.array('files', 50), estampController.bulkUploadEStamps);

// Save Confirmed E-Stamps
router.post('/bulk-save', estampController.bulkSaveEStamps);

// Upload E-Stamp (legacy/single)
router.post('/upload', upload.single('file'), estampController.uploadEStamp);

// List E-Stamps with pagination and search
router.get('/', estampController.getEStamps);

// Get E-Stamp stats
router.get('/stats', estampController.getEStampStats);

// Update E-Stamp (must be available)
router.put('/:id', estampController.updateEStamp);

// Delete E-Stamp (must be available)
router.delete('/:id', estampController.deleteEStamp);

module.exports = router;
