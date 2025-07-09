import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import PhotopeaService from '../services/photopeaService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/convert/pdf-to-psd', upload.single('pdf'), async (req, res) => {
  const pdfPath = req.file.path;
  const outputPath = path.join('uploads', `${Date.now()}-converted.psd`);

  try {
    const service = new PhotopeaService();
    await service.convertPDFToPSD(pdfPath, outputPath, (p, msg) => {
      console.log(`[${p}%] ${msg}`);
    });

    res.download(outputPath, err => {
      fs.unlinkSync(pdfPath);
      fs.unlinkSync(outputPath);
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

export default router;
