import fs from 'fs';
import axios from 'axios';

class PhotopeaApiFallback {
  async convertWithApi(pdfPath, outputPath, progressCallback = () => {}) {
    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const base64pdf = pdfBuffer.toString('base64');

      const script = `
        app.open("input.pdf");
        app.activeDocument.saveAs("output.psd");
        app.activeDocument.close();
      `;

      const payload = {
        files: { 'input.pdf': base64pdf },
        script: script
      };

      progressCallback(80, 'Sending to Photopea API...');
      const response = await axios.post('https://www.photopea.com/api/', payload, {
        responseType: 'arraybuffer'
      });

      fs.writeFileSync(outputPath, response.data);
      progressCallback(100, 'Saved via API fallback');
    } catch (err) {
      console.error('[Fallback API Error]:', err.message);
      throw new Error('Photopea API fallback failed');
    }
  }
}

export default PhotopeaApiFallback;
