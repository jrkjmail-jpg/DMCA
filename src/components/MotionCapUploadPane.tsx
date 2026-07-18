import type { MotionCapDataset } from "../motioncap/dataset/motionCapSchema";

type Props = {
  title: string;
  role: "left" | "right";
  dataset?: MotionCapDataset;
  videoUrl?: string;
  videoName?: string;
  onDataFile: (file: File) => void;
  onVideoFile: (file: File) => void;
  onAudioFile: (file: File) => void;
};

export function MotionCapUploadPane({ title, dataset, videoUrl, videoName, onDataFile, onVideoFile, onAudioFile }: Props) {
  return (
    <section className="upload-pane">
      <h2>{title}</h2>
      <div className="upload-actions">
        <label>
          CSV/JSON MotionCap
          <input
            type="file"
            accept=".csv,.json,application/json,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onDataFile(file);
            }}
          />
        </label>
        <label>
          Видео
          <input
            type="file"
            accept="video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onVideoFile(file);
            }}
          />
        </label>
        <label>
          Аудио/видео для синхронизации
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onAudioFile(file);
            }}
          />
        </label>
      </div>
      {dataset ? (
        <dl className="dataset-facts">
          <dt>Файл</dt>
          <dd>{dataset.fileName}</dd>
          <dt>Формат</dt>
          <dd>{dataset.format}</dd>
          <dt>Кадры</dt>
          <dd>{dataset.frameCount}</dd>
          <dt>Точки</dt>
          <dd>{dataset.pointCount}</dd>
          <dt>Длительность</dt>
          <dd>{dataset.duration ? `${dataset.duration.toFixed(2)} с` : "не определено"}</dd>
          <dt>3D</dt>
          <dd>{dataset.has3d ? "есть" : "нет"}</dd>
        </dl>
      ) : (
        <p className="empty">Загрузите `body_3d_xyz.csv`, `*_by_frame.csv` или JSON базу приложения.</p>
      )}
      {dataset?.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
      {videoUrl && (
        <div className="video-box">
          <video src={videoUrl} controls preload="metadata" />
          <span className="muted">{videoName}</span>
        </div>
      )}
    </section>
  );
}
