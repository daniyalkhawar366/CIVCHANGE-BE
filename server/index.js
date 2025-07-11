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
import ConvertRoutes from './routes/convert.js';
import PaymentRoutes from './routes/payment.js';
import UserRoutes from './routes/user.js';
import PhotopeaService from './services/photopeaService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const PORT = process.env.PORT || 5000;

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Not set');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

const app = express();
const server = createServer(app);

// Initialize Socket.IO with enhanced configuration
const io = new Server(server, {
  cors: {
    origin: [
      FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'https://civchange-fe.vercel.app'
    ],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make io available globally for conversion progress updates
global.io = io;

// Enhanced CORS configuration
app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'https://civchange-fe.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Register Stripe webhook route BEFORE body parsers
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Find and register webhook route before body parsers
const webhookRoute = PaymentRoutes.stack.find(r => r.route && r.route.path === '/webhook');
if (webhookRoute) {
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookRoute.route.stack[0].handle);
}

// Now register body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const downloadsDir = path.join(__dirname, '..', 'downloads');
const tempDir = path.join(__dirname, '..', 'temp');

[uploadsDir, downloadsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Serve static files
app.use('/uploads', express.static(uploadsDir));
app.use('/downloads', express.static(downloadsDir));

// Enhanced multer configuration for file uploads
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

// Global conversion jobs Map (shared with convert routes)
export const conversionJobs = new Map();

// File upload endpoint with job creation
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  console.log("📤 File upload endpoint hit");
  
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }

  try {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'uploaded',
      originalFileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      uploadedAt: new Date(),
      progress: 0,
      message: 'File uploaded successfully'
    };

    conversionJobs.set(jobId, job);
    
    console.log(`📋 Created job ${jobId} for file: ${req.file.originalname}`);
    
    res.json({
      success: true,
      jobId: jobId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Job status endpoint
app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const job = conversionJobs.get(jobId);
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    fileName: job.originalFileName,
    downloadUrl: job.downloadUrl,
    error: job.error,
    uploadedAt: job.uploadedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  });
});

// Routes registration
app.use('/auth', AuthRoutes);
app.use('/admin', AdminRoutes);
app.use('/api', ConvertRoutes);
app.use('/api/user', UserRoutes);
app.use('/api/payments', PaymentRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔗 Client connected: ${socket.id}`);

  // Join conversion job room for progress updates
  socket.on('join-job', (jobId) => {
    socket.join(jobId);
    console.log(`👥 Client ${socket.id} joined job room: ${jobId}`);
    
    // Send current job status if available
    if (conversionJobs.has(jobId)) {
      const job = conversionJobs.get(jobId);
      socket.emit('job-status', {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        message: job.message
      });
    }
  });

  // Leave job room
  socket.on('leave-job', (jobId) => {
    socket.leave(jobId);
    console.log(`👋 Client ${socket.id} left job room: ${jobId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const service = new PhotopeaService();
    const photopeaHealth = await service.checkApiHealth();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      photopea: photopeaHealth,
      activeJobs: conversionJobs.size
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'PDF to PSD Converter API',
    version: '1.0.0',
    endpoints: {
      upload: 'POST /api/upload',
      convert: 'POST /api/convert',
      convertDirect: 'POST /api/convert/direct',
      jobStatus: 'GET /api/job/:jobId',
      download: 'GET /api/download/:jobId',
      health: 'GET /health',
      pricing: 'GET /api/pricing'
    },
    websocket: {
      events: ['join-job', 'leave-job', 'conversion-progress', 'conversion-complete', 'conversion-error']
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Cleanup old jobs periodically (every 30 minutes)
setInterval(() => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago
  
  for (const [jobId, job] of conversionJobs.entries()) {
    if (job.completedAt && job.completedAt < cutoff) {
      // Clean up old completed jobs
      try {
        if (job.filePath && fs.existsSync(job.filePath)) {
          fs.unlinkSync(job.filePath);
        }
        if (job.outputPath && fs.existsSync(job.outputPath)) {
          fs.unlinkSync(job.outputPath);
        }
        conversionJobs.delete(jobId);
        console.log(`🧹 Cleaned up old job: ${jobId}`);
      } catch (error) {
        console.error(`⚠️ Error cleaning up job ${jobId}:`, error);
      }
    }
  }
}, 30 * 60 * 1000); // 30 minutes

// Connect to database
DbCon()
  .then(() => {
    console.log('✅ Database connected successfully');
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 Frontend URL: ${FRONTEND_URL}`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket URL: ws://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});