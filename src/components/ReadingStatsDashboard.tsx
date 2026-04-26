import { useEffect, useMemo, useState } from 'react';
import { db, type ReadingStat } from '../db';

function lastNDates(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

export function ReadingStatsDashboard({ bookId }: { bookId?: string }) {
  const [stats, setStats] = useState<ReadingStat[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = bookId
        ? await db.readingStats.where('bookId').equals(bookId).toArray()
        : await db.readingStats.toArray();
      if (!cancelled) setStats(rows);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const data = useMemo(() => {
    const dates = lastNDates(7);
    return dates.map((date) => ({
      date,
      minutes: stats.filter((stat) => stat.date === date).reduce((sum, stat) => sum + stat.minutesRead, 0),
      pages: stats.filter((stat) => stat.date === date).reduce((sum, stat) => sum + stat.pagesRead, 0),
    }));
  }, [stats]);

  const totalMinutes = data.reduce((sum, day) => sum + day.minutes, 0);
  const totalPages = data.reduce((sum, day) => sum + day.pages, 0);
  const streak = [...data].reverse().reduce((count, day) => (count === 0 && day.minutes === 0 ? 0 : day.minutes > 0 ? count + 1 : count), 0);
  const maxMinutes = Math.max(1, ...data.map((day) => day.minutes));

  return (
    <section className="reading-stats-card" aria-label="Estadísticas de lectura">
      <div className="stats-kpis">
        <div><strong>{totalMinutes}</strong><span>min / 7 días</span></div>
        <div><strong>{totalPages}</strong><span>páginas</span></div>
        <div><strong>{streak}</strong><span>racha</span></div>
      </div>
      <div className="stats-bars">
        {data.map((day) => (
          <div key={day.date} className="stats-bar" title={`${day.date}: ${day.minutes} min`}>
            <span style={{ height: `${Math.max(8, (day.minutes / maxMinutes) * 100)}%` }} />
            <small>{day.date.slice(5).replace('-', '/')}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
