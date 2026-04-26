import { pdfjsLib } from './lib/pdfWorker';
import type { TocItem } from './db';

type PdfOutlineNode = {
  title?: string;
  dest?: string | any[] | null;
  items?: PdfOutlineNode[];
};

function safeId(bookId: string, order: number): string {
  return `${bookId}-pdf-${order}`;
}

async function resolvePageNumber(
  pdf: pdfjsLib.PDFDocumentProxy,
  dest?: string | any[] | null
): Promise<number | undefined> {
  try {
    if (!dest) return undefined;
    const resolvedDest = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    const ref = resolvedDest?.[0];
    if (!ref) return undefined;
    const pageIndex = await pdf.getPageIndex(ref);
    return pageIndex + 1;
  } catch {
    return undefined;
  }
}

export async function flattenPdfOutline(
  bookId: string,
  pdf: pdfjsLib.PDFDocumentProxy
): Promise<TocItem[]> {
  const outline = ((await pdf.getOutline()) || []) as PdfOutlineNode[];
  const items: TocItem[] = [];
  let order = 0;

  const walk = async (nodes: PdfOutlineNode[], level: number, parentId?: string) => {
    for (const node of nodes) {
      const id = safeId(bookId, order);
      const page = await resolvePageNumber(pdf, node.dest);
      items.push({
        id,
        bookId,
        format: 'pdf',
        label: (node.title || `Sección ${order + 1}`).trim(),
        page,
        order,
        level,
        parentId,
      });
      order += 1;

      if (node.items?.length) {
        await walk(node.items, level + 1, id);
      }
    }
  };

  await walk(outline, 0);

  if (items.length > 0) return items;

  return Array.from({ length: pdf.numPages }, (_, index) => ({
    id: `${bookId}-pdf-page-${index + 1}`,
    bookId,
    format: 'pdf' as const,
    label: `Página ${index + 1}`,
    page: index + 1,
    order: index,
    level: 0,
  }));
}
