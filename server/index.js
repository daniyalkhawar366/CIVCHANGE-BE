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
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

import DbCon from './libs/db.js';
import AuthRoutes from './routes/Auth.routes.js';
import AdminRoutes from './routes/Admin.routes.js';
import PdfToPsdService from './services/PdfToPsdService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

const app = express();
const server = createServer(app);

// Enhanced CORS configuration
app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'https://civchange-fe.vercel.app' // Add your production domain
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')));

// Routes
app.use('/auth', AuthRoutes);
app.use('/admin', AdminRoutes);

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const downloadsDir = path.join(__dirname, '..', 'downloads');
const tempDir = path.join(__dirname, '..', 'temp');

[uploadsDir, downloadsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Enhanced multer configuration
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

// Store conversion jobs with enhanced structure
const conversionJobs = new Map();

// Initialize PDF to PSD service
const pdfToPsdService = new PdfToPsdService();

// Health check endpoint
app.get('/', (req, res) => {
  console.log('Health check hit');
  res.status(200).json({ 
    status: 'OK', 
    message: 'Canva to PSD Converter Backend is running',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Enhanced API routes
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file size and type
    const fileSizeKB = Math.round(req.file.size / 1024);
    console.log(`File uploaded: ${req.file.originalname}, Size: ${fileSizeKB}KB`);
    
    const jobId = uuidv4();
    const filePath = req.file.path;
    const originalFileName = req.file.originalname;
    
    // Enhanced job info
    const jobInfo = {
      status: 'pending',
      filePath,
      originalFileName,
      fileSize: req.file.size,
      fileSizeKB,
      createdAt: new Date(),
      progress: 0,
      message: 'File uploaded successfully'
    };
    
    conversionJobs.set(jobId, jobInfo);
    
    res.json({ 
      jobId, 
      message: 'File uploaded successfully',
      fileName: originalFileName,
      fileSize: fileSizeKB,
      status: 'ready_for_conversion'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/convert', async (req, res) => {
  try {
    const { jobId, enhanced = false } = req.body;
    
    if (!jobId || !conversionJobs.has(jobId)) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = conversionJobs.get(jobId);
    
    if (job.status !== 'pending') {
      return res.status(400).json({ error: 'Job is not in pending state' });
    }
    
    // Update job status
    job.status = 'processing';
    job.startedAt = new Date();
    conversionJobs.set(jobId, job);
    
    // Start conversion process asynchronously
    convertPDFToPSD(job.filePath, jobId, io, job.originalFileName, enhanced)
      .catch(error => {
        console.error('Conversion process error:', error);
        const failedJob = conversionJobs.get(jobId);
        if (failedJob) {
          failedJob.status = 'error';
          failedJob.error = error.message;
          failedJob.completedAt = new Date();
          conversionJobs.set(jobId, failedJob);
        }
      });
    
    res.json({ 
      message: 'Conversion started',
      jobId,
      enhanced
    });
    
  } catch (error) {
    console.error('Convert endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  res.json(job);
});

app.delete('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  
  // Clean up files
  if (job.filePath && fs.existsSync(job.filePath)) {
    fs.unlinkSync(job.filePath);
  }
  
  if (job.outputPath && fs.existsSync(job.outputPath)) {
    fs.unlinkSync(job.outputPath);
  }
  
  conversionJobs.delete(jobId);
  res.json({ message: 'Job deleted successfully' });
});

// Get all jobs (for admin/debugging)
app.get('/api/jobs', (req, res) => {
  const jobs = Array.from(conversionJobs.entries()).map(([id, job]) => ({
    id,
    ...job
  }));
  res.json(jobs);
});

// Enhanced PDF to PSD conversion function
async function convertPDFToPSD(pdfPath, jobId, socket, originalFileName, enhanced = false) {
  let job = conversionJobs.get(jobId);
  
  try {
    // Progress callback function
    const progressCallback = (progress, message) => {
      job.progress = progress;
      job.message = message;
      conversionJobs.set(jobId, job);
      
      socket.emit('conversion-progress', { 
        jobId, 
        status: message, 
        progress: progress,
        timestamp: new Date().toISOString()
      });
    };
    
    progressCallback(0, 'Starting conversion...');
    
    // Validate input file
    if (!fs.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }
    
    // Create output path
    const baseFileName = originalFileName.replace(/\.pdf$/i, '');
    const psdFileName = `${baseFileName}_converted.psd`;
    const psdPath = path.join(downloadsDir, psdFileName);
    
    progressCallback(5, 'Initializing conversion service...');
    
    // Choose conversion method
    let result;
    if (enhanced) {
      result = await pdfToPsdService.convertPdfToPsdWithLayerDetection(
        pdfPath, 
        psdPath, 
        progressCallback
      );
    } else {
      result = await pdfToPsdService.convertPdfToPsd(
        pdfPath, 
        psdPath, 
        progressCallback
      );
    }
    
    // Update job with success info
    job.status = 'completed';
    job.progress = 100;
    job.message = 'Conversion completed successfully';
    job.downloadUrl = `/downloads/${psdFileName}`;
    job.fileName = psdFileName;
    job.completedAt = new Date();
    job.outputPath = psdPath;
    job.result = result;
    
    conversionJobs.set(jobId, job);
    
    socket.emit('conversion-progress', { 
      jobId, 
      status: 'completed', 
      progress: 100,
      downloadUrl: `/downloads/${psdFileName}`,
      fileName: psdFileName,
      result: result,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Conversion completed successfully for job ${jobId}`);
    
    // Clean up the uploaded PDF after successful conversion
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
    return psdPath;
    
  } catch (error) {
    console.error('Conversion error:', error);
    
    // Update job with error info
    job.status = 'error';
    job.error = error.message;
    job.progress = 0;
    job.message = `Conversion failed: ${error.message}`;
    job.completedAt = new Date();
    
    conversionJobs.set(jobId, job);
    
    socket.emit('conversion-error', { 
      jobId, 
      status: 'error', 
      progress: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    // Clean up on error
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
    throw error;
  }
}

// Enhanced WebSocket handling
const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log('WebSocket client connected:', socket.id);
  
  socket.on('join-job', (jobId) => {
    socket.join(jobId);
    console.log(`Client ${socket.id} joined job ${jobId}`);
  });
  
  socket.on('leave-job', (jobId) => {
    socket.leave(jobId);
    console.log(`Client ${socket.id} left job ${jobId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('WebSocket client disconnected:', socket.id);
  });
});

// Cleanup old jobs periodically (every hour)
setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  for (const [jobId, job] of conversionJobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      // Clean up old job files
      if (job.filePath && fs.existsSync(job.filePath)) {
        fs.unlinkSync(job.filePath);
      }
      if (job.outputPath && fs.existsSync(job.outputPath)) {
        fs.unlinkSync(job.outputPath);
      }
      conversionJobs.delete(jobId);
      console.log(`Cleaned up old job: ${jobId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  try {
    await DbCon();
    console.log('Database connected successfully');
    
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
      console.log(`==== Server running on port ${PORT} ====`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();