import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';

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

      progressCallback(20, 'Converting PDF to PSD...');

      // Use ag-psd to create a valid PSD file
      await this.createPSDFromPDF(pdfBuffer, outputPath);
      
      progressCallback(80, 'PSD generated, saving file...');
      
      // Verify file was created
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`PSD file saved successfully: ${outputPath}, size: ${stats.size} bytes`);
        progressCallback(100, 'PSD file saved successfully');
        return outputPath;
      } else {
        throw new Error('PSD file was not created');
      }

    } catch (error) {
      console.error('API Photopea conversion error:', error);
      // Don't throw the error, let the fallback service handle it
      throw new Error(`Photopea conversion failed: ${error.message}`);
    }
  }

  async createPSDFromPDF(pdfBuffer, outputPath) {
    try {
      // Convert PDF to PNG buffer
      const imageBuffer = await sharp(pdfBuffer, { density: 300 })
        .png()
        .toBuffer();
      const { width, height } = await sharp(imageBuffer).metadata();

      // Get raw RGBA data
      const { data } = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

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
    } catch (error) {
      console.error('Failed to create PSD from PDF using ag-psd:', error);
      throw error;
    }
  }

  async close() {
    // No cleanup needed for API service
  }
}

export default ApiPhotopeaService; 