import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';
// import { convert } from 'pdf-poppler';
// import path from 'path';
// import os from 'os';

class ApiPhotopeaService {
  constructor() {
    this.baseUrl = 'https://www.photopea.com';
    // Set up PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = false;
  }

  async initialize() {
    try {
      console.log('Initializing API Photopea service...');
      // Test if Photopea is accessible
      const response = await axios.get(this.baseUrl, { timeout: 10000 });
      console.log('Photopea is accessible');
      return true;
    } catch (error) {
      console.error('Failed to access Photopea:', error.message);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(10, 'Preparing PDF for conversion...');

      // Read the PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);
      console.log('PDF file read, size:', pdfBuffer.length, 'bytes');

      progressCallback(20, 'Loading PDF with pdfjs-dist...');

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

      progressCallback(40, 'Rendering PDF page to canvas...');

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

      progressCallback(60, 'Processing converted image...');

      // Get image data from canvas
      const imageBuffer = canvas.toBuffer('image/png');

      progressCallback(80, 'Creating PSD with layers...');

      // Convert to raw data for PSD
      const raw = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const data = raw.data;

      // Create a single-layer PSD with proper structure
      const psd = {
        width: scaledWidth,
        height: scaledHeight,
        children: [
          {
            name: 'Background',
            canvas: { width: scaledWidth, height: scaledHeight, data },
            opacity: 255,
            visible: true,
            blendMode: 'normal',
          },
        ],
      };

      const psdBuffer = writePsdBuffer(psd);
      fs.writeFileSync(outputPath, psdBuffer);
      
      console.log('ag-psd: PSD file created and written to disk.');

      progressCallback(100, 'PSD file saved successfully');
      return outputPath;
    } catch (error) {
      console.error('API Photopea conversion error:', error);
      throw new Error(`Photopea conversion failed: ${error.message}`);
    }
  }

  async close() {
    // No cleanup needed for API service
  }
}

export default ApiPhotopeaService; 