console.log("🚀 convert.js route loaded");

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import SimplePhotopeaService from '../services/simplePhotopeaService.js';
import { conversionJobs } from '../index.js';

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

// Route that matches frontend expectation - accepts jobId
router.post('/convert', async (req, res) => {
  console.log("🎯 /api/convert route hit!");
  console.log("📋 Request body:", req.body);
  
  const { jobId } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'No jobId provided' });
  }
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  console.log("📁 Job found:", job);
  
  if (!job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(404).json({ error: 'Job file not found' });
  }

  const pdfPath = job.filePath;
  const outputPath = path.join('uploads', `${Date.now()}-converted.psd`);

  try {
    console.log("🔄 Starting PDF to PSD conversion with SimplePhotopeaService...");
    console.log("📂 PDF path:", pdfPath);
    console.log("📂 Output path:", outputPath);
    
    // Update job status
    job.status = 'processing';
    job.startedAt = new Date();
    conversionJobs.set(jobId, job);
    
    const service = new SimplePhotopeaService();
    await service.convertPDFToPSD(pdfPath, outputPath, (progress, message) => {
      console.log(`[${progress}%] ${message}`);
      // Update job progress
      job.progress = progress;
      job.message = message;
      conversionJobs.set(jobId, job);
    });

    console.log("✅ Conversion completed, sending file...");
    
    // Update job with success info
    job.status = 'completed';
    job.progress = 100;
    job.message = 'Conversion completed successfully';
    job.completedAt = new Date();
    job.outputPath = outputPath;
    conversionJobs.set(jobId, job);
    
    res.download(outputPath, err => {
      if (err) {
        console.error("❌ Download error:", err);
      }
      // Clean up files after download
      try {
        fs.unlinkSync(pdfPath);
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("⚠️ Cleanup error:", cleanupError);
      }
    });
  } catch (err) {
    console.error("❌ Conversion error:", err.message);
    
    // Update job with error info
    job.status = 'error';
    job.error = err.message;
    job.progress = 0;
    job.message = `Conversion failed: ${err.message}`;
    job.completedAt = new Date();
    conversionJobs.set(jobId, job);
    
    res.status(500).json({ error: 'Conversion failed: ' + err.message });
  }
});

// Route for direct file upload (alternative approach)
router.post('/convert/file', upload.single('pdf'), async (req, res) => {
  console.log("🎯 /api/convert/file route hit!");
  console.log("📁 Request files:", req.files);
  console.log("📄 Request file:", req.file);
  console.log("📋 Request body:", req.body);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  const pdfPath = req.file.path;
  const outputPath = path.join('uploads', `${Date.now()}-converted.psd`);

  try {
    console.log("🔄 Starting PDF to PSD conversion with SimplePhotopeaService...");
    console.log("📂 PDF path:", pdfPath);
    console.log("📂 Output path:", outputPath);
    
    const service = new SimplePhotopeaService();
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
    const service = new SimplePhotopeaService();
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
