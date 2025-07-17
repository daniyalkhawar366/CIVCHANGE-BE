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
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  async convertPdfToPsd(pdfPath, outputPath, progressCallback) {
    try {
      progressCallback(5, 'Reading PDF...');
      const pdfBuffer = fs.readFileSync(pdfPath);

      const convert = fromBuffer(pdfBuffer, {
        density: 300,
        format: "png",
        savePath: this.tempDir,
        width: 2000,
        height: 2000,
        quality: 100
      });

      progressCallback(15, 'Rendering PDF to image...');
      const pages = await convert.bulk(-1, { responseType: 'buffer' });
      if (!pages.length) throw new Error('No pages found in PDF');

      const baseImg = pages[0].buffer;
      const { width, height } = await sharp(baseImg).metadata();

      progressCallback(30, 'Extracting text from PDF...');
      const allText = await extractTextFromPDF(pdfPath);

      const psdLayers = [];

      // Background raster image
      const imageData = await sharp(baseImg).resize(width, height)
        .ensureAlpha().raw().toBuffer();
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(Uint8ClampedArray.from(imageData), width, height);
      ctx.putImageData(imgData, 0, 0);
      psdLayers.push({
        name: 'Background Image',
        canvas,
        opacity: 255,
        visible: true,
        blendMode: 'normal'
      });

      // Add cleaned text layers
      for (const textObj of allText.filter(t => t.page === 1 && t.text.length > 2)) {
        psdLayers.push({
          name: `Text: ${textObj.text.slice(0, 30)}`,
          text: {
            text: textObj.text,
            font: {
              name: 'Arial',
              sizes: [textObj.fontSizeNorm * height],
              colors: [[0, 0, 0]],
              styles: [0]
            },
            left: textObj.xNorm * width,
            top: (1 - textObj.yNorm) * height,
            lineHeight: textObj.fontSizeNorm * height * 1.2,
            letterSpacing: 0
          },
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });
      }

      progressCallback(85, 'Writing PSD...');
      const psdBuffer = writePsdBuffer({ width, height, children: psdLayers.reverse() });
      fs.writeFileSync(outputPath, psdBuffer);

      progressCallback(95, 'Cleaning up temp...');
      this.cleanupTempFiles();

      progressCallback(100, 'Done!');
      return {
        success: true,
        outputPath,
        fileSize: fs.statSync(outputPath).size,
        fileSizeKB: Math.round(fs.statSync(outputPath).size / 1024),
        pages: pages.length,
        dimensions: { width, height }
      };
    } catch (err) {
      console.error('PDF to PSD error:', err);
      this.cleanupTempFiles();
      throw err;
    }
  }

  cleanupTempFiles() {
    try {
      for (const file of fs.readdirSync(this.tempDir)) {
        const p = path.join(this.tempDir, file);
        if (fs.statSync(p).isFile()) fs.unlinkSync(p);
      }
    } catch (err) {
      console.warn('Cleanup error:', err.message);
    }
  }
}

export default PdfToPsdService;
