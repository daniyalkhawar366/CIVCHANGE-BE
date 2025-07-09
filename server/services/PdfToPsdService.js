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
      const pdfBuffer = fs.readFileSync(pdfPath);

      const convert = fromBuffer(pdfBuffer, {
        density: 300,
        saveFilename: "page",
        savePath: this.tempDir,
        format: "png",
        width: 2000,
        height: 2000,
        quality: 100
      });

      progressCallback(15, 'Converting PDF pages to images...');
      const pages = await convert.bulk(-1, { responseType: "buffer" });
      if (!pages || pages.length === 0) {
        throw new Error('No pages found in PDF');
      }

      const firstPageBuffer = pages[0].buffer;
      const metadata = await sharp(firstPageBuffer).metadata();
      const { width, height } = metadata;

      progressCallback(30, 'Extracting text data...');
      const allTextData = await extractTextFromPDF(pdfPath);

      const psdLayers = [];

      for (let i = 0; i < pages.length; i++) {
        const pageBuffer = pages[i].buffer;
        progressCallback(40 + (i * 20) / pages.length, `Processing page ${i + 1}/${pages.length}...`);

        const imageData = await sharp(pageBuffer)
          .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .ensureAlpha()
          .raw()
          .toBuffer();

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(Uint8ClampedArray.from(imageData), width, height);
        ctx.putImageData(imgData, 0, 0);

        psdLayers.push({
          name: `Page ${i + 1} (Image)`,
          canvas: canvas,
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });

        // Text layers
        const pageTextData = allTextData.filter(t => t.page === i + 1 && t.text?.trim() && t.fontSizeNorm > 0);
        for (const textObj of pageTextData) {
          psdLayers.push({
            name: `Text: ${textObj.text.substring(0, 20)}`,
            text: {
              text: textObj.text,
              font: {
                name: 'Arial',
                sizes: [textObj.fontSizeNorm * height],
                colors: [[0, 0, 0]],
                styles: [0],
                lineHeight: textObj.fontSizeNorm * height * 1.2,
                letterSpacing: 0
              },
              left: textObj.xNorm * width,
              top: (1 - textObj.yNorm) * height
            },
            opacity: 255,
            visible: true,
            blendMode: 'normal'
          });
        }
      }

      progressCallback(85, 'Writing PSD file...');
      const psdDocument = {
        width: width,
        height: height,
        children: psdLayers.reverse()
      };

      const psdBuffer = writePsdBuffer(psdDocument);
      fs.writeFileSync(outputPath, psdBuffer);

      progressCallback(95, 'Cleaning up temporary files...');
      this.cleanupTempFiles();

      progressCallback(100, 'Conversion completed!');
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
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('Temp file cleanup error:', error);
    }
  }
}

export default PdfToPsdService;
