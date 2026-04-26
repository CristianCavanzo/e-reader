import type { BookStatus } from '../db';

const labels: Record<BookStatus, string> = {
  unread: 'Pendiente',
  reading: 'Leyendo',
  paused: 'Pausado',
  finished: 'Terminado',
};

export function BookStatusBadge({ status = 'unread' }: { status?: BookStatus }) {
  return <span className={`book-status-badge status-${status}`}>{labels[status]}</span>;
}
