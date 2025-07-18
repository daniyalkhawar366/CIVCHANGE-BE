import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { writePsdBuffer } from 'ag-psd';
import { fromBuffer } from 'pdf2pic';
import { fileURLToPath } from 'url';
import { createCanvas, ImageData, loadImage } from 'canvas';
import { extractImagesFromPDF } from '../utils/extractImagesFromPDF.js';

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

      const imageData = await sharp(baseImg)
        .resize(width, height)
        .ensureAlpha()
        .raw()
        .toBuffer();

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(Uint8ClampedArray.from(imageData), width, height);
      ctx.putImageData(imgData, 0, 0);

      const psdLayers = [
        {
          name: 'Background Image',
          canvas,
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        }
      ];

      progressCallback(40, 'Extracting image layers from PDF...');
      const extractedImages = await extractImagesFromPDF(pdfPath);

      for (let i = 0; i < extractedImages.length; i++) {
        const imgObj = extractedImages[i];
        const img = await loadImage(imgObj.buffer);

        const imgCanvas = createCanvas(imgObj.width, imgObj.height);
        const imgCtx = imgCanvas.getContext('2d');
        imgCtx.drawImage(img, 0, 0, imgObj.width, imgObj.height);

        psdLayers.push({
          name: `Image Layer ${i + 1}`,
          canvas: imgCanvas,
          left: 100 + i * 50,
          top: 100 + i * 50,
          opacity: 255,
          visible: true,
          blendMode: 'normal'
        });
      }

      progressCallback(85, 'Writing PSD...');
      const psdBuffer = writePsdBuffer({ width, height, children: psdLayers.reverse() });
      fs.writeFileSync(outputPath, psdBuffer);

      progressCallback(95, 'Cleaning up...');
      this.cleanupTempFiles();

      progressCallback(100, 'Done!');
      return {
        success: true,
        outputPath,
        fileSize: fs.statSync(outputPath).size,
        fileSizeKB: Math.round(fs.statSync(outputPath).size / 1024),
        pages: pages.length,
        imageLayers: extractedImages.length,
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
