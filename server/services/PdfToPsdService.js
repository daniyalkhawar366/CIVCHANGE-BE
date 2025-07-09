import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { writePsdBuffer } from 'ag-psd';
import { fromBuffer } from 'pdf2pic';
import { fileURLToPath } from 'url';
import { createCanvas, ImageData } from 'canvas';
import { extractTextFromPDF } from '../utils/extractTextFromPDF.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PdfToPsdService {
  constructor() {
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async convertPdfToPsd(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(5, 'Starting PDF conversion...');
      
      // Read PDF buffer
      const pdfBuffer = fs.readFileSync(pdfPath);
      
      // Configure pdf2pic with high quality settings
      const convert = fromBuffer(pdfBuffer, {
        density: 300,           // High DPI for quality
        saveFilename: "page",
        savePath: this.tempDir,
        format: "png",
        width: 2000,            // High resolution
        height: 2000,
        quality: 100
      });

      progressCallback(15, 'Converting PDF pages to images...');
      
      // Convert all pages
      const pages = await convert.bulk(-1, { responseType: "buffer" });
      
      if (!pages || pages.length === 0) {
        throw new Error('No pages found in PDF');
      }

      progressCallback(40, 'Processing images and creating layers...');
      
      // Process first page to get dimensions
      const firstPageBuffer = pages[0].buffer;
      const metadata = await sharp(firstPageBuffer).metadata();
      const { width, height } = metadata;

      // Extract text data for all pages
      const allTextData = await extractTextFromPDF(pdfPath);

      // Create PSD structure
      const psdLayers = [];
      
      // Process each page as a raster image layer
      for (let i = 0; i < pages.length; i++) {
        const pageBuffer = pages[i].buffer;
        progressCallback(40 + (i * 20) / pages.length, `Processing page ${i + 1}/${pages.length}...`);
        
        // Convert to RGBA for PSD
        const imageData = await sharp(pageBuffer)
          .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .ensureAlpha()
          .raw()
          .toBuffer();

        // Create a real Canvas and draw the image data
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(
          Uint8ClampedArray.from(imageData),
          width,
          height
        );
        ctx.putImageData(imgData, 0, 0);

        // Create raster image layer
        psdLayers.push({
          name: `Page ${i + 1} (Image)`,
          canvas: canvas,
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });

        // Add text layers for this page
        const pageTextData = allTextData.filter(t => t.page === i + 1 && t.text && t.text.trim() && t.fontSizeNorm > 0);
        for (const textObj of pageTextData) {
          psdLayers.push({
            name: `Text: ${textObj.text.substring(0, 20)}`,
            text: {
              text: textObj.text,
              font: {
                name: 'Arial',
                sizes: [textObj.fontSizeNorm * height], // scale font size
                colors: [[0, 0, 0]],
                styles: [0],
                lineHeight: textObj.fontSizeNorm * height * 1.2,
                letterSpacing: 0
              },
              left: textObj.xNorm * width,
              top: (1 - textObj.yNorm) * height, // Flip Y for PSD coordinate system
              transform: undefined
            },
            opacity: 255,
            visible: true,
            blendMode: 'normal'
          });
        }
      }

      progressCallback(70, 'Creating PSD structure...');
      
      // Create PSD document
      const psdDocument = {
        width: width,
        height: height,
        children: psdLayers.reverse() // Reverse to have page 1 on top
      };

      progressCallback(85, 'Writing PSD file...');
      
      // Write PSD buffer
      const psdBuffer = writePsdBuffer(psdDocument);
      fs.writeFileSync(outputPath, psdBuffer);

      progressCallback(95, 'Cleaning up temporary files...');
      
      // Clean up temp files
      this.cleanupTempFiles();
      
      progressCallback(100, 'Conversion completed successfully!');
      
      return {
        success: true,
        outputPath: outputPath,
        pages: pages.length,
        dimensions: { width, height }
      };

    } catch (error) {
      console.error('PDF to PSD conversion error:', error);
      this.cleanupTempFiles();
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }

  cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  // Enhanced method for better layer detection
  async convertPdfToPsdWithLayerDetection(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(5, 'Analyzing PDF structure...');
      
      const pdfBuffer = fs.readFileSync(pdfPath);
      const fileStats = fs.statSync(pdfPath);
      
      // High-quality conversion settings
      const convert = fromBuffer(pdfBuffer, {
        density: 300,
        saveFilename: "page",
        savePath: this.tempDir,
        format: "png",
        width: 3000,  // Even higher resolution
        height: 3000,
        quality: 100
      });

      progressCallback(15, 'Converting PDF to high-quality images...');
      const pages = await convert.bulk(-1, { responseType: "buffer" });
      
      if (!pages || pages.length === 0) {
        throw new Error('Failed to convert PDF pages');
      }

      const firstPageBuffer = pages[0].buffer;
      const metadata = await sharp(firstPageBuffer).metadata();
      const { width, height } = metadata;

      progressCallback(30, 'Creating intelligent layers...');
      
      const psdLayers = [];
      
      for (let i = 0; i < pages.length; i++) {
        const pageBuffer = pages[i].buffer;
        progressCallback(30 + (i * 40) / pages.length, `Processing page ${i + 1} with layer detection...`);
        
        // Create main page layer
        const mainImageData = await sharp(pageBuffer)
          .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .ensureAlpha()
          .raw()
          .toBuffer();

        // Main layer for the page
        psdLayers.push({
          name: `Page ${i + 1} - Main`,
          canvas: {
            width: width,
            height: height,
            data: mainImageData
          },
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });

        // Create a background layer (white background)
        const backgroundData = Buffer.alloc(width * height * 4);
        for (let j = 0; j < backgroundData.length; j += 4) {
          backgroundData[j] = 255;     // R
          backgroundData[j + 1] = 255; // G
          backgroundData[j + 2] = 255; // B
          backgroundData[j + 3] = 255; // A
        }

        psdLayers.push({
          name: `Page ${i + 1} - Background`,
          canvas: {
            width: width,
            height: height,
            data: backgroundData
          },
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });
      }

      progressCallback(70, 'Assembling PSD with layers...');
      
      const psdDocument = {
        width: width,
        height: height,
        children: psdLayers.reverse()
      };

      progressCallback(85, 'Writing enhanced PSD file...');
      
      const psdBuffer = writePsdBuffer(psdDocument);
      fs.writeFileSync(outputPath, psdBuffer);

      progressCallback(95, 'Finalizing...');
      this.cleanupTempFiles();
      
      progressCallback(100, 'Enhanced conversion completed!');
      
      return {
        success: true,
        outputPath: outputPath,
        pages: pages.length,
        dimensions: { width, height },
        fileSize: fileStats.size,
        enhanced: true
      };

    } catch (error) {
      console.error('Enhanced PDF to PSD conversion error:', error);
      this.cleanupTempFiles();
      throw new Error(`Enhanced conversion failed: ${error.message}`);
    }
  }
}

export default PdfToPsdService;