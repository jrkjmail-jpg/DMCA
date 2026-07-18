import type { MotionCapDataset } from "../motioncap/dataset/motionCapSchema";

type Props = {
  left?: MotionCapDataset;
  right?: MotionCapDataset;
};

function flag(value: boolean) {
  return value ? "есть" : "нет";
}

export function MotionCapSettingsPanel({ left, right }: Props) {
  const datasets = [left, right].filter(Boolean) as MotionCapDataset[];
  const primary = left ?? right;
  if (!primary) {
    return (
      <section className="panel">
        <h2>Настройки MotionCap</h2>
        <p className="empty">Настройки будут доступны после загрузки FreeMoCap export.</p>
      </section>
    );
  }

  const totalFrames = datasets.reduce((sum, dataset) => sum + dataset.frameCount, 0);
  const pointMax = Math.max(...datasets.map((dataset) => dataset.pointCount));

  return (
    <section className="panel">
      <h2>Настройки MotionCap</h2>
      <dl className="settings-grid">
        <dt>Источник</dt>
        <dd>FreeMoCap</dd>
        <dt>Формат данных</dt>
        <dd>{datasets.map((dataset) => dataset.format).join(" / ")}</dd>
        <dt>Количество кадров</dt>
        <dd>{totalFrames}</dd>
        <dt>Количество 3D-точек</dt>
        <dd>{pointMax}</dd>
        <dt>Руки</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasHands))}</dd>
        <dt>Лицо</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasFace))}</dd>
        <dt>Center of mass</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasCenterOfMass))}</dd>
        <dt>Reprojection error</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasReprojectionError))}</dd>
        <dt>Synchronized videos</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasSynchronizedVideos))}</dd>
        <dt>Annotated videos</dt>
        <dd>{flag(datasets.some((dataset) => dataset.hasAnnotatedVideos))}</dd>
        <dt>FPS</dt>
        <dd>{primary.fps ? primary.fps.toFixed(2) : "не определено"}</dd>
        <dt>Длительность</dt>
        <dd>{primary.duration ? `${primary.duration.toFixed(2)} с` : "не определено"}</dd>
        <dt>Единицы</dt>
        <dd>{primary.units ?? "не определено"}</dd>
        <dt>Tracking quality</dt>
        <dd>{datasets.some((dataset) => dataset.hasReprojectionError) ? "доступно из reprojection error" : "нет данных"}</dd>
      </dl>
    </section>
  );
}
