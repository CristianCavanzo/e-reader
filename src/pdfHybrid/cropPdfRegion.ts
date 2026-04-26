import type { PdfSourceRect } from './pdfCoordinates';

export async function cropPdfRegion(pdfPage: any, sourceRect: PdfSourceRect, options?: { scale?: number; mimeType?: string; quality?: number }): Promise<string> {
  const scale = options?.scale || Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
  const mimeType = options?.mimeType || 'image/png';
  const quality = options?.quality ?? 0.92;
  const viewport = pdfPage.getViewport({ scale });

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.ceil(viewport.width);
  fullCanvas.height = Math.ceil(viewport.height);
  const fullContext = fullCanvas.getContext('2d');
  if (!fullContext) throw new Error('No se pudo crear canvas para snapshot PDF');

  await pdfPage.render({
    canvasContext: fullContext,
    viewport,
    canvas: fullCanvas,
  } as any).promise;

  const sx = Math.max(0, Math.floor(sourceRect.x * scale));
  const sy = Math.max(0, Math.floor(sourceRect.y * scale));
  const sw = Math.min(fullCanvas.width - sx, Math.ceil(sourceRect.width * scale));
  const sh = Math.min(fullCanvas.height - sy, Math.ceil(sourceRect.height * scale));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, sw);
  cropCanvas.height = Math.max(1, sh);
  const cropContext = cropCanvas.getContext('2d');
  if (!cropContext) throw new Error('No se pudo crear canvas para recorte PDF');

  cropContext.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob>((resolve, reject) => {
    cropCanvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('No se pudo generar imagen del snapshot'));
    }, mimeType, quality);
  });

  return URL.createObjectURL(blob);
}
