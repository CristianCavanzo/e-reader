import type { TocItem } from './db';

interface RawEpubNavItem {
  id?: string;
  label?: string;
  href?: string;
  subitems?: RawEpubNavItem[];
}

function normalizeHref(href?: string): string | undefined {
  if (!href) return undefined;
  return href.split('#')[0] || href;
}

function safeId(bookId: string, order: number, href?: string): string {
  const source = `${bookId}-epub-${order}-${href || 'item'}`;
  return source.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function flattenEpubNavigation(bookId: string, navigation: any): TocItem[] {
  const toc = (navigation?.toc || []) as RawEpubNavItem[];
  const items: TocItem[] = [];
  let order = 0;

  const walk = (nodes: RawEpubNavItem[], level: number, parentId?: string) => {
    nodes.forEach((node) => {
      const label = (node.label || 'Sin título').trim();
      const href = node.href;
      const id = safeId(bookId, order, href);

      items.push({
        id,
        bookId,
        format: 'epub',
        label,
        href,
        order,
        level,
        parentId,
      });
      order += 1;

      if (node.subitems?.length) {
        walk(node.subitems, level + 1, id);
      }
    });
  };

  walk(toc, 0);
  return items;
}

export function findCurrentEpubTocItem(items: TocItem[], href?: string): TocItem | undefined {
  if (!href || items.length === 0) return undefined;
  const normalized = normalizeHref(href);
  return (
    items.find((item) => item.href === href) ||
    items.find((item) => normalizeHref(item.href) === normalized) ||
    items.find((item) => href.includes(normalizeHref(item.href) || '__never__'))
  );
}
