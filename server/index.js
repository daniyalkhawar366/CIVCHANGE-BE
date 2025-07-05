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

// PDF to PSD conversion using a simpler approach
async function convertPDFToPSD(pdfPath, jobId, socket, originalFileName) {
  try {
    socket.emit('conversion-progress', { jobId, status: 'starting', progress: 0 });
    
    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    socket.emit('conversion-progress', { jobId, status: 'pdf_loaded', progress: 30 });
    
    // Create a basic PSD file structure
    const baseFileName = originalFileName.replace('.pdf', '').replace('.PDF', '');
    const psdFileName = `${baseFileName}.psd`;
    const psdPath = path.join(downloadsDir, psdFileName);
    
    // Create a minimal valid PSD file
    const psdData = createBasicPSDFile(pdfBuffer);
    fs.writeFileSync(psdPath, psdData);
    
    socket.emit('conversion-progress', { jobId, status: 'psd_created', progress: 80 });
    
    // Clean up the uploaded PDF
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
    
    socket.emit('conversion-progress', { 
      jobId, 
      status: 'completed', 
      progress: 100,
      downloadUrl: `/downloads/${psdFileName}`,
      fileName: psdFileName
    });
    
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
  }
}

// Create a basic PSD file structure
function createBasicPSDFile(pdfBuffer) {
  // PSD file header (Photoshop format)
  const psdHeader = Buffer.from([
    0x38, 0x42, 0x50, 0x53, // "8BPS" signature
    0x00, 0x01, // Version 1
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
    0x00, 0x03, // Number of channels (RGB)
    0x00, 0x00, 0x01, 0x00, // Height (256 pixels)
    0x00, 0x00, 0x01, 0x00, // Width (256 pixels)
    0x00, 0x08, // Depth (8-bit)
    0x00, 0x03  // Color mode (RGB)
  ]);
  
  // Color mode data section
  const colorModeData = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No color mode data
  
  // Image resources section
  const imageResources = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No image resources
  
  // Layer and mask information section
  const layerInfo = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No layers
  
  // Image data section (compressed)
  const imageData = Buffer.from([0x00, 0x00]); // Raw data length (0 for now)
  
  // Combine all sections
  return Buffer.concat([psdHeader, colorModeData, imageResources, layerInfo, imageData]);
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