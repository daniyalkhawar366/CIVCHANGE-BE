import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

class PhotopeaService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to Photopea
      await this.page.goto('https://www.photopea.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for Photopea to load completely
      await this.page.waitForSelector('#app', { timeout: 30000 });
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Photopea service:', error);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    try {
      if (!this.page) {
        await this.initialize();
      }

      progressCallback(10, 'Loading PDF into Photopea...');

      // Upload the PDF file to Photopea
      const inputElement = await this.page.$('input[type="file"]');
      if (!inputElement) {
        throw new Error('File input not found on Photopea page');
      }

      await inputElement.uploadFile(pdfPath);
      progressCallback(20, 'PDF uploaded, processing...');

      // Wait for the PDF to load and process
      await this.page.waitForFunction(() => {
        return window.app && window.app.activeDocument;
      }, { timeout: 60000 });

      progressCallback(40, 'PDF processed, preparing for export...');

      // Wait a bit more for full processing
      await this.page.waitForTimeout(3000);

      // Execute Photopea API to export as PSD
      progressCallback(60, 'Exporting as PSD...');
      
      const psdData = await this.page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          try {
            // Use Photopea's internal API to export as PSD
            const doc = window.app.activeDocument;
            if (!doc) {
              reject(new Error('No active document found'));
              return;
            }

            // Export as PSD using Photopea's API
            window.app.invoke('file/export', {
              format: 'psd',
              document: doc
            }).then((result) => {
              resolve(result);
            }).catch(reject);

          } catch (error) {
            reject(error);
          }
        });
      });

      progressCallback(80, 'PSD generated, saving file...');

      // Convert the result to a buffer and save
      if (psdData && psdData.data) {
        const buffer = Buffer.from(psdData.data);
        fs.writeFileSync(outputPath, buffer);
        progressCallback(100, 'PSD file saved successfully');
        return outputPath;
      } else {
        throw new Error('No PSD data received from Photopea');
      }

    } catch (error) {
      console.error('Photopea conversion error:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

export default PhotopeaService; 