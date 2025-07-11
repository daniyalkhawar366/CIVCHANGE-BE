import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

class PhotopeaService {
  constructor() {
    this.apiEndpoint = 'https://www.photopea.com/api/';
  }

  // Primary method to call externally
  async convertPDFToPSD(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      return await this.convertWithScript(pdfPath, outputPath, progressCallback);
    } catch (error) {
      console.error('PhotopeaService script-based conversion failed:', error);
      throw new Error(`Photopea script conversion failed: ${error.message}`);
    }
  }

  // Scripting-based conversion method (robust)
  async convertWithScript(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      progressCallback(5, 'Initializing Photopea API...');

      const pdfBuffer = fs.readFileSync(pdfPath);
      const base64pdf = pdfBuffer.toString('base64');

      const script = `
        await app.open("input.pdf");
        await new Promise(r => setTimeout(r, 2000));
        await app.saveAs("output.psd");
      `;

      const payload = {
        files: {
          'input.pdf': base64pdf
        },
        script: script
      };

      progressCallback(10, 'Uploading PDF to Photopea...');

      const response = await axios.post(this.apiEndpoint, payload, {
        responseType: 'arraybuffer'
      });

      progressCallback(80, 'Processing conversion response...');

      if (!response.data || response.data.length < 20000) {
        throw new Error('Received an invalid or too-small PSD file from Photopea');
      }

      progressCallback(90, 'Saving PSD file...');

      fs.writeFileSync(outputPath, response.data);

      progressCallback(100, 'Conversion completed successfully');

      return {
        success: true,
        outputPath,
        fileSize: response.data.length,
        fileSizeKB: Math.round(response.data.length / 1024),
        message: 'PDF converted to PSD successfully'
      };
    } catch (err) {
      console.error('[Photopea script API Error]:', err.message);
      throw err;
    }
  }
}

export default PhotopeaService;
