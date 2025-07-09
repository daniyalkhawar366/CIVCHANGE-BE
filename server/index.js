console.log('==== DEBUG: Node version', process.version);
console.log('==== DEBUG: Platform', process.platform, process.arch);
console.log('==== SERVER STARTING ====');

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import dotenv from 'dotenv';

// Load environment variables from the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

import DbCon from './libs/db.js';
import AuthRoutes from './routes/Auth.routes.js';
import ApiPhotopeaService from './services/apiPhotopeaService.js';
import FallbackService from './services/fallbackService.js';
import HybridPdfService from './services/hybridPdfService.js';
import AdminRoutes from './routes/Admin.routes.js';

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

const app = express();
const server = createServer(app);

// Log the request Origin for every request
app.use((req, res, next) => {
  console.log('Request Origin:', req.headers.origin);
  next();
});

// Allow all origins for CORS (debugging only)
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Global OPTIONS handler for preflight
app.options('*', cors());

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')));

// Auth Routes
app.use('/auth', AuthRoutes);
app.use('/admin', AdminRoutes);

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const downloadsDir = path.join(__dirname, '..', 'downloads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Configure multer for file uploads
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
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Store conversion jobs
const conversionJobs = new Map();

// Health check endpoint (must be before server.listen)
app.get('/', (req, res) => {
  console.log('Health check hit');
  res.status(200).json({ status: 'OK', message: 'Canva to PSD Converter Backend is running' });
});

// Routes
app.post('/api/upload', upload.single('pdf'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const jobId = uuidv4();
    const filePath = req.file.path;
    const originalFileName = req.file.originalname;
    
    // Store job info
    conversionJobs.set(jobId, {
      status: 'pending',
      filePath,
      originalFileName,
      createdAt: new Date()
    });
    
    res.json({ 
      jobId, 
      message: 'File uploaded successfully',
      fileName: originalFileName
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/convert', (req, res) => {
  const { jobId } = req.body;
  
  if (!jobId || !conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  
  // Start conversion process
  convertPDFToPSD(job.filePath, jobId, io, job.originalFileName);
  
  res.json({ message: 'Conversion started' });
});

app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(conversionJobs.get(jobId));
});

// Real PDF to PSD conversion using Hybrid approach with fallback
async function convertPDFToPSD(pdfPath, jobId, socket, originalFileName) {
  const hybridService = new HybridPdfService();
  const fallbackService = new FallbackService();
  
  try {
    socket.emit('conversion-progress', { jobId, status: 'starting', progress: 0 });
    
    // Create output path
    const baseFileName = originalFileName.replace('.pdf', '').replace('.PDF', '');
    const psdFileName = `${baseFileName}.psd`;
    const psdPath = path.join(downloadsDir, psdFileName);
    
    // Progress callback function
    const progressCallback = (progress, message) => {
      socket.emit('conversion-progress', { 
        jobId, 
        status: message, 
        progress: progress 
      });
    };
    
    try {
      // Try Hybrid service first for best quality and layer preservation
      socket.emit('conversion-progress', { jobId, status: 'initializing_hybrid_service', progress: 5 });
      
      // Add timeout for Hybrid service initialization
      const hybridPromise = hybridService.initialize();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Hybrid service initialization timeout')), 30000)
      );
      
      await Promise.race([hybridPromise, timeoutPromise]);
      socket.emit('conversion-progress', { jobId, status: 'hybrid_service_initialized', progress: 10 });
      
      // Add timeout for Hybrid conversion
      const conversionPromise = hybridService.convertPDFToPSD(pdfPath, psdPath, progressCallback);
      const conversionTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Hybrid conversion timeout')), 180000) // 3 minutes
      );
      
      await Promise.race([conversionPromise, conversionTimeoutPromise]);
      
      // Update job status
      const job = conversionJobs.get(jobId);
      if (job) {
        job.status = 'completed_with_hybrid';
        job.progress = 100;
        job.downloadUrl = `/downloads/${psdFileName}`;
        job.fileName = psdFileName;
      }
      
      socket.emit('conversion-progress', { 
        jobId, 
        status: 'completed_with_hybrid', 
        progress: 100,
        downloadUrl: `/downloads/${psdFileName}`,
        fileName: psdFileName
      });
      
      console.log(`Hybrid conversion completed successfully for job ${jobId}`);
      
    } catch (hybridError) {
      console.error('Hybrid conversion failed, using fallback:', hybridError);
      
      try {
        // If Hybrid fails, use fallback service
        socket.emit('conversion-progress', { 
          jobId, 
          status: 'hybrid_failed_using_fallback', 
          progress: 5 
        });
        
        await fallbackService.convertPDFToPSD(pdfPath, psdPath, progressCallback);
        
        // Update job status
        const job = conversionJobs.get(jobId);
        if (job) {
          job.status = 'completed_with_fallback';
          job.progress = 100;
          job.downloadUrl = `/downloads/${psdFileName}`;
          job.fileName = psdFileName;
          job.warning = 'Used basic conversion - layers may not be preserved';
        }
        
        socket.emit('conversion-progress', { 
          jobId, 
          status: 'completed_with_fallback', 
          progress: 100,
          downloadUrl: `/downloads/${psdFileName}`,
          fileName: psdFileName,
          warning: 'Used basic conversion - layers may not be preserved'
        });
        
        console.log(`Fallback conversion completed for job ${jobId}`);
      } catch (fallbackError) {
        console.error('Fallback conversion also failed:', fallbackError);
        
        // Update job status to error
        const job = conversionJobs.get(jobId);
        if (job) {
          job.status = 'error';
          job.error = fallbackError.message;
        }
        
        socket.emit('conversion-progress', { 
          jobId, 
          status: 'error', 
          progress: 0,
          error: `Both Hybrid and fallback conversion failed: ${fallbackError.message}`
        });
      }
    }
    
    // Clean up the uploaded PDF
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
    return psdPath;
    
  } catch (error) {
    console.error('Conversion error:', error);
    socket.emit('conversion-progress', { 
      jobId, 
      status: 'error', 
      progress: 0,
      error: error.message 
    });
    
    // Clean up on error
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  } finally {
    // Always close the Hybrid service
    await hybridService.close();
  }
}

// WebSocket connection handling
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id);
  });
});

// Ensure MongoDB is connected before starting the server
await DbCon();

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`==== DEBUG: Server running on port ${PORT}`);
}); 