import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')));

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

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Canva to PSD Converter Backend is running' });
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
  
  // For now, just simulate conversion
  simulateConversion(job.filePath, jobId, io, job.originalFileName);
  
  res.json({ message: 'Conversion started' });
});

app.get('/api/job/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  if (!conversionJobs.has(jobId)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(conversionJobs.get(jobId));
});

// Simulate conversion for now
async function simulateConversion(pdfPath, jobId, socket, originalFileName) {
  try {
    socket.emit('conversion-progress', { jobId, status: 'starting', progress: 0 });
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    socket.emit('conversion-progress', { jobId, status: 'processing', progress: 50 });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    socket.emit('conversion-progress', { jobId, status: 'completed', progress: 100 });
    
    // Clean up the uploaded PDF
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
  } catch (error) {
    console.error('Conversion error:', error);
    socket.emit('conversion-progress', { 
      jobId, 
      status: 'error', 
      progress: 0,
      error: error.message 
    });
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 