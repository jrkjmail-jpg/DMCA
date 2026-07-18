export function DataSourcePanel() {
  return (
    <section className="panel source-panel">
      <h2>Источник MotionCap данных</h2>
      <div className="source-grid">
        {["Видео через FreeMoCap", "FreeMoCap CSV", "FreeMoCap JSON", "Видео для просмотра", "История анализа"].map((source) => (
          <div className="source-item" key={source}>
            {source}
          </div>
        ))}
      </div>
      <p className="muted">
        Сейчас можно загрузить видео в локальный FreeMoCap backend или импортировать готовый CSV/JSON export.
      </p>
    </section>
  );
}
