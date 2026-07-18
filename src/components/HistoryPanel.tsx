import type { MotionCapHistoryRecord } from "../motioncap/dataset/motionCapSchema";

type Props = {
  records: MotionCapHistoryRecord[];
  onImport: (file: File) => void;
  onExport: () => void;
  onClear: () => void;
};

export function HistoryPanel({ records, onImport, onExport, onClear }: Props) {
  return (
    <section className="panel history-panel">
      <div className="panel-title-row">
        <h2>История экспериментов</h2>
        <div className="history-actions">
          <label className="button-like">
            Импорт JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
              }}
            />
          </label>
          <button onClick={onExport} disabled={!records.length}>
            Экспорт JSON
          </button>
          <button onClick={onClear} disabled={!records.length}>
            Очистить историю
          </button>
        </div>
      </div>
      <div className="history-list">
        {records.length ? (
          records.map((record) => (
            <article className="history-card" key={record.id}>
              <strong>{new Date(record.createdAt).toLocaleString()}</strong>
              <span>{record.appVersion.name} {record.appVersion.versionLabel}</span>
              <span>{record.modelId} / {record.modelVersion}</span>
              <span>{record.leftFileName} ↔ {record.rightFileName}</span>
              <span>Score {record.score ?? "n/a"}; tracking {record.trackingQualityScore ?? "n/a"}</span>
            </article>
          ))
        ) : (
          <p className="empty">Сохраненные анализы появятся здесь.</p>
        )}
      </div>
    </section>
  );
}
