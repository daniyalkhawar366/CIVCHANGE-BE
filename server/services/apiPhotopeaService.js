import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
import { fromPath } from 'pdf2pic';
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

      progressCallback(20, 'Converting PDF to image using pdf2pic...');

      // Convert PDF to image using pdf2pic
      const options = {
        density: 300, // High DPI for better quality
        saveFilename: "page",
        savePath: "./temp/",
        format: "png",
        width: 2048, // Max width
        height: 2048  // Max height
      };

      const convert = fromPath(pdfPath, options);
      
      // Convert first page only
      const pageData = await convert(1);
      
      if (!pageData || !pageData.path) {
        throw new Error('Failed to convert PDF to image');
      }

      progressCallback(40, 'Processing converted image...');

      // Read the converted image
      const imageBuffer = fs.readFileSync(pageData.path);
      
      // Get image metadata
      const meta = await sharp(imageBuffer).metadata();
      const width = meta.width;
      const height = meta.height;
      
      if (!width || !height) {
        throw new Error('Could not extract image dimensions');
      }

      progressCallback(60, 'Creating PSD with layers...');

      // Convert to raw data for PSD
      const raw = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const data = raw.data;

      // Create a single-layer PSD with proper structure
      const psd = {
        width,
        height,
        children: [
          {
            name: 'Background',
            canvas: { width, height, data },
            opacity: 255,
            visible: true,
            blendMode: 'normal',
          },
        ],
      };

      const psdBuffer = writePsdBuffer(psd);
      fs.writeFileSync(outputPath, psdBuffer);
      
      // Clean up temporary image file
      if (fs.existsSync(pageData.path)) {
        fs.unlinkSync(pageData.path);
      }
      
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