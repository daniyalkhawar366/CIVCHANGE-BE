import puppeteer from 'puppeteer';
import fs from 'fs';

class SimplePhotopeaService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      console.log('Initializing Simple Photopea service...');
      
      // Use minimal launch options for Railway
      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--disable-javascript',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      };

      // Try to use system Chromium if available
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log('Using system Chromium');
      } else {
        console.log('Using bundled Chromium');
      }

      this.browser = await puppeteer.launch(launchOptions);
      console.log('Browser launched successfully');
      
      this.page = await this.browser.newPage();
      
      // Disable images and other resources to speed up loading
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      console.log('Navigating to Photopea...');
      await this.page.goto('https://www.photopea.com/', { 
        waitUntil: 'domcontentloaded',
        timeout: 45000 
      });
      
      console.log('Photopea loaded successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to initialize Simple Photopea service:', error);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    try {
      if (!this.page) {
        await this.initialize();
      }

      progressCallback(10, 'Loading PDF into Photopea...');

      // Try to find file input
      const inputElement = await this.page.$('input[type="file"]');
      if (!inputElement) {
        throw new Error('File input not found on Photopea page');
      }

      await inputElement.uploadFile(pdfPath);
      progressCallback(20, 'PDF uploaded, processing...');

      // Wait for document to load
      await this.page.waitForFunction(() => {
        return window.app && window.app.activeDocument;
      }, { timeout: 30000 });

      progressCallback(40, 'PDF processed, preparing for export...');
      await this.page.waitForTimeout(2000);

      progressCallback(60, 'Exporting as PSD...');
      
      // Try to export using Photopea's API
      const psdData = await this.page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          try {
            const doc = window.app.activeDocument;
            if (!doc) {
              reject(new Error('No active document found'));
              return;
            }

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

      if (psdData && psdData.data) {
        const buffer = Buffer.from(psdData.data);
        fs.writeFileSync(outputPath, buffer);
        progressCallback(100, 'PSD file saved successfully');
        return outputPath;
      } else {
        throw new Error('No PSD data received from Photopea');
      }

    } catch (error) {
      console.error('Simple Photopea conversion error:', error);
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

export default SimplePhotopeaService; 