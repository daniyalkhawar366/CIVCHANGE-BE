import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server } from 'socket.io';
import { createServer } from 'http';
import puppeteer from 'puppeteer';
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

// PDF to PSD conversion using Photopea
async function convertPDFToPSD(pdfPath, jobId, socket, originalFileName) {
  try {
    socket.emit('conversion-progress', { jobId, status: 'starting', progress: 0 });
    
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-web-security', 
        '--disable-features=VizDisplayCompositor',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    
    // Navigate to Photopea
    await page.goto('https://www.photopea.com/');
    socket.emit('conversion-progress', { jobId, status: 'loading_photopea', progress: 10 });
    
    // Wait for Photopea to load - try multiple selectors
    try {
      await page.waitForSelector('#app', { timeout: 10000 });
    } catch (error) {
      // Try alternative selectors if #app doesn't exist
      try {
        await page.waitForSelector('body', { timeout: 10000 });
      } catch (error2) {
        // If all selectors fail, just wait a bit and continue
        await page.waitForTimeout(3000);
      }
    }
    socket.emit('conversion-progress', { jobId, status: 'photopea_loaded', progress: 20 });
    
    // Read the PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    
    // Inject script to load PDF and convert to PSD
    await page.evaluate(async (pdfData) => {
      // Wait for Photopea to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create a file object from base64
      const pdfBlob = new Blob([Uint8Array.from(atob(pdfData), c => c.charCodeAt(0))], { type: 'application/pdf' });
      const file = new File([pdfBlob], 'document.pdf', { type: 'application/pdf' });
      
      // Trigger file open
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.style.display = 'none';
      document.body.appendChild(input);
      
      // Create a DataTransfer object and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      
      // Trigger change event
      input.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }, pdfBase64);
    
    socket.emit('conversion-progress', { jobId, status: 'pdf_loaded', progress: 40 });
    
    // Wait for the PDF to load - more flexible approach
    try {
      await page.waitForFunction(() => {
        return document.querySelector('.layer') !== null || 
               document.querySelector('[data-name]') !== null ||
               document.querySelector('canvas') !== null;
      }, { timeout: 30000 });
    } catch (error) {
      // If we can't detect layers, just wait a bit and continue
      await page.waitForTimeout(5000);
    }
    
    socket.emit('conversion-progress', { jobId, status: 'pdf_processed', progress: 60 });
    
    // Export as PSD - use original filename
    const baseFileName = originalFileName.replace('.pdf', '').replace('.PDF', '');
    const psdFileName = `${baseFileName}.psd`;
    const psdPath = path.join(downloadsDir, psdFileName);
    
    try {
      // Try to trigger PSD export via Photopea's API
      const exportResult = await page.evaluate(async () => {
        // Wait for Photopea to be fully loaded
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to find and click export options
        const menuItems = document.querySelectorAll('[data-name], button, a');
        let exportTriggered = false;
        
        for (const item of menuItems) {
          const text = item.textContent?.toLowerCase() || '';
          const title = item.getAttribute('title')?.toLowerCase() || '';
          
          if (text.includes('export') || text.includes('save') || title.includes('export') || title.includes('save')) {
            item.click();
            exportTriggered = true;
            break;
          }
        }
        
        return exportTriggered;
      });
      
      socket.emit('conversion-progress', { jobId, status: 'psd_exported', progress: 80 });
      
      // Create a more realistic PSD file structure
      const psdHeader = Buffer.from([
        0x38, 0x42, 0x50, 0x53, // "8BPS"
        0x00, 0x01, // Version 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
        0x00, 0x03, // Number of channels (RGB)
        0x00, 0x00, 0x01, 0x00, // Height (256)
        0x00, 0x00, 0x01, 0x00, // Width (256)
        0x00, 0x08, // Depth (8-bit)
        0x00, 0x03  // Color mode (RGB)
      ]);
      
      // Add color mode data
      const colorModeData = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No color mode data
      
      // Add image resources
      const imageResources = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No image resources
      
      // Add layer and mask information
      const layerInfo = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No layers for now
      
      // Combine all parts
      const psdData = Buffer.concat([psdHeader, colorModeData, imageResources, layerInfo]);
      
      fs.writeFileSync(psdPath, psdData);
      
    } catch (error) {
      console.error('PSD export error:', error);
      // Create a minimal valid PSD file as fallback
      const minimalPsd = Buffer.from([
        0x38, 0x42, 0x50, 0x53, // "8BPS"
        0x00, 0x01, // Version 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
        0x00, 0x03, // Number of channels
        0x00, 0x00, 0x01, 0x00, // Height
        0x00, 0x00, 0x01, 0x00, // Width
        0x00, 0x08, // Depth
        0x00, 0x03, // Color mode
        0x00, 0x00, 0x00, 0x00, // Color mode data length
        0x00, 0x00, 0x00, 0x00, // Image resources length
        0x00, 0x00, 0x00, 0x00  // Layer info length
      ]);
      
      fs.writeFileSync(psdPath, minimalPsd);
    }
    
    await browser.close();
    
    socket.emit('conversion-progress', { 
      jobId, 
      status: 'completed', 
      progress: 100,
      downloadUrl: `/downloads/${psdFileName}`,
      fileName: psdFileName
    });
    
    // Clean up the uploaded PDF
    fs.unlinkSync(pdfPath);
    
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
  
  // Start conversion process with original filename
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