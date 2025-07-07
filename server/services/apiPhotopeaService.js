import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
import { convert } from 'pdf-poppler';
import path from 'path';
import os from 'os';

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

      progressCallback(20, 'Converting PDF to PNG...');

      // Use pdf-poppler to convert PDF to PNG (first page)
      const tempDir = os.tmpdir();
      const tempPdfPath = path.join(tempDir, `input-${Date.now()}.pdf`);
      fs.writeFileSync(tempPdfPath, pdfBuffer);
      const outputDir = tempDir;
      const outPrefix = `page-${Date.now()}`;
      const opts = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: outPrefix,
        page: 1
      };
      await convert(tempPdfPath, opts);
      const pngPath = path.join(outputDir, `${outPrefix}-1.png`);
      if (!fs.existsSync(pngPath)) {
        throw new Error('Failed to convert PDF to PNG');
      }

      progressCallback(40, 'PNG created, generating PSD...');

      // Use sharp to get image data
      const imageBuffer = fs.readFileSync(pngPath);
      const { width, height } = await sharp(imageBuffer).metadata();
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

      // Clean up temp files
      fs.unlinkSync(tempPdfPath);
      fs.unlinkSync(pngPath);

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