import type { PdfSourceRect, PdfTextItemBox, PdfTextLine } from './pdfCoordinates';
import { lineToRect, normalizeText, padRect, unionRects } from './pdfCoordinates';

export interface LayoutAnalysis {
  lines: PdfTextLine[];
  tableGroups: Array<{ lineIndexes: number[]; rect: PdfSourceRect }>;
  hasImageLikeContent: boolean;
  isMostlyVisual: boolean;
  averageFontHeight: number;
  pageWidth: number;
  pageHeight: number;
}

export function textContentToItems(textContent: any, viewport: any, pdfjsLib: any): PdfTextItemBox[] {
  return (textContent?.items || [])
    .map((item: any) => {
      const text = String(item.str || '');
      if (!text.trim()) return null;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const height = Math.max(1, Math.abs(Number(item.height || item.transform?.[3] || tx[3] || 10)));
      const width = Math.max(1, Math.abs(Number(item.width || text.length * height * 0.45)));
      const y = tx[5] - height;

      return {
        text,
        x: Number(tx[4] || 0),
        y: Number(y || 0),
        width,
        height,
        fontName: item.fontName,
      } satisfies PdfTextItemBox;
    })
    .filter(Boolean) as PdfTextItemBox[];
}

function detectColumnSplit(items: PdfTextItemBox[], pageWidth: number): number | null {
  if (items.length < 24 || pageWidth <= 0) return null;

  const bucketSize = 8;
  const buckets = new Array(Math.ceil(pageWidth / bucketSize)).fill(0);

  for (const item of items) {
    const start = Math.max(0, Math.floor(item.x / bucketSize));
    const end = Math.min(buckets.length - 1, Math.floor((item.x + item.width) / bucketSize));
    for (let i = start; i <= end; i += 1) buckets[i] += 1;
  }

  const startBucket = Math.floor((pageWidth * 0.30) / bucketSize);
  const endBucket = Math.floor((pageWidth * 0.70) / bucketSize);
  const maxDensity = Math.max(...buckets);
  const threshold = maxDensity * 0.05;

  for (let i = startBucket; i <= endBucket - 2; i += 1) {
    if (buckets[i] <= threshold && buckets[i + 1] <= threshold && buckets[i + 2] <= threshold) {
      return (i + 1) * bucketSize;
    }
  }

  return null;
}

export function groupItemsIntoLines(items: PdfTextItemBox[], pageWidth?: number): PdfTextLine[] {
  const splitX = pageWidth ? detectColumnSplit(items, pageWidth) : null;

  let orderedItems: PdfTextItemBox[];
  if (splitX) {
    const leftItems = items
      .filter((item) => item.x + item.width / 2 < splitX)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const rightItems = items
      .filter((item) => item.x + item.width / 2 >= splitX)
      .sort((a, b) => a.y - b.y || a.x - b.x);

    orderedItems = [...leftItems, ...rightItems];
  } else {
    orderedItems = [...items].sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) return a.y - b.y;
      return a.x - b.x;
    });
  }

  const lines: PdfTextLine[] = [];

  for (const item of orderedItems) {
    const current = lines[lines.length - 1];
    const sameLine = current && Math.abs(current.y - item.y) <= Math.max(2.8, Math.min(current.height, item.height) * 0.45);

    if (sameLine) {
      current.items.push(item);
      const orderedLineItems = [...current.items].sort((a, b) => a.x - b.x);
      current.items = orderedLineItems;
      current.x = Math.min(...orderedLineItems.map((box) => box.x));
      const right = Math.max(...orderedLineItems.map((box) => box.x + box.width));
      current.width = Math.max(1, right - current.x);
      current.height = Math.max(...orderedLineItems.map((box) => box.height));
      current.y = Math.min(...orderedLineItems.map((box) => box.y));
      current.text = joinLineItems(orderedLineItems);
    } else {
      lines.push({
        text: normalizeText(item.text),
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        items: [item],
      });
    }
  }

  return lines.filter((line) => line.text.length > 0);
}

function joinLineItems(items: PdfTextItemBox[]) {
  let result = '';
  let previous: PdfTextItemBox | null = null;

  for (const item of items) {
    if (!previous) {
      result = item.text;
      previous = item;
      continue;
    }

    const gap = item.x - (previous.x + previous.width);
    const needsSpace = gap > Math.max(1.6, previous.height * 0.18) && !/[\s\-/]$/.test(result) && !/^[,.;:!?)]/.test(item.text);
    result += `${needsSpace ? ' ' : ''}${item.text}`;
    previous = item;
  }

  return normalizeText(result);
}

export function getHeadingLevel(line: PdfTextLine, averageFontHeight: number): 1 | 2 | 3 | null {
  const text = normalizeText(line.text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const isChapterPattern = /^(chapter|appendix|part|preface|\d+(\.\d+)*\s+\S+)/i.test(text);

  if (text.length > 130 || wordCount > 20) return null;

  if (isChapterPattern || line.height >= averageFontHeight * 1.65) return 1;
  if (line.height >= averageFontHeight * 1.28 && wordCount <= 14) return 2;
  if (line.height >= averageFontHeight * 1.13 && wordCount <= 20) return 3;

  return null;
}

export function isHeadingLine(line: PdfTextLine, averageFontHeight: number): boolean {
  return getHeadingLevel(line, averageFontHeight) !== null;
}

export function isCodeLine(line: PdfTextLine): boolean {
  const text = line.text;

  const hasMono = line.items.some((item) =>
    /mono|courier|code|consolas|source.?code|inconsolata|fira.?code|jetbrains|cascadia/i.test(item.fontName || '')
  );
  if (hasMono) return true;

  if (/^(>>>|\.\.\.|In \[\d+\]:|Out\[\d+\]:|\$\s)/.test(text)) return true;

  if (/^\s{4,}/.test(text) && /[{}()[\]=<>_+*/\\:;|]/.test(text)) return true;

  const symbolCount = (text.match(/[{}()[\]=<>_+*/\\:;|]/g) || []).length;
  const symbolDensity = symbolCount / Math.max(text.length, 1);
  const looksLikeCode = /\w+\s*[=(]\s*\w|\w+\.\w+\(|\bdef\b|\bclass\b|\bimport\b|\breturn\b/.test(text);
  if (symbolDensity > 0.22 && looksLikeCode && text.length < 160) return true;

  return false;
}

export function isQuoteLine(line: PdfTextLine): boolean {
  const text = line.text.trim();
  const startsWithQuoteChar = /^["“”'‘’>—]/.test(text);
  const endsWithQuoteChar = /["“”'‘’]$/.test(text) && text.length > 40;

  if (text.length < 25) return false;

  return startsWithQuoteChar || endsWithQuoteChar;
}

function getColumnSignature(line: PdfTextLine): number[] {
  return line.items
    .filter((item) => item.text.trim().length > 0)
    .map((item) => Math.round(item.x / 12) * 12);
}

function isTableLikeLine(line: PdfTextLine): boolean {
  const signature = getColumnSignature(line);
  if (signature.length < 3) return false;

  const text = line.text;
  const numericTokens = (text.match(/\b\d+([.,:]\d+)?%?\b/g) || []).length;
  const shortTokens = line.items.filter((item) => item.text.trim().length <= 18).length;
  const repeatedColumns = new Set(signature).size >= 3;
  return repeatedColumns && (numericTokens >= 1 || shortTokens >= 3);
}

function detectTableGroups(lines: PdfTextLine[], pageWidth: number, pageHeight: number): Array<{ lineIndexes: number[]; rect: PdfSourceRect }> {
  const groups: number[][] = [];
  let current: number[] = [];

  lines.forEach((line, index) => {
    const tableLike = isTableLikeLine(line);
    if (tableLike) {
      current.push(index);
      return;
    }

    if (current.length >= 2) groups.push(current);
    current = [];
  });

  if (current.length >= 2) groups.push(current);

  return groups.map((indexes) => {
    const rects = indexes.map((index) => lineToRect(lines[index]));
    return {
      lineIndexes: indexes,
      rect: padRect(unionRects(rects), 12, pageWidth, pageHeight),
    };
  });
}

export function operatorListHasImages(operatorList: any, pdfjsLib: any): boolean {
  const ops = pdfjsLib.OPS || {};
  const imageOps = new Set([
    ops.paintImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintInlineImageXObject,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectRepeat,
    ops.paintJpegXObject,
  ].filter((value) => value !== undefined));

  return (operatorList?.fnArray || []).some((fn: number) => imageOps.has(fn));
}

export function analyzePdfLayout(args: {
  textContent: any;
  operatorList: any;
  viewport: any;
  pdfjsLib: any;
}): LayoutAnalysis {
  const items = textContentToItems(args.textContent, args.viewport, args.pdfjsLib);
  const lines = groupItemsIntoLines(items, args.viewport.width);
  const averageFontHeight = lines.length > 0
    ? lines.reduce((sum, line) => sum + line.height, 0) / lines.length
    : 10;
  const hasImageLikeContent = operatorListHasImages(args.operatorList, args.pdfjsLib);
  const tableGroups = detectTableGroups(lines, args.viewport.width, args.viewport.height);
  const isMostlyVisual = hasImageLikeContent && lines.length < 12;

  return {
    lines,
    tableGroups,
    hasImageLikeContent,
    isMostlyVisual,
    averageFontHeight,
    pageWidth: args.viewport.width,
    pageHeight: args.viewport.height,
  };
}
