import type { MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

export const pelvisCandidates = ["pelvis", "hips", "mid_hip", "left_hip", "right_hip"];
export const torsoCandidates = ["neck", "chest", "spine", "left_shoulder", "right_shoulder"];

export function distance3d(a: MotionCapPoint, b: MotionCapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function centroid(points: MotionCapPoint[]): MotionCapPoint {
  const safe = points.filter((point) => Number.isFinite(point.x + point.y + point.z));
  if (!safe.length) return { name: "centroid", x: 0, y: 0, z: 0 };
  const sum = safe.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  return { name: "centroid", x: sum.x / safe.length, y: sum.y / safe.length, z: sum.z / safe.length };
}

export function pickAnchor(frame: MotionCapFrame, names: string[]): MotionCapPoint {
  const lowered = Object.fromEntries(Object.entries(frame.points).map(([key, value]) => [key.toLowerCase(), value]));
  const direct = names.map((name) => lowered[name]).find(Boolean);
  if (direct) return direct;

  const partial = Object.values(frame.points).find((point) =>
    names.some((name) => point.name.toLowerCase().includes(name)),
  );
  return partial ?? centroid(Object.values(frame.points));
}

export function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function frameScale(frame: MotionCapFrame): number {
  const pelvis = pickAnchor(frame, pelvisCandidates);
  const torso = pickAnchor(frame, torsoCandidates);
  const torsoDistance = distance3d(pelvis, torso);
  if (torsoDistance > 0) return torsoDistance;

  const distances = Object.values(frame.points).map((point) => distance3d(point, pelvis));
  return median(distances) || 1;
}

export function intersectKeypoints(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((name) => rightSet.has(name));
}
