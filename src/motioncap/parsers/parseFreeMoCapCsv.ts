import type { MotionCapDataset, MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

type CsvTable = { headers: string[]; rows: string[][] };

const coordinatePattern = /^(.*?)[_.\s-]([xyz])$/i;

function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  const [headers = [], ...body] = rows;
  return { headers: headers.map((header) => header.trim()), rows: body };
}

function numberAt(row: string[], index: number): number | undefined {
  const value = Number(row[index]);
  return Number.isFinite(value) ? value : undefined;
}

function keypointFromHeader(header: string): { name: string; axis: "x" | "y" | "z" } | null {
  const cleaned = header.replace(/^mediapipe[_\s-]*/i, "").replace(/3d|xyz/gi, "");
  const match = cleaned.match(coordinatePattern);
  if (!match) return null;
  const name = match[1].replace(/^[_\s.-]+|[_\s.-]+$/g, "") || "point";
  return { name, axis: match[2].toLowerCase() as "x" | "y" | "z" };
}

function deriveMetadata(fileName: string, frames: MotionCapFrame[], format: MotionCapDataset["format"], warnings: string[]): MotionCapDataset {
  const keypoints = Array.from(new Set(frames.flatMap((frame) => Object.keys(frame.points)))).sort();
  const times = frames.map((frame) => frame.time).filter((time): time is number => typeof time === "number");
  const duration = times.length > 1 ? Math.max(...times) - Math.min(...times) : undefined;
  const fps = duration && frames.length > 1 ? (frames.length - 1) / duration : undefined;
  const lowerName = fileName.toLowerCase();
  const lowerKeys = keypoints.join(" ").toLowerCase();

  if (!frames.length) warnings.push("CSV не содержит распознанных 3D-кадров.");
  if (keypoints.length < 5) warnings.push("Найдено мало общих 3D-точек; сравнение может быть нестабильным.");

  return {
    id: crypto.randomUUID(),
    source: "FreeMoCap",
    fileName,
    format,
    frames,
    keypoints,
    frameCount: frames.length,
    pointCount: keypoints.length,
    fps,
    duration,
    units: undefined,
    has3d: keypoints.length > 0,
    hasHands: /hand|thumb|index|pinky|wrist/.test(lowerName + lowerKeys),
    hasFace: /face|nose|eye|mouth|ear/.test(lowerName + lowerKeys),
    hasCenterOfMass: /center.?of.?mass|com/.test(lowerName + lowerKeys),
    hasReprojectionError: /reprojection|error/.test(lowerName + lowerKeys),
    hasSynchronizedVideos: lowerName.includes("synchronized_videos"),
    hasAnnotatedVideos: lowerName.includes("annotated_videos"),
    warnings,
  };
}

function parseWideCsv(fileName: string, table: CsvTable): MotionCapDataset | null {
  const frameIndex = table.headers.findIndex((header) => /^(frame|frame_number|framenumber)$/i.test(header));
  const timeIndex = table.headers.findIndex((header) => /^(time|timestamp|seconds|time_sec)$/i.test(header));
  const pointColumns = table.headers
    .map((header, index) => ({ index, point: keypointFromHeader(header) }))
    .filter((item): item is { index: number; point: { name: string; axis: "x" | "y" | "z" } } => Boolean(item.point));

  if (pointColumns.length < 3) return null;

  const frames = table.rows.map((row, rowIndex) => {
    const grouped = new Map<string, Partial<MotionCapPoint>>();
    for (const column of pointColumns) {
      const numeric = numberAt(row, column.index);
      if (numeric === undefined) continue;
      const current = grouped.get(column.point.name) ?? { name: column.point.name };
      current[column.point.axis] = numeric;
      grouped.set(column.point.name, current);
    }
    const points = Object.fromEntries(
      Array.from(grouped.entries()).filter(([, point]) =>
        ["x", "y", "z"].every((axis) => Number.isFinite(point[axis as "x" | "y" | "z"])),
      ),
    ) as Record<string, MotionCapPoint>;

    return {
      frame: numberAt(row, frameIndex) ?? rowIndex,
      time: numberAt(row, timeIndex),
      points,
    };
  });

  return deriveMetadata(fileName, frames, "wide CSV", []);
}

function parseTidyCsv(fileName: string, table: CsvTable): MotionCapDataset | null {
  const normalizedHeaders = table.headers.map((header) => header.toLowerCase().replace(/[\s-]/g, "_"));
  const frameIndex = normalizedHeaders.findIndex((header) => ["frame", "frame_number", "frame_index"].includes(header));
  const pointIndex = normalizedHeaders.findIndex((header) =>
    ["keypoint", "marker", "tracked_point", "landmark", "joint", "point_name"].includes(header),
  );
  const xIndex = normalizedHeaders.findIndex((header) => ["x", "x_m", "x_mm", "position_x"].includes(header));
  const yIndex = normalizedHeaders.findIndex((header) => ["y", "y_m", "y_mm", "position_y"].includes(header));
  const zIndex = normalizedHeaders.findIndex((header) => ["z", "z_m", "z_mm", "position_z"].includes(header));
  const timeIndex = normalizedHeaders.findIndex((header) => ["time", "timestamp", "seconds", "time_sec"].includes(header));

  if ([frameIndex, pointIndex, xIndex, yIndex, zIndex].some((index) => index < 0)) return null;

  const frames = new Map<number, MotionCapFrame>();
  table.rows.forEach((row, rowNumber) => {
    const frameNumber = numberAt(row, frameIndex) ?? rowNumber;
    const pointName = row[pointIndex]?.trim();
    const x = numberAt(row, xIndex);
    const y = numberAt(row, yIndex);
    const z = numberAt(row, zIndex);
    if (!pointName || x === undefined || y === undefined || z === undefined) return;
    const frame = frames.get(frameNumber) ?? { frame: frameNumber, time: numberAt(row, timeIndex), points: {} };
    frame.points[pointName] = { name: pointName, x, y, z };
    frames.set(frameNumber, frame);
  });

  return deriveMetadata(fileName, Array.from(frames.values()).sort((a, b) => a.frame - b.frame), "tidy CSV", []);
}

export function parseFreeMoCapCsv(fileName: string, text: string): MotionCapDataset {
  const table = parseCsv(text);
  const tidy = parseTidyCsv(fileName, table);
  if (tidy) return tidy;
  const wide = parseWideCsv(fileName, table);
  if (wide) return wide;
  return deriveMetadata(fileName, [], "unknown", ["Формат CSV не распознан как FreeMoCap wide/tidy 3D export."]);
}
