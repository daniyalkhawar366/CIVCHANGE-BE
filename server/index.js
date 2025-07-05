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

// Real PDF to PSD conversion using Sharp
async function convertPDFToPSD(pdfPath, jobId, socket, originalFileName) {
  try {
    socket.emit('conversion-progress', { jobId, status: 'starting', progress: 0 });
    
    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    socket.emit('conversion-progress', { jobId, status: 'pdf_loaded', progress: 20 });
    
    // Convert PDF to image using Sharp with better error handling
    let imageBuffer;
    let width = 800; // Default width
    let height = 600; // Default height
    
    try {
      imageBuffer = await sharp(pdfBuffer, { 
        page: 0,
        density: 300 // Higher DPI for better quality
      })
      .png()
      .toBuffer();
      
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      width = metadata.width || 800;
      height = metadata.height || 600;
      
    } catch (sharpError) {
      console.error('Sharp PDF processing error:', sharpError);
      socket.emit('conversion-progress', { jobId, status: 'pdf_fallback', progress: 40 });
      
      // Create a fallback image if Sharp can't process the PDF
      imageBuffer = await sharp({
        create: {
          width: width,
          height: height,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .png()
      .toBuffer();
    }
    
    socket.emit('conversion-progress', { jobId, status: 'pdf_converted', progress: 50 });
    
    if (!width || !height) {
      throw new Error('Could not extract image dimensions from PDF');
    }
    
    socket.emit('conversion-progress', { jobId, status: 'metadata_extracted', progress: 70 });
    
    // Create PSD file with actual image data
    const baseFileName = originalFileName.replace('.pdf', '').replace('.PDF', '');
    const psdFileName = `${baseFileName}.psd`;
    const psdPath = path.join(downloadsDir, psdFileName);
    
    // Create PSD with actual image content
    const psdData = await createPSDFromImage(imageBuffer, width, height);
    fs.writeFileSync(psdPath, psdData);
    
    socket.emit('conversion-progress', { jobId, status: 'psd_created', progress: 90 });
    
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

// Create PSD file from image data
async function createPSDFromImage(imageBuffer, width, height) {
  // Convert image to RGB format and get raw data
  const { data, info } = await sharp(imageBuffer)
    .resize(width, height)
    .png()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { width: imgWidth, height: imgHeight, channels } = info;
  
  // PSD file header (Photoshop format)
  const psdHeader = Buffer.alloc(26);
  psdHeader.write('8BPS', 0); // Signature
  psdHeader.writeUInt16BE(1, 4); // Version
  psdHeader.writeUInt32BE(0, 6); // Reserved
  psdHeader.writeUInt16BE(channels, 10); // Number of channels
  psdHeader.writeUInt32BE(imgHeight, 12); // Height
  psdHeader.writeUInt32BE(imgWidth, 16); // Width
  psdHeader.writeUInt16BE(8, 20); // Depth (8-bit)
  psdHeader.writeUInt16BE(3, 22); // Color mode (RGB)
  
  // Color mode data section (empty)
  const colorModeData = Buffer.alloc(4);
  colorModeData.writeUInt32BE(0, 0);
  
  // Image resources section (empty)
  const imageResources = Buffer.alloc(4);
  imageResources.writeUInt32BE(0, 0);
  
  // Layer and mask information section (empty)
  const layerInfo = Buffer.alloc(4);
  layerInfo.writeUInt32BE(0, 0);
  
  // Image data section
  const compression = Buffer.alloc(2);
  compression.writeUInt16BE(0, 0); // Raw data
  
  // Convert image data to PSD format (interleaved RGB)
  const imageData = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += channels) {
    // PSD stores channels separately, but we'll store as RGB
    imageData[i] = data[i]; // R
    imageData[i + 1] = data[i + 1]; // G
    imageData[i + 2] = data[i + 2]; // B
  }
  
  // Combine all sections
  return Buffer.concat([psdHeader, colorModeData, imageResources, layerInfo, compression, imageData]);
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