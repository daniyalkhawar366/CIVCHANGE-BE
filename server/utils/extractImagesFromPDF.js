import fs from 'fs';
import { PDFDocument } from 'pdf-lib';

export async function extractImagesFromPDF(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(buffer);
  const page = pdfDoc.getPage(0);
  const images = [];

  const xObjects = page.node?.Resources()?.XObject?.();
  if (!xObjects) return [];

  const keys = xObjects.keys();

  for (const key of keys) {
    try {
      const ref = xObjects.get(key);
      const xObject = pdfDoc.context.lookup(ref);
      const subtype = xObject.get('Subtype')?.name;

      if (subtype === 'Image') {
        const width = xObject.get('Width')?.value();
        const height = xObject.get('Height')?.value();
        const data = xObject.get('Data');
        const content = data?.content;

        if (!content || !Buffer.isBuffer(content)) continue;

        images.push({
          name: key,
          buffer: Buffer.from(content),
          width,
          height,
          mimeType: 'image/png',
        });
      }
    } catch (err) {
      console.warn(`Image ${key} skipped:`, err.message);
      continue;
    }
  }

  return images;
}
