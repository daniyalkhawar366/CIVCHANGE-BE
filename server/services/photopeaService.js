import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import PhotopeaApiFallback from './photopeaApiFallback.js';

class PhotopeaService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      const launchOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      };

      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.goto('https://www.photopea.com/', { waitUntil: 'networkidle2', timeout: 30000 });
      await this.page.waitForSelector('#app', { timeout: 30000 });
    } catch (error) {
      console.error('Puppeteer init failed, switching to fallback:', error.message);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      if (!this.page) await this.initialize();

      progressCallback(10, 'Uploading to Photopea (Puppeteer)...');
      const inputElement = await this.page.$('input[type="file"]');
      if (!inputElement) throw new Error('File input not found');

      await inputElement.uploadFile(pdfPath);
      progressCallback(30, 'PDF uploaded');

      await this.page.waitForTimeout(5000); // wait for PDF load
      progressCallback(60, 'Exporting to PSD...');

      const psdData = await this.page.evaluate(() => {
        return app.activeDocument.saveToOE("psd");
      });

      if (!psdData?.data) throw new Error('Empty PSD data');

      fs.writeFileSync(outputPath, Buffer.from(psdData.data));
      progressCallback(100, 'Saved successfully');
    } catch (error) {
      console.error('[Puppeteer Error]:', error.message);
      progressCallback(70, 'Falling back to API...');
      const fallback = new PhotopeaApiFallback();
      await fallback.convertWithApi(pdfPath, outputPath, progressCallback);
    } finally {
      await this.close();
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
