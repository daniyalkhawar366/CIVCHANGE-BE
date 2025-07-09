import sharp from 'sharp';
import fs from 'fs';
import { createCanvas } from 'canvas';

class FallbackService {
  constructor() {
    // pdfjsLib.GlobalWorkerOptions.workerSrc = false; // Remove this line
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    // This method is not used in the hybrid approach, but keep a placeholder for compatibility
    throw new Error('convertPDFToPSD is not implemented in FallbackService for the hybrid approach.');
  }

  async createBasicPSD(imageBuffer, width, height) {
    // This method is not used in the hybrid approach
    throw new Error('createBasicPSD is not implemented in FallbackService for the hybrid approach.');
  }
}

export default FallbackService; 