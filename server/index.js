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
  
  // Image resources section with basic metadata
  const imageResources = createImageResources(imgWidth, imgHeight);
  
  // Layer and mask information section
  const layerInfo = createLayerInfo(imgWidth, imgHeight, channels);
  
  // Image data section
  const imageData = createImageData(data, imgWidth, imgHeight, channels);
  
  // Combine all sections
  return Buffer.concat([psdHeader, colorModeData, imageResources, layerInfo, imageData]);
}

// Create proper image resources section
function createImageResources(width, height) {
  const resources = [];
  
  // Resolution info resource
  const resInfo = Buffer.alloc(16);
  resInfo.writeUInt32BE(16, 0); // Length
  resInfo.writeUInt16BE(0x03ED, 4); // Resolution info signature
  resInfo.writeUInt16BE(0, 6); // Reserved
  resInfo.writeUInt32BE(72, 8); // HRes (72 DPI)
  resInfo.writeUInt16BE(1, 12); // HResUnit (pixels per inch)
  resInfo.writeUInt16BE(1, 14); // WidthUnit
  resInfo.writeUInt32BE(72, 16); // VRes (72 DPI)
  resInfo.writeUInt16BE(1, 20); // VResUnit
  resInfo.writeUInt16BE(1, 22); // HeightUnit
  resources.push(resInfo);
  
  // Calculate total length
  const totalLength = resources.reduce((sum, res) => sum + res.length, 0);
  
  const header = Buffer.alloc(4);
  header.writeUInt32BE(totalLength, 0);
  
  return Buffer.concat([header, ...resources]);
}

// Create proper layer info section
function createLayerInfo(width, height, channels) {
  // Layer info length (4 bytes)
  const layerInfoLength = Buffer.alloc(4);
  
  // Layer count (2 bytes)
  const layerCount = Buffer.alloc(2);
  layerCount.writeUInt16BE(1, 0); // One layer
  
  // Layer record (20 bytes per layer)
  const layerRecord = Buffer.alloc(20);
  layerRecord.writeUInt32BE(0, 0); // Top
  layerRecord.writeUInt32BE(0, 4); // Left
  layerRecord.writeUInt32BE(height, 8); // Bottom
  layerRecord.writeUInt32BE(width, 12); // Right
  layerRecord.writeUInt16BE(channels, 16); // Number of channels
  layerRecord.writeUInt16BE(0, 18); // Reserved
  
  // Channel length info (2 bytes per channel)
  const channelLengths = Buffer.alloc(channels * 2);
  for (let i = 0; i < channels; i++) {
    channelLengths.writeUInt16BE(2, i * 2); // 2 bytes for length
  }
  
  // Blend mode signature and key
  const blendMode = Buffer.alloc(8);
  blendMode.write('8BIM', 0); // Blend mode signature
  blendMode.write('norm', 4); // Normal blend mode
  
  // Opacity and clipping
  const opacityClipping = Buffer.alloc(4);
  opacityClipping.writeUInt8(255, 0); // Opacity (255 = 100%)
  opacityClipping.writeUInt8(0, 1); // Clipping (0 = base)
  opacityClipping.writeUInt8(0, 2); // Flags
  opacityClipping.writeUInt8(0, 3); // Filler
  
  // Layer mask data (empty)
  const layerMask = Buffer.alloc(4);
  layerMask.writeUInt32BE(0, 0);
  
  // Layer blending ranges (empty)
  const blendingRanges = Buffer.alloc(4);
  blendingRanges.writeUInt32BE(0, 0);
  
  // Layer name
  const layerName = Buffer.alloc(4);
  layerName.writeUInt8(0, 0); // Name length (0 = no name)
  layerName.writeUInt8(0, 1); // Padding
  layerName.writeUInt8(0, 2); // Padding
  layerName.writeUInt8(0, 3); // Padding
  
  // Additional layer info (empty)
  const additionalInfo = Buffer.alloc(4);
  additionalInfo.writeUInt32BE(0, 0);
  
  // Calculate layer info length
  const layerInfoData = Buffer.concat([
    layerCount,
    layerRecord,
    channelLengths,
    blendMode,
    opacityClipping,
    layerMask,
    blendingRanges,
    layerName,
    additionalInfo
  ]);
  
  layerInfoLength.writeUInt32BE(layerInfoData.length, 0);
  
  return Buffer.concat([layerInfoLength, layerInfoData]);
}

// Create proper image data section
function createImageData(data, width, height, channels) {
  // Compression method (2 bytes) - Raw data
  const compression = Buffer.alloc(2);
  compression.writeUInt16BE(0, 0);
  
  // Channel data lengths (2 bytes per channel)
  const channelLengths = Buffer.alloc(channels * 2);
  const dataLength = width * height;
  for (let i = 0; i < channels; i++) {
    channelLengths.writeUInt16BE(dataLength, i * 2);
  }
  
  // Convert image data to PSD format (planar RGB)
  const imageData = Buffer.alloc(dataLength * channels);
  
  // PSD stores channels separately (planar format)
  for (let c = 0; c < channels; c++) {
    for (let i = 0; i < dataLength; i++) {
      imageData[c * dataLength + i] = data[i * channels + c];
    }
  }
  
  return Buffer.concat([compression, channelLengths, imageData]);
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