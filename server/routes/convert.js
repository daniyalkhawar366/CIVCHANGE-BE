console.log("🚀 convert.js route loaded");

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import PhotopeaService from '../services/PhotopeaService.js';
import { conversionJobs } from '../index.js';
import { Usermodel } from '../models/User.js';
import jwt from 'jsonwebtoken';

// Middleware to require authentication and attach user to req.user
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Usermodel.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional middleware for API health check
async function checkApiHealth(req, res, next) {
  try {
    const service = new PhotopeaService();
    const isHealthy = await service.checkApiHealth();
    
    if (!isHealthy) {
      return res.status(503).json({ 
        error: 'Conversion service temporarily unavailable. Please try again later.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('API health check failed:', error);
    // Continue anyway - the conversion will handle the error
    next();
  }
}

const router = express.Router();

// Enhanced multer configuration matching index.js
const uploadsDir = path.join(process.cwd(), 'uploads');
const downloadsDir = path.join(process.cwd(), 'downloads');

// Create directories if they don't exist
[uploadsDir, downloadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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

// Main conversion route - matches frontend expectation
router.post('/convert', requireAuth, checkApiHealth, async (req, res) => {
  console.log("🎯 /api/convert route hit!");
  console.log("📋 Request body:", req.body);
  
  const { jobId, enhanced = false } = req.body;
  
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

  // ENFORCE CONVERSION LIMITS
  const user = req.user;
  if (user.plan === 'free' && user.conversionsLeft < 1) {
    return res.status(403).json({ 
      error: 'No free conversions left. Please upgrade to continue.',
      conversionsLeft: user.conversionsLeft,
      plan: user.plan
    });
  }
  if (['basic', 'pro', 'premium'].includes(user.plan) && user.conversionsLeft < 1) {
    return res.status(403).json({ 
      error: 'No conversions left. Please upgrade your plan.',
      conversionsLeft: user.conversionsLeft,
      plan: user.plan
    });
  }

  const pdfPath = job.filePath;
  const baseFileName = job.originalFileName.replace(/\.pdf$/i, '');
  const psdFileName = `${baseFileName}_converted.psd`;
  const outputPath = path.join(downloadsDir, psdFileName);

  try {
    console.log("🔄 Starting PDF to PSD conversion with PhotopeaService...");
    console.log("📂 PDF path:", pdfPath);
    console.log("📂 Output path:", outputPath);
    
    // Update job status
    job.status = 'processing';
    job.startedAt = new Date();
    job.progress = 0;
    job.message = 'Starting conversion...';
    conversionJobs.set(jobId, job);
    
    // Initialize Photopea service
    const service = new PhotopeaService();
    
    // Convert PDF to PSD with progress tracking
    const result = await service.convertPDFToPSD(pdfPath, outputPath, (progress, message) => {
      console.log(`[${progress}%] ${message}`);
      
      // Update job progress
      job.progress = progress;
      job.message = message;
      conversionJobs.set(jobId, job);
      
      // Emit progress via WebSocket if available
      if (global.io) {
        global.io.to(jobId).emit('conversion-progress', {
          jobId,
          progress,
          message,
          status: 'processing',
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log("✅ Conversion completed successfully!");
    console.log("📊 Result:", result);
    
    // Update job with success info
    job.status = 'completed';
    job.progress = 100;
    job.message = 'Conversion completed successfully';
    job.completedAt = new Date();
    job.outputPath = outputPath;
    job.downloadUrl = `/downloads/${psdFileName}`;
    job.fileName = psdFileName;
    job.result = result;
    conversionJobs.set(jobId, job);

    // DECREMENT conversionsLeft
    if (user.plan === 'free' || ['basic', 'pro', 'premium'].includes(user.plan)) {
      user.conversionsLeft = Math.max(0, user.conversionsLeft - 1);
      await user.save();
      console.log(`💳 User ${user.email} conversions left: ${user.conversionsLeft}`);
    }

    // Emit completion via WebSocket
    if (global.io) {
      global.io.to(jobId).emit('conversion-complete', {
        jobId,
        status: 'completed',
        downloadUrl: `/downloads/${psdFileName}`,
        fileName: psdFileName,
        result: result,
        timestamp: new Date().toISOString()
      });
    }
    
    // Return success response
    res.json({
      success: true,
      message: 'Conversion completed successfully',
      jobId,
      downloadUrl: `/downloads/${psdFileName}`,
      fileName: psdFileName,
      fileSize: result.fileSizeKB,
      conversionsLeft: user.conversionsLeft
    });

  } catch (error) {
    console.error("❌ Conversion error:", error.message);
    
    // Update job with error info
    job.status = 'error';
    job.error = error.message;
    job.progress = 0;
    job.message = `Conversion failed: ${error.message}`;
    job.completedAt = new Date();
    conversionJobs.set(jobId, job);

    // Emit error via WebSocket
    if (global.io) {
      global.io.to(jobId).emit('conversion-error', {
        jobId,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Clean up uploaded file on error
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (cleanupError) {
      console.error("⚠️ Cleanup error:", cleanupError);
    }
    
    res.status(500).json({ 
      error: 'Conversion failed: ' + error.message,
      jobId,
      conversionsLeft: user.conversionsLeft
    });
  }
});

// Direct download route for completed conversions
router.get('/download/:jobId', requireAuth, async (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Job not completed yet' });
  }
  
  if (!job.outputPath || !fs.existsSync(job.outputPath)) {
    return res.status(404).json({ error: 'Converted file not found' });
  }
  
  // Send file for download
  res.download(job.outputPath, job.fileName, (err) => {
    if (err) {
      console.error("❌ Download error:", err);
      res.status(500).json({ error: 'Download failed' });
    } else {
      console.log(`✅ File downloaded: ${job.fileName}`);
      
      // Clean up files after successful download
      setTimeout(() => {
        try {
          if (fs.existsSync(job.outputPath)) {
            fs.unlinkSync(job.outputPath);
          }
          // Remove job from memory
          conversionJobs.delete(jobId);
        } catch (cleanupError) {
          console.error("⚠️ Post-download cleanup error:", cleanupError);
        }
      }, 1000);
    }
  });
});

// Route for direct file upload and conversion (alternative approach)
router.post('/convert/direct', requireAuth, checkApiHealth, upload.single('pdf'), async (req, res) => {
  console.log("🎯 /api/convert/direct route hit!");
  console.log("📄 Request file:", req.file);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  // Check conversion limits
  const user = req.user;
  if (user.plan === 'free' && user.conversionsLeft < 1) {
    return res.status(403).json({ 
      error: 'No free conversions left. Please upgrade to continue.',
      conversionsLeft: user.conversionsLeft
    });
  }

  const pdfPath = req.file.path;
  const baseFileName = req.file.originalname.replace(/\.pdf$/i, '');
  const psdFileName = `${baseFileName}_converted.psd`;
  const outputPath = path.join(downloadsDir, psdFileName);

  try {
    console.log("🔄 Starting direct PDF to PSD conversion...");
    
    const service = new PhotopeaService();
    await service.convertPDFToPSD(pdfPath, outputPath, (progress, message) => {
      console.log(`[${progress}%] ${message}`);
    });

    console.log("✅ Direct conversion completed, sending file...");
    
    // Decrement conversions
    if (user.plan === 'free' || ['basic', 'pro', 'premium'].includes(user.plan)) {
      user.conversionsLeft = Math.max(0, user.conversionsLeft - 1);
      await user.save();
    }
    
    res.download(outputPath, psdFileName, (err) => {
      // Clean up files after download
      try {
        fs.unlinkSync(pdfPath);
        fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("⚠️ Direct conversion cleanup error:", cleanupError);
      }
    });

  } catch (error) {
    console.error("❌ Direct conversion error:", error.message);
    
    // Clean up uploaded file on error
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (cleanupError) {
      console.error("⚠️ Error cleanup error:", cleanupError);
    }
    
    res.status(500).json({ 
      error: 'Conversion failed: ' + error.message,
      conversionsLeft: user.conversionsLeft
    });
  }
});

// Get conversion service status
router.get('/status', async (req, res) => {
  try {
    const service = new PhotopeaService();
    const status = await service.getApiStatus();
    res.json({
      service: 'PDF to PSD Converter',
      photopea: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      service: 'PDF to PSD Converter',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Pricing endpoint
router.get('/pricing', (req, res) => {
  const plans = [
    { 
      id: 'free', 
      name: 'Free', 
      price: 0, 
      conversions: 3, 
      features: ['3 conversions per month', 'Basic support', 'Standard quality'] 
    },
    { 
      id: 'basic', 
      name: 'Basic', 
      price: 10, 
      conversions: 25, 
      features: ['25 conversions per month', 'Email support', 'High quality', 'No watermarks'] 
    },
    { 
      id: 'pro', 
      name: 'Pro', 
      price: 29, 
      conversions: 100, 
      features: ['100 conversions per month', 'Priority support', 'Premium quality', 'Batch processing'] 
    },
    { 
      id: 'premium', 
      name: 'Premium', 
      price: 99, 
      conversions: 500, 
      features: ['500 conversions per month', 'Dedicated support', 'Ultra quality', 'API access'] 
    },
    { 
      id: 'enterprise', 
      name: 'Enterprise', 
      price: null, 
      conversions: null, 
      custom: true,
      features: ['Unlimited conversions', '24/7 support', 'Custom integrations', 'SLA guarantee'] 
    }
  ];
  res.json({ plans });
});

// Test route
router.get('/test-route', (req, res) => {
  res.json({ 
    message: 'Convert route is working',
    timestamp: new Date().toISOString()
  });
});

// Health check route
router.get('/health', async (req, res) => {
  try {
    const service = new PhotopeaService();
    const isHealthy = await service.checkApiHealth();
    
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      photopea: isHealthy,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;