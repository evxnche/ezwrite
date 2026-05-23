import { createWorker } from 'tesseract.js';

export async function recognizeImage(dataUrl: string): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const ret = await worker.recognize(dataUrl);
    return (ret.data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}
