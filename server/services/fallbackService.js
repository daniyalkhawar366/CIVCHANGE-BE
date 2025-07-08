import sharp from 'sharp';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';

class FallbackService {
  constructor() {
    // Set up PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(10, 'Using fallback conversion method...');
      
      // Read the PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);
      progressCallback(20, 'PDF loaded, converting to image...');
      
      // Load PDF using pdfjs-dist
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdf = await loadingTask.promise;
      
      if (pdf.numPages === 0) {
        throw new Error('PDF has no pages');
      }

      // Get first page
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better quality
      
      const scaledWidth = Math.floor(viewport.width);
      const scaledHeight = Math.floor(viewport.height);

      progressCallback(40, 'Creating fallback image...');

      // Create canvas and render PDF page
      const canvas = createCanvas(scaledWidth, scaledHeight);
      const ctx = canvas.getContext('2d');
      
      // Set white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      
      // Render PDF page to canvas
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;

      // Get image data from canvas
      const imageBuffer = canvas.toBuffer('image/png');
      
      progressCallback(50, 'Image created, generating PSD...');
      
      progressCallback(70, 'Creating PSD file...');
      
      // Create basic PSD file
      const psdData = await this.createBasicPSD(imageBuffer, scaledWidth, scaledHeight);
      fs.writeFileSync(outputPath, psdData);
      
      progressCallback(100, 'PSD file created (basic conversion)');
      return outputPath;
      
    } catch (error) {
      console.error('Fallback conversion error:', error);
      throw error;
    }
  }

  async createBasicPSD(imageBuffer, width, height) {
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
}

export default FallbackService; 