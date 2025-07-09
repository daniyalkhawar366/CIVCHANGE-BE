import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import { writePsdBuffer } from 'ag-psd';
import { createCanvas } from 'canvas';
// import { convert } from 'pdf-poppler';
// import path from 'path';
// import os from 'os';

class ApiPhotopeaService {
  constructor() {
    this.baseUrl = 'https://www.photopea.com';
    // pdfjsLib.GlobalWorkerOptions.workerSrc = false; // Remove this line
  }

  async initialize() {
    try {
      console.log('Initializing API Photopea service...');
      // Test if Photopea is accessible
      const response = await axios.get(this.baseUrl, { timeout: 10000 });
      console.log('Photopea is accessible');
      return true;
    } catch (error) {
      console.error('Failed to access Photopea:', error.message);
      throw error;
    }
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback) {
    // This method is not used in the hybrid approach, but keep a placeholder for compatibility
    throw new Error('convertPDFToPSD is not implemented in ApiPhotopeaService for the hybrid approach.');
  }

  async close() {
    // No cleanup needed for API service
  }
}

export default ApiPhotopeaService; 