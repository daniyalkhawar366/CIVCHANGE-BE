import fs from 'fs';
import axios from 'axios';

class PhotopeaApiFallback {
  async convertWithApi(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const base64pdf = pdfBuffer.toString('base64');

      // Create the Photopea configuration object
      const photopeaConfig = {
        files: [`data:application/pdf;base64,${base64pdf}`],
        script: `
          // Wait for the document to load
          app.activeDocument = app.documents[0];
          
          // Save as PSD
          var psdData = app.activeDocument.saveToOE("psd");
          
          // Return the PSD data
          app.echoToOE(JSON.stringify({
            success: true,
            data: psdData.data
          }));
        `
      };

      progressCallback(80, 'Sending to Photopea API...');
      
      // Use the correct Photopea API endpoint
      const response = await axios.post('https://www.photopea.com/api/', photopeaConfig, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/octet-stream'
        },
        responseType: 'arraybuffer'
      });

      // Check if response is valid (not HTML)
      const responseText = response.data.toString('utf8', 0, 100);
      if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
        throw new Error('Photopea API returned HTML instead of file data');
      }

      fs.writeFileSync(outputPath, response.data);
      progressCallback(100, 'Saved via API fallback');
    } catch (err) {
      console.error('[Fallback API Error]:', err.message);
      throw new Error('Photopea API fallback failed: ' + err.message);
    }
  }
}

export default PhotopeaApiFallback;
