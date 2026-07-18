import { appVersion, type AudioSyncState, type BasicComparisonResult, type MotionCapDataset, type MotionCapHistoryRecord } from "./motionCapSchema";

const storageKey = "dance-motion-cap-analytics-history-v0.1.0";

export function loadMotionCapHistory(): MotionCapHistoryRecord[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as MotionCapHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveMotionCapHistory(records: MotionCapHistoryRecord[]): void {
  localStorage.setItem(storageKey, JSON.stringify(records));
}

export function createHistoryRecord(params: {
  left: MotionCapDataset;
  right: MotionCapDataset;
  leftVideoName?: string;
  rightVideoName?: string;
  result: BasicComparisonResult;
  audioSync: AudioSyncState;
}): MotionCapHistoryRecord {
  const { left, right, result, audioSync } = params;
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    appVersion,
    appBuild: appVersion.build,
    modelId: "basic-3d-import",
    modelVersion: "0.1.0",
    leftFileName: left.fileName,
    rightFileName: right.fileName,
    leftVideoName: params.leftVideoName,
    rightVideoName: params.rightVideoName,
    leftDataFormat: left.format,
    rightDataFormat: right.format,
    frameCountLeft: left.frameCount,
    frameCountRight: right.frameCount,
    keypointsLeft: left.pointCount,
    keypointsRight: right.pointCount,
    sharedKeypoints: result.sharedKeypoints,
    hasHands: left.hasHands || right.hasHands,
    hasFace: left.hasFace || right.hasFace,
    hasCenterOfMass: left.hasCenterOfMass || right.hasCenterOfMass,
    hasReprojectionError: left.hasReprojectionError || right.hasReprojectionError,
    durationLeft: left.duration,
    durationRight: right.duration,
    audioSync,
    manualSync: audioSync.offsetSeconds,
    score: result.score,
    trackingQualityScore: result.trackingQualityScore,
    warnings: result.warnings,
    verdict: result.verdict,
    compactSkeletons: {
      left: left.frames.slice(0, 12),
      right: right.frames.slice(0, 12),
    },
    rawMetrics: result.rawMetrics,
  };
}
