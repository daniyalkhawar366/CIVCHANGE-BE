console.log("🚀 convert.js route loaded");

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import PhotopeaService from '../services/photopeaService.js';

const router = express.Router();

// Enhanced multer configuration matching index.js
const uploadsDir = path.join(process.cwd(), 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Enhanced file type checking
    const allowedTypes = ['application/pdf'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) && fileExtension === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Route that matches frontend expectation
router.post('/convert', upload.single('pdf'), async (req, res) => {
  console.log("🎯 /api/convert route hit!");
  console.log("📁 Request files:", req.files);
  console.log("📄 Request file:", req.file);
  console.log("📋 Request body:", req.body);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const pdfPath = req.file.path;
  const outputPath = path.join('uploads', `${Date.now()}-converted.psd`);

  try {
    console.log("🔄 Starting PDF to PSD conversion with PhotopeaService...");
    console.log("📂 PDF path:", pdfPath);
    console.log("📂 Output path:", outputPath);
    
    const service = new PhotopeaService();
    await service.convertPDFToPSD(pdfPath, outputPath, (progress, message) => {
      console.log(`[${progress}%] ${message}`);
    });

    console.log("✅ Conversion completed, sending file...");
    res.download(outputPath, err => {
      if (err) {
        console.error("❌ Download error:", err);
      }
      // Clean up files
      try {
        fs.unlinkSync(pdfPath);
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("⚠️ Cleanup error:", cleanupError);
      }
    });
  } catch (err) {
    console.error("❌ Conversion error:", err.message);
    res.status(500).json({ error: 'Conversion failed: ' + err.message });
  }
});

// Original route for backward compatibility
router.post('/convert/pdf-to-psd', upload.single('pdf'), async (req, res) => {
  const pdfPath = req.file.path;
  const outputPath = path.join('uploads', `${Date.now()}-converted.psd`);

  try {
    const service = new PhotopeaService();
    await service.convertPDFToPSD(pdfPath, outputPath, (p, msg) => {
      console.log(`[${p}%] ${msg}`);
    });

    res.download(outputPath, err => {
      fs.unlinkSync(pdfPath);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

router.get('/test-route', (req, res) => {
  res.send('Convert route is working');
});

export default router;
