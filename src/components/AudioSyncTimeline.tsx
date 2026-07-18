import type { AudioSyncState } from "../motioncap/dataset/motionCapSchema";
import type { AudioWaveform } from "../motioncap/utils/audioSync";

type Props = {
  leftWaveform: AudioWaveform;
  rightWaveform: AudioWaveform;
  sync: AudioSyncState;
  onSync: () => void;
  onManualOffset: (offset: number) => void;
};

function Wave({ data, color }: { data: AudioWaveform; color: "red" | "blue" }) {
  return (
    <div className={`wave wave-${color}`}>
      {(data.length ? data : Array.from({ length: 48 }, () => 0.08)).map((value, index) => (
        <span key={index} style={{ height: `${Math.max(6, value * 100)}%` }} />
      ))}
    </div>
  );
}

export function AudioSyncTimeline({ leftWaveform, rightWaveform, sync, onSync, onManualOffset }: Props) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>Видео и аудио</h2>
        <button disabled={!leftWaveform.length || !rightWaveform.length} onClick={onSync}>
          Синхронизировать по аудио
        </button>
      </div>
      <div className="timeline-grid">
        <span>Эталон</span>
        <Wave data={leftWaveform} color="red" />
        <span>Ученик</span>
        <Wave data={rightWaveform} color="blue" />
      </div>
      <div className="sync-controls">
        <label>
          Ручное смещение аудио, сек
          <input
            type="number"
            step="0.05"
            value={sync.offsetSeconds}
            onChange={(event) => onManualOffset(Number(event.target.value))}
          />
        </label>
        <span className="muted">Метод: {sync.method}; confidence: {sync.confidence ? sync.confidence.toFixed(2) : "n/a"}</span>
      </div>
    </section>
  );
}
