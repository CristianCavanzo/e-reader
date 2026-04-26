export type ReaderBlockType =
  | 'heading'
  | 'paragraph'
  | 'code'
  | 'quote'
  | 'image'
  | 'table-snapshot'
  | 'figure-snapshot'
  | 'unknown-snapshot';

export interface PdfSourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfReaderBlock {
  id: string;
  bookId: string;
  page: number;
  type: ReaderBlockType;
  text?: string;
  imageUrl?: string;
  sourceRect?: PdfSourceRect;
  headingLevel?: 1 | 2 | 3;
  order: number;
}

export interface PdfTextItemBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

export interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  items: PdfTextItemBox[];
}

export function padRect(rect: PdfSourceRect, padding: number, pageWidth: number, pageHeight: number): PdfSourceRect {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const maxX = Math.min(pageWidth, rect.x + rect.width + padding);
  const maxY = Math.min(pageHeight, rect.y + rect.height + padding);

  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y),
  };
}

export function unionRects(rects: PdfSourceRect[]): PdfSourceRect {
  if (rects.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function lineToRect(line: PdfTextLine): PdfSourceRect {
  return {
    x: line.x,
    y: line.y,
    width: Math.max(1, line.width),
    height: Math.max(1, line.height),
  };
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function rectToCss(rect: PdfSourceRect, scale: number) {
  return {
    left: `${rect.x * scale}px`,
    top: `${rect.y * scale}px`,
    width: `${rect.width * scale}px`,
    height: `${rect.height * scale}px`,
  };
}
