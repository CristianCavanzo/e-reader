export function SkeletonCard() {
  return (
    <div className="book-card skeleton-card" aria-hidden="true">
      <div className="book-cover skeleton-cover" />
      <div className="book-info">
        <div className="skeleton-line w-85" />
        <div className="skeleton-line w-60" />
        <div className="skeleton-line w-90" />
      </div>
    </div>
  );
}

export function SkeletonReader() {
  return (
    <div className="skeleton-reader" aria-hidden="true">
      <div className="skeleton-line w-60" />
      <div className="skeleton-line w-95" />
      <div className="skeleton-line w-90" />
      <div className="skeleton-line w-80" />
      <div className="skeleton-line w-92" />
      <div className="skeleton-line w-70" />
    </div>
  );
}
