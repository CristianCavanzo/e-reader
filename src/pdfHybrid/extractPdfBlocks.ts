import { pdfjsLib } from '../lib/pdfWorker';
import { cropPdfRegion } from './cropPdfRegion';
import {
  analyzePdfLayout,
  getHeadingLevel,
  isCodeLine,
  isQuoteLine,
} from './detectPdfLayout';
import type { PdfReaderBlock, PdfSourceRect, PdfTextLine, ReaderBlockType } from './pdfCoordinates';
import { lineToRect, normalizeText, padRect, unionRects } from './pdfCoordinates';

interface ExtractArgs {
  bookId: string;
  pdfPage: any;
  pageNumber: number;
}

function buildTextBlock(args: {
  bookId: string;
  pageNumber: number;
  order: number;
  type: ReaderBlockType;
  lines: PdfTextLine[];
  headingLevel?: 1 | 2 | 3;
}): PdfReaderBlock {
  const text = args.type === 'code'
    ? args.lines.map((line) => line.text).join('\n')
    : normalizeText(args.lines.map((line) => line.text).join(' '));

  return {
    id: `${args.bookId}-${args.pageNumber}-${args.order}-${args.type}`,
    bookId: args.bookId,
    page: args.pageNumber,
    type: args.type,
    text,
    sourceRect: unionRects(args.lines.map(lineToRect)),
    headingLevel: args.headingLevel,
    order: args.order,
  };
}

function createLineGroups(lines: PdfTextLine[], averageFontHeight: number, ignoredLineIndexes: Set<number>) {
  const groups: Array<{ type: ReaderBlockType; lines: PdfTextLine[]; headingLevel?: 1 | 2 | 3 }> = [];
  let current: { type: ReaderBlockType; lines: PdfTextLine[]; headingLevel?: 1 | 2 | 3 } | null = null;
  let previousLine: PdfTextLine | null = null;

  const flush = () => {
    if (current && current.lines.length > 0) groups.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    if (ignoredLineIndexes.has(index)) {
      flush();
      previousLine = null;
      return;
    }

    const text = normalizeText(line.text);
    if (!text) return;

    const headingLevel = getHeadingLevel(line, averageFontHeight);
    const type: ReaderBlockType = headingLevel
      ? 'heading'
      : isCodeLine(line)
        ? 'code'
        : isQuoteLine(line)
          ? 'quote'
          : 'paragraph';

    const verticalGap = previousLine ? line.y - previousLine.y : 0;
    const indentJump = previousLine ? Math.abs(line.x - previousLine.x) : 0;
    const shouldStartNew =
      !current ||
      current.type !== type ||
      type === 'heading' ||
      verticalGap > Math.max(averageFontHeight * 1.85, 18) ||
      indentJump > 44;

    if (shouldStartNew) {
      flush();
      current = { type, lines: [line], headingLevel: headingLevel || undefined };
    } else {
      current!.lines.push(line);
    }

    previousLine = line;
  });

  flush();
  return groups;
}

export async function extractPdfBlocks({ bookId, pdfPage, pageNumber }: ExtractArgs): Promise<PdfReaderBlock[]> {
  const viewport = pdfPage.getViewport({ scale: 1 });
  const [textContent, operatorList] = await Promise.all([
    pdfPage.getTextContent(),
    pdfPage.getOperatorList().catch(() => null),
  ]);

  const analysis = analyzePdfLayout({ textContent, operatorList, viewport, pdfjsLib });
  const blocks: PdfReaderBlock[] = [];
  let order = 0;

  if (analysis.lines.length === 0) {
    const rect: PdfSourceRect = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const imageUrl = await cropPdfRegion(pdfPage, rect, { scale: 2.4 });
    return [{
      id: `${bookId}-${pageNumber}-0-unknown-snapshot`,
      bookId,
      page: pageNumber,
      type: 'unknown-snapshot',
      imageUrl,
      sourceRect: rect,
      order: 0,
    }];
  }

  if (analysis.isMostlyVisual) {
    const rect: PdfSourceRect = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const imageUrl = await cropPdfRegion(pdfPage, rect, { scale: 2.4 });
    return [{
      id: `${bookId}-${pageNumber}-0-figure-snapshot`,
      bookId,
      page: pageNumber,
      type: 'figure-snapshot',
      imageUrl,
      sourceRect: rect,
      order: 0,
    }];
  }

  const ignoredLineIndexes = new Set<number>();
  for (const tableGroup of analysis.tableGroups) {
    tableGroup.lineIndexes.forEach((index) => ignoredLineIndexes.add(index));
  }

  const textGroups = createLineGroups(analysis.lines, analysis.averageFontHeight, ignoredLineIndexes);

  for (const group of textGroups) {
    const text = group.lines.map((line) => line.text).join(' ').trim();
    if (!text) continue;
    blocks.push(buildTextBlock({
      bookId,
      pageNumber,
      order: order++,
      type: group.type,
      lines: group.lines,
      headingLevel: group.headingLevel,
    }));
  }

  for (const tableGroup of analysis.tableGroups) {
    const imageUrl = await cropPdfRegion(pdfPage, tableGroup.rect, { scale: 2.6 });
    blocks.push({
      id: `${bookId}-${pageNumber}-${order}-table-snapshot`,
      bookId,
      page: pageNumber,
      type: 'table-snapshot',
      imageUrl,
      sourceRect: tableGroup.rect,
      order: order++,
    });
  }

  if (analysis.hasImageLikeContent && analysis.lines.length < 80 && analysis.tableGroups.length === 0) {
    const rect = padRect(
      unionRects(analysis.lines.map(lineToRect)),
      18,
      analysis.pageWidth,
      analysis.pageHeight
    );
    const imageUrl = await cropPdfRegion(pdfPage, rect, { scale: 2.4 });
    blocks.push({
      id: `${bookId}-${pageNumber}-${order}-figure-snapshot`,
      bookId,
      page: pageNumber,
      type: 'figure-snapshot',
      imageUrl,
      sourceRect: rect,
      order: order++,
    });
  }

  if (blocks.length === 0) {
    const rect = padRect(unionRects(analysis.lines.map(lineToRect)), 14, analysis.pageWidth, analysis.pageHeight);
    const imageUrl = await cropPdfRegion(pdfPage, rect, { scale: 2.4 });
    blocks.push({
      id: `${bookId}-${pageNumber}-0-unknown-snapshot`,
      bookId,
      page: pageNumber,
      type: 'unknown-snapshot',
      imageUrl,
      sourceRect: rect,
      order: 0,
    });
  }

  return blocks
    .sort((a, b) => a.order - b.order)
    .map((block, index) => ({ ...block, order: index }));
}
