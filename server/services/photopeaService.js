import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

class PhotopeaService {
  constructor() {
    this.apiUrl = 'https://www.photopea.com/api/';
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async convertPDFToPSD(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      progressCallback(5, 'Initializing Photopea API...');
      
      // Validate input file
      if (!fs.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
      }

      const fileStats = fs.statSync(pdfPath);
      const fileSizeKB = Math.round(fileStats.size / 1024);
      console.log(`Processing PDF: ${fileSizeKB}KB`);

      progressCallback(10, 'Uploading PDF to Photopea...');
      
      // Create form data for upload
      const formData = new FormData();
      formData.append('file', fs.createReadStream(pdfPath));
      formData.append('format', 'psd');
      formData.append('quality', '100');
      
      // Upload and convert using Photopea API
      const response = await this.makeApiRequest(formData, progressCallback);
      
      progressCallback(80, 'Processing conversion response...');
      
      // Handle response
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Photopea API error: ${response.status} - ${errorText}`);
      }

      progressCallback(90, 'Saving PSD file...');
      
      // Save the PSD file
      const buffer = await response.buffer();
      if (buffer.length === 0) {
        throw new Error('Received empty PSD file from Photopea');
      }

      fs.writeFileSync(outputPath, buffer);
      
      progressCallback(100, 'Conversion completed successfully');
      
      return {
        success: true,
        outputPath,
        fileSize: buffer.length,
        fileSizeKB: Math.round(buffer.length / 1024),
        message: 'PDF converted to PSD successfully'
      };

    } catch (error) {
      console.error('PhotopeaService conversion error:', error);
      throw new Error(`Conversion failed: ${error.message}`);
    }
  }

  async makeApiRequest(formData, progressCallback) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        progressCallback(10 + (attempt * 20), `Attempt ${attempt}/${this.maxRetries} - Calling Photopea API...`);
        
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          body: formData,
          headers: {
            ...formData.getHeaders(),
            'User-Agent': 'PDF-to-PSD-Converter/1.0'
          },
          timeout: 120000 // 2 minutes timeout
        });

        if (response.ok) {
          return response;
        }

        lastError = new Error(`API request failed: ${response.status}`);
        
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          progressCallback(10 + (attempt * 20), `Retrying in ${this.retryDelay/1000} seconds...`);
          await this.sleep(this.retryDelay);
        }
      }
    }
    
    throw lastError;
  }

  async convertWithScript(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      progressCallback(5, 'Initializing Photopea script conversion...');
      
      // Alternative method using Photopea's scripting API
      const script = `
        app.open("${pdfPath}");
        app.activeDocument.saveAs("${outputPath}", SaveOptions.PHOTOSHOP);
        app.activeDocument.close();
      `;

      const formData = new FormData();
      formData.append('script', script);
      formData.append('file', fs.createReadStream(pdfPath));

      progressCallback(30, 'Executing Photopea script...');
      
      const response = await fetch('https://www.photopea.com/api/script', {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders()
        }
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Photopea script API error response:', text);
        throw new Error(`Script execution failed: ${response.status} - ${text}`);
      }

      progressCallback(70, 'Processing script result...');
      
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (err) {
        console.error('Photopea script API non-JSON response:', text);
        throw new Error('Photopea script API returned non-JSON response');
      }
      if (result.error) {
        throw new Error(`Photopea script error: ${result.error}`);
      }

      progressCallback(90, 'Downloading converted file...');

      // Download the converted file
      const fileResponse = await fetch(result.fileUrl);
      const buffer = await fileResponse.buffer();

      fs.writeFileSync(outputPath, buffer);

      progressCallback(100, 'Script conversion completed');

      return {
        success: true,
        outputPath,
        fileSize: buffer.length,
        message: 'PDF converted to PSD using script method'
      };

    } catch (error) {
      console.error('Script conversion error:', error);
      throw error;
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check method
  async checkApiHealth() {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'GET',
        timeout: 10000
      });
      return response.ok;
    } catch (error) {
      console.error('Photopea API health check failed:', error);
      return false;
    }
  }

  // Get API status and limits
  async getApiStatus() {
    try {
      const response = await fetch(`${this.apiUrl}status`, {
        method: 'GET',
        timeout: 10000
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      return { available: false, error: 'API not available' };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

export default PhotopeaService;