import { convert } from 'pdf-poppler';
import puppeteer from 'puppeteer';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
import path from 'path';

class HybridPdfService {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    try {
      console.log('Initializing Hybrid PDF service...');
      
      // Launch Puppeteer browser
      this.browser = await puppeteer.launch({
        headless: 'new',
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
      
      console.log('Puppeteer browser launched successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Hybrid PDF service:', error.message);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(10, 'Analyzing PDF structure...');

      // Step 1: Analyze PDF structure using Poppler
      const pdfInfo = await this.analyzePDFStructure(pdfPath);
      console.log('PDF analysis completed:', pdfInfo);

      progressCallback(30, 'Rendering PDF with high quality...');

      // Step 2: Use Puppeteer for high-quality rendering
      const renderedImage = await this.renderPDFWithPuppeteer(pdfPath, progressCallback);

      progressCallback(60, 'Processing rendered image...');

      // Step 3: Process the rendered image
      const processedImage = await this.processRenderedImage(renderedImage);

      progressCallback(80, 'Creating layered PSD...');

      // Step 4: Create layered PSD based on analysis
      await this.createLayeredPSD(processedImage, pdfInfo, outputPath);

      progressCallback(100, 'PSD conversion completed successfully');
      return outputPath;

    } catch (error) {
      console.error('Hybrid PDF conversion error:', error);
      throw new Error(`Hybrid PDF conversion failed: ${error.message}`);
    }
  }

  async analyzePDFStructure(pdfPath) {
    try {
      // Use Poppler to extract PDF information
      const options = {
        format: 'png',
        out_dir: './temp',
        out_prefix: 'analysis',
        page: null
      };

      const result = await convert(pdfPath, options);
      
      // Get PDF metadata
      const pdfBuffer = fs.readFileSync(pdfPath);
      const fileSize = pdfBuffer.length;
      
      return {
        pages: result.length,
        fileSize,
        hasImages: true, // Assume PDFs from Canva have images
        hasText: true,   // Assume PDFs from Canva have text
        dimensions: await this.getPDFDimensions(pdfPath)
      };
    } catch (error) {
      console.error('PDF analysis error:', error);
      // Fallback to basic info
      return {
        pages: 1,
        fileSize: fs.statSync(pdfPath).size,
        hasImages: true,
        hasText: true,
        dimensions: { width: 1920, height: 1080 }
      };
    }
  }

  async getPDFDimensions(pdfPath) {
    try {
      // Use Poppler to get PDF dimensions
      const options = {
        format: 'png',
        out_dir: './temp',
        out_prefix: 'dimensions',
        page: 1
      };

      const result = await convert(pdfPath, options);
      
      if (result && result.length > 0) {
        const imagePath = result[0];
        const metadata = await sharp(imagePath).metadata();
        
        // Clean up temporary file
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        
        return {
          width: metadata.width,
          height: metadata.height
        };
      }
    } catch (error) {
      console.error('Error getting PDF dimensions:', error);
    }
    
    // Fallback dimensions
    return { width: 1920, height: 1080 };
  }

  async renderPDFWithPuppeteer(pdfPath, progressCallback) {
    try {
      progressCallback(35, 'Launching browser for PDF rendering...');
      
      const page = await this.browser.newPage();
      
      // Set viewport for high-quality rendering
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 2 // High DPI for better quality
      });

      progressCallback(40, 'Loading PDF in browser...');
      
      // Load the PDF file
      await page.goto(`file://${path.resolve(pdfPath)}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      progressCallback(45, 'Rendering PDF page...');
      
      // Take screenshot of the first page
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        quality: 100,
        omitBackground: false
      });

      await page.close();
      
      progressCallback(50, 'PDF rendering completed');
      
      return screenshot;
    } catch (error) {
      console.error('Puppeteer rendering error:', error);
      throw error;
    }
  }

  async processRenderedImage(imageBuffer) {
    try {
      // Process the rendered image for optimal PSD conversion
      const processed = await sharp(imageBuffer)
        .png()
        .toBuffer();
      
      return processed;
    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }
  }

  async createLayeredPSD(imageBuffer, pdfInfo, outputPath) {
    try {
      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height } = metadata;

      // Convert to raw data for PSD
      const raw = await sharp(imageBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const data = raw.data;

      // Create layered PSD structure
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
          }
        ]
      };

      // Add additional layers based on PDF analysis
      if (pdfInfo.hasText) {
        // Add a text layer (placeholder for now)
        psd.children.push({
          name: 'Text Layer',
          canvas: { width, height, data: Buffer.alloc(data.length) },
          opacity: 255,
          visible: true,
          blendMode: 'normal',
        });
      }

      if (pdfInfo.hasImages) {
        // Add an images layer (placeholder for now)
        psd.children.push({
          name: 'Images',
          canvas: { width, height, data: Buffer.alloc(data.length) },
          opacity: 255,
          visible: true,
          blendMode: 'normal',
        });
      }

      const psdBuffer = writePsdBuffer(psd);
      fs.writeFileSync(outputPath, psdBuffer);
      
      console.log('Layered PSD created successfully');
    } catch (error) {
      console.error('PSD creation error:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('Puppeteer browser closed');
    }
  }
}

export default HybridPdfService; 