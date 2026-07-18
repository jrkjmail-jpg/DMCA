export const appVersion = {
  name: "Dance Motion Cap Analytics",
  version: "0.1.0",
  versionLabel: "v0.1.0",
  build: `motioncap-foundation-${new Date().toISOString().slice(0, 10)}`,
} as const;

export type MotionCapPoint = {
  name: string;
  x: number;
  y: number;
  z: number;
  confidence?: number;
};

export type MotionCapFrame = {
  frame: number;
  time?: number;
  points: Record<string, MotionCapPoint>;
};

export type MotionCapFormat = "wide CSV" | "tidy CSV" | "JSON" | "unknown";

export type MotionCapDataset = {
  id: string;
  source: "FreeMoCap";
  fileName: string;
  format: MotionCapFormat;
  frames: MotionCapFrame[];
  keypoints: string[];
  frameCount: number;
  pointCount: number;
  fps?: number;
  duration?: number;
  units?: string;
  has3d: boolean;
  hasHands: boolean;
  hasFace: boolean;
  hasCenterOfMass: boolean;
  hasReprojectionError: boolean;
  hasSynchronizedVideos: boolean;
  hasAnnotatedVideos: boolean;
  warnings: string[];
};

export type AudioSyncState = {
  offsetSeconds: number;
  confidence?: number;
  method: "manual" | "audio-correlation" | "none";
};

export type BasicComparisonResult = {
  ready: boolean;
  method: "Базовый 3D импорт";
  score: number | null;
  trackingQualityScore: number | null;
  framesCompared: number;
  sharedKeypoints: string[];
  durationCompared: number;
  warnings: string[];
  verdict: string;
  rawMetrics: Record<string, number | string | boolean | null>;
};

export type MotionCapHistoryRecord = {
  id: string;
  createdAt: string;
  appVersion: typeof appVersion;
  appBuild: string;
  modelId: "basic-3d-import";
  modelVersion: "0.1.0";
  leftFileName: string;
  rightFileName: string;
  leftVideoName?: string;
  rightVideoName?: string;
  leftDataFormat: MotionCapFormat;
  rightDataFormat: MotionCapFormat;
  frameCountLeft: number;
  frameCountRight: number;
  keypointsLeft: number;
  keypointsRight: number;
  sharedKeypoints: string[];
  hasHands: boolean;
  hasFace: boolean;
  hasCenterOfMass: boolean;
  hasReprojectionError: boolean;
  durationLeft?: number;
  durationRight?: number;
  audioSync: AudioSyncState;
  manualSync: number;
  score: number | null;
  trackingQualityScore: number | null;
  warnings: string[];
  verdict: string;
  compactSkeletons: {
    left: MotionCapFrame[];
    right: MotionCapFrame[];
  };
  rawMetrics: Record<string, number | string | boolean | null>;
};
