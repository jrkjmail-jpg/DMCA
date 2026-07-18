import type { MotionCapDataset, MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

function coercePoint(name: string, value: unknown): MotionCapPoint | null {
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.map(Number);
    return Number.isFinite(x + y + z) ? { name, x, y, z } : null;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const x = Number(object.x ?? object.X);
    const y = Number(object.y ?? object.Y);
    const z = Number(object.z ?? object.Z);
    return Number.isFinite(x + y + z) ? { name, x, y, z, confidence: Number(object.confidence) || undefined } : null;
  }
  return null;
}

function coerceFrame(value: unknown, index: number): MotionCapFrame | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const sourcePoints = (object.points ?? object.keypoints ?? object.skeleton ?? object.landmarks ?? object) as Record<string, unknown>;
  const points = Object.fromEntries(
    Object.entries(sourcePoints)
      .map(([name, point]) => [name, coercePoint(name, point)] as const)
      .filter((entry): entry is readonly [string, MotionCapPoint] => Boolean(entry[1])),
  );
  if (!Object.keys(points).length) return null;
  return {
    frame: Number(object.frame ?? object.frameNumber ?? index),
    time: Number.isFinite(Number(object.time ?? object.timestamp)) ? Number(object.time ?? object.timestamp) : undefined,
    points,
  };
}

export function parseFreeMoCapJson(fileName: string, text: string): MotionCapDataset {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
    warnings.push("JSON не удалось прочитать.");
  }

  const root = parsed as Record<string, unknown> | undefined;
  const sourceFrames = Array.isArray(parsed)
    ? parsed
    : Array.isArray(root?.frames)
      ? root.frames
      : Array.isArray(root?.skeletons)
        ? root.skeletons
        : [];
  const frames = sourceFrames
    .map((frame, index) => coerceFrame(frame, index))
    .filter((frame): frame is MotionCapFrame => Boolean(frame));
  const keypoints = Array.from(new Set(frames.flatMap((frame) => Object.keys(frame.points)))).sort();
  const duration =
    typeof root?.duration === "number"
      ? root.duration
      : frames.at(-1)?.time !== undefined && frames[0]?.time !== undefined
        ? (frames.at(-1)?.time ?? 0) - (frames[0]?.time ?? 0)
        : undefined;

  if (!frames.length) warnings.push("JSON не содержит массива frames/skeletons с 3D-точками.");

  return {
    id: crypto.randomUUID(),
    source: "FreeMoCap",
    fileName,
    format: "JSON",
    frames,
    keypoints,
    frameCount: frames.length,
    pointCount: keypoints.length,
    fps: typeof root?.fps === "number" ? root.fps : undefined,
    duration,
    units: typeof root?.units === "string" ? root.units : undefined,
    has3d: keypoints.length > 0,
    hasHands: keypoints.some((name) => /hand|wrist|thumb|index|pinky/i.test(name)),
    hasFace: keypoints.some((name) => /face|eye|mouth|nose|ear/i.test(name)),
    hasCenterOfMass: Boolean(root?.centerOfMass) || keypoints.some((name) => /center.?of.?mass|com/i.test(name)),
    hasReprojectionError: Boolean(root?.reprojectionError),
    hasSynchronizedVideos: Boolean(root?.synchronizedVideos),
    hasAnnotatedVideos: Boolean(root?.annotatedVideos),
    warnings,
  };
}
