import type { BasicComparisonResult, MotionCapDataset } from "../dataset/motionCapSchema";
import { normalizeDataset } from "../normalize/normalizeMotionCapSkeleton";
import { distance3d, intersectKeypoints } from "../utils/skeletonMath3d";

export function compareBasic3D(left?: MotionCapDataset, right?: MotionCapDataset, syncOffsetSeconds = 0): BasicComparisonResult {
  const warnings: string[] = [];
  if (!left || !right) {
    return {
      ready: false,
      method: "Базовый 3D импорт",
      score: null,
      trackingQualityScore: null,
      framesCompared: 0,
      sharedKeypoints: [],
      durationCompared: 0,
      warnings: ["Загрузите эталон и данные ученика для сравнения."],
      verdict: "Ожидание пары FreeMoCap datasets.",
      rawMetrics: {},
    };
  }

  const sharedKeypoints = intersectKeypoints(left.keypoints, right.keypoints);
  if (sharedKeypoints.length < 5) warnings.push("Мало общих keypoints; score является только технической проверкой импорта.");

  const leftFrames = normalizeDataset(left, sharedKeypoints);
  const rightFrames = normalizeDataset(right, sharedKeypoints);
  const frameShift = Math.round(syncOffsetSeconds * (right.fps || left.fps || 30));
  const comparable = Math.min(leftFrames.length, Math.max(0, rightFrames.length - Math.abs(frameShift)));
  let totalDistance = 0;
  let samples = 0;

  for (let index = 0; index < comparable; index += 1) {
    const rightIndex = Math.max(0, Math.min(rightFrames.length - 1, index + frameShift));
    const leftFrame = leftFrames[index];
    const rightFrame = rightFrames[rightIndex];
    for (const keypoint of sharedKeypoints) {
      const leftPoint = leftFrame.points[keypoint];
      const rightPoint = rightFrame.points[keypoint];
      if (!leftPoint || !rightPoint) continue;
      totalDistance += distance3d(leftPoint, rightPoint);
      samples += 1;
    }
  }

  const meanDistance = samples ? totalDistance / samples : Number.POSITIVE_INFINITY;
  const score = Number.isFinite(meanDistance) ? Math.max(0, Math.min(100, 100 * Math.exp(-meanDistance))) : null;
  const trackingQualityScore = left.hasReprojectionError || right.hasReprojectionError ? Math.max(0, (score ?? 0) - 8) : null;
  const durationCompared = comparable / (left.fps || right.fps || 30);

  return {
    ready: samples > 0,
    method: "Базовый 3D импорт",
    score: score === null ? null : Math.round(score),
    trackingQualityScore: trackingQualityScore === null ? null : Math.round(trackingQualityScore),
    framesCompared: comparable,
    sharedKeypoints,
    durationCompared,
    warnings,
    verdict:
      samples > 0
        ? "Техническое сравнение 3D-траекторий выполнено. Это не хореографический вердикт."
        : "Недостаточно общих 3D-точек для анализа.",
    rawMetrics: {
      meanNormalizedDistance: Number.isFinite(meanDistance) ? meanDistance : null,
      samples,
      syncOffsetSeconds,
    },
  };
}
