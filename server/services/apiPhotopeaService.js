import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
// import { convert } from 'pdf-poppler';
// import path from 'path';
// import os from 'os';

class ApiPhotopeaService {
  constructor() {
    this.baseUrl = 'https://www.photopea.com';
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

      progressCallback(20, 'Converting PDF to PNG (sharp only fallback)...');

      // Fallback: Use sharp to try to convert PDF to PNG directly (may fail)
      let imageBuffer, width, height, data;
      try {
        imageBuffer = await sharp(pdfBuffer, { density: 300 })
          .png()
          .toBuffer();
        const meta = await sharp(imageBuffer).metadata();
        width = meta.width;
        height = meta.height;
        const raw = await sharp(imageBuffer)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        data = raw.data;
      } catch (err) {
        throw new Error('Sharp fallback failed: ' + err.message);
      }

      // Create a single-layer PSD
      const psd = {
        width,
        height,
        children: [
          {
            name: 'Background',
            canvas: { width, height, data },
            opacity: 255,
            visible: true,
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