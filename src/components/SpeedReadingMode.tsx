import { useEffect, useMemo, useState } from 'react';

interface SpeedReadingModeProps {
  text: string;
  onClose: () => void;
}

export function SpeedReadingMode({ text, onClose }: SpeedReadingModeProps) {
  const words = useMemo(() => text.split(/\s+/).map((word) => word.trim()).filter(Boolean), [text]);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState(260);
  const [playing, setPlaying] = useState(false);
  const [chunkSize, setChunkSize] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    if (!playing || words.length === 0) return;
    const delay = Math.max(60, 60000 / wpm);
    const timer = window.setInterval(() => {
      setIndex((current) => {
        const next = current + chunkSize;
        if (next >= words.length) {
          window.clearInterval(timer);
          setPlaying(false);
          return words.length - 1;
        }
        return next;
      });
    }, delay);
    return () => window.clearInterval(timer);
  }, [chunkSize, playing, words.length, wpm]);

  const currentChunk = words.slice(index, index + chunkSize).join(' ');
  const progress = words.length > 0 ? ((index + 1) / words.length) * 100 : 0;

  return (
    <div className="speed-reading-mode">
      <header className="speed-header">
        <div>
          <h2>Lectura rápida</h2>
          <p>{index + 1} / {words.length} palabras</p>
        </div>
        <button type="button" className="reader-btn ghost" onClick={onClose}>Cerrar</button>
      </header>

      <div className="speed-word-stage">
        <span>{currentChunk || 'No hay texto cargado para este modo.'}</span>
      </div>

      <div className="speed-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)} disabled={words.length === 0}>
          {playing ? 'Pausar' : 'Reproducir'}
        </button>
        <label>
          WPM
          <input type="range" min={100} max={600} step={20} value={wpm} onChange={(event) => setWpm(Number(event.target.value))} />
          <strong>{wpm}</strong>
        </label>
        <label>
          Palabras
          <select value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value) as 1 | 2 | 3)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
      </div>
      <div className="reader-bottom-progress speed-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}
