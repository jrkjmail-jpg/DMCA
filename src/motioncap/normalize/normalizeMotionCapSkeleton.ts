import type { MotionCapDataset, MotionCapFrame } from "../dataset/motionCapSchema";
import { frameScale, pickAnchor, pelvisCandidates } from "../utils/skeletonMath3d";

export function normalizeFrame(frame: MotionCapFrame, sharedKeypoints?: string[]): MotionCapFrame {
  const anchor = pickAnchor(frame, pelvisCandidates);
  const scale = frameScale(frame);
  const allowed = sharedKeypoints ? new Set(sharedKeypoints) : null;
  const points = Object.fromEntries(
    Object.entries(frame.points)
      .filter(([name]) => !allowed || allowed.has(name))
      .map(([name, point]) => [
        name,
        {
          ...point,
          x: (point.x - anchor.x) / scale,
          y: (point.y - anchor.y) / scale,
          z: (point.z - anchor.z) / scale,
        },
      ]),
  );

  return { ...frame, points };
}

export function normalizeDataset(dataset: MotionCapDataset, sharedKeypoints?: string[]): MotionCapFrame[] {
  return dataset.frames.map((frame) => normalizeFrame(frame, sharedKeypoints));
}
