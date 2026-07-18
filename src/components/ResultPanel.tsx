import type { BasicComparisonResult } from "../motioncap/dataset/motionCapSchema";

type Props = {
  result: BasicComparisonResult;
  onSave: () => void;
};

export function ResultPanel({ result, onSave }: Props) {
  return (
    <section className="panel result-panel">
      <div className="panel-title-row">
        <h2>Базовый анализ</h2>
        <button disabled={!result.ready} onClick={onSave}>
          Сохранить анализ
        </button>
      </div>
      <div className="score-row">
        <div>
          <span>Score</span>
          <strong>{result.score ?? "n/a"}</strong>
        </div>
        <div>
          <span>Tracking quality</span>
          <strong>{result.trackingQualityScore ?? "n/a"}</strong>
        </div>
        <div>
          <span>Frames</span>
          <strong>{result.framesCompared}</strong>
        </div>
        <div>
          <span>Shared keypoints</span>
          <strong>{result.sharedKeypoints.length}</strong>
        </div>
      </div>
      <p>{result.verdict}</p>
      {result.warnings.map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
}
