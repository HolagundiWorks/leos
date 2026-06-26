import * as pdfjs from 'pdfjs-dist';

// Vite resolves this worker URL at build/dev time.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface RenderedPdf {
  dataUrl: string;
  width: number;
  height: number;
}

// Render page 1 of a PDF file to a PNG data URL (used as the canvas backdrop).
export async function pdfToImage(file: File, scale = 1.5): Promise<RenderedPdf> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
