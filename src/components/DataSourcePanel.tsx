export function DataSourcePanel() {
  return (
    <section className="panel source-panel">
      <h2>Источник MotionCap данных</h2>
      <div className="source-grid">
        {["FreeMoCap CSV", "FreeMoCap JSON", "FreeMoCap recording folder", "Видео + аудио", "В будущем: FreeMoCap backend"].map((source) => (
          <div className="source-item" key={source}>
            {source}
          </div>
        ))}
      </div>
      <p className="muted">
        Этап v0.1.0 импортирует готовые FreeMoCap CSV/JSON exports, отдельное видео и аудио/видео для ручной синхронизации.
      </p>
    </section>
  );
}
