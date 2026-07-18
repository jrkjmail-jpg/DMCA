import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AudioSyncState, MotionCapDataset, MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

type Side = "left" | "right";

type Props = {
  left?: MotionCapDataset;
  right?: MotionCapDataset;
  sync: AudioSyncState;
};

const boneHints = [
  ["left_shoulder", "right_shoulder", 18],
  ["left_hip", "right_hip", 18],
  ["left_shoulder", "left_elbow", 14],
  ["left_elbow", "left_wrist", 11],
  ["right_shoulder", "right_elbow", 14],
  ["right_elbow", "right_wrist", 11],
  ["left_hip", "left_knee", 15],
  ["left_knee", "left_ankle", 12],
  ["right_hip", "right_knee", 15],
  ["right_knee", "right_ankle", 12],
  ["left_shoulder", "left_hip", 20],
  ["right_shoulder", "right_hip", 20],
] as const;

type ProjectedPoint = {
  x: number;
  y: number;
};

type Viewport = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  scale: number;
  padding: number;
};

type DrawPalette = {
  body: string;
  bodyLight: string;
  joint: string;
  outline: string;
};

const palettes: Record<Side, DrawPalette> = {
  left: {
    body: "#d13f40",
    bodyLight: "rgba(209, 63, 64, .18)",
    joint: "#9f242b",
    outline: "rgba(120, 22, 28, .34)",
  },
  right: {
    body: "#2374c9",
    bodyLight: "rgba(35, 116, 201, .18)",
    joint: "#13508f",
    outline: "rgba(18, 63, 116, .34)",
  },
};

function pointLookup(frame: MotionCapFrame, hint: string): MotionCapPoint | undefined {
  const exact = frame.points[hint];
  if (exact) return exact;
  return Object.values(frame.points).find((point) => point.name.toLowerCase().includes(hint));
}

function projectRaw(point: MotionCapPoint, rotation: number): ProjectedPoint {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = point.x * cos - point.z * sin;
  const z = point.x * sin + point.z * cos;
  return { x, y: z - point.y * 0.18 };
}

function frameTime(dataset: MotionCapDataset | undefined, frameIndex: number) {
  const frame = dataset?.frames[Math.min(frameIndex, Math.max(0, (dataset?.frameCount ?? 1) - 1))];
  return frame?.time ?? frameIndex / (dataset?.fps || 30);
}

function nearestFrameByTime(dataset: MotionCapDataset | undefined, time: number) {
  if (!dataset?.frames.length) return undefined;
  let best = dataset.frames[0];
  let bestDistance = Math.abs((best.time ?? best.frame / (dataset.fps || 30)) - time);
  for (const frame of dataset.frames) {
    const distance = Math.abs((frame.time ?? frame.frame / (dataset.fps || 30)) - time);
    if (distance >= bestDistance) continue;
    best = frame;
    bestDistance = distance;
  }
  return best;
}

function createStableViewport(dataset: MotionCapDataset | undefined, width: number, height: number, rotation: number, zoom: number): Viewport {
  const stride = Math.max(1, Math.floor((dataset?.frameCount ?? 0) / 90));
  const frames = dataset?.frames.filter((_, index) => index % stride === 0) ?? [];
  const bodyHints = [
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ];
  const points = frames.flatMap((frame) =>
    bodyHints.flatMap((hint) => {
      const point = pointLookup(frame, hint);
      return point ? [projectRaw(point, rotation)] : [];
    }),
  );
  if (!points.length) return { minX: -1, minY: -1, width: 2, height: 2, scale: 1, padding: 34 };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const sceneWidth = Math.max(1, maxX - minX);
  const sceneHeight = Math.max(1, maxY - minY);
  const padding = 42;
  const scaleX = (width - padding * 2) / sceneWidth;
  const scaleY = (height - padding * 2) / sceneHeight;
  return {
    minX,
    minY,
    width: sceneWidth,
    height: sceneHeight,
    scale: Math.min(scaleX, scaleY) * (zoom / 100),
    padding,
  };
}

function project(point: MotionCapPoint, viewport: Viewport, canvasWidth: number, canvasHeight: number, rotation: number) {
  const raw = projectRaw(point, rotation);
  const centerX = viewport.minX + viewport.width / 2;
  const centerY = viewport.minY + viewport.height / 2;
  return {
    x: canvasWidth / 2 + (raw.x - centerX) * viewport.scale,
    y: canvasHeight / 2 - (raw.y - centerY) * viewport.scale,
  };
}

function drawCapsule(ctx: CanvasRenderingContext2D, a: ProjectedPoint, b: ProjectedPoint, width: number, palette: DrawPalette) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = width + 5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = palette.body;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawEllipse(ctx: CanvasRenderingContext2D, point: ProjectedPoint, radiusX: number, radiusY: number, palette: DrawPalette) {
  ctx.save();
  ctx.fillStyle = palette.bodyLight;
  ctx.strokeStyle = palette.body;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTorso(ctx: CanvasRenderingContext2D, points: ProjectedPoint[], palette: DrawPalette) {
  if (points.length < 4) return;
  ctx.save();
  ctx.fillStyle = palette.bodyLight;
  ctx.strokeStyle = palette.body;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFloor(ctx: CanvasRenderingContext2D, width: number, height: number, palette: DrawPalette) {
  const horizon = height * 0.62;
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, .08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i += 1) {
    const y = horizon + (i / 8) * (height - horizon - 18);
    ctx.beginPath();
    ctx.moveTo(18, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }
  for (let i = -4; i <= 4; i += 1) {
    const x = width / 2 + i * (width / 10);
    ctx.beginPath();
    ctx.moveTo(width / 2, horizon);
    ctx.lineTo(x, height - 18);
    ctx.stroke();
  }
  ctx.fillStyle = palette.bodyLight;
  ctx.beginPath();
  ctx.ellipse(width / 2, height * 0.82, width * 0.18, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBodyFrame(
  ctx: CanvasRenderingContext2D,
  frame: MotionCapFrame,
  side: Side,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  rotation: number,
) {
  const palette = palettes[side];
  const projected = (hint: string) => {
    const point = pointLookup(frame, hint);
    return point ? project(point, viewport, canvasWidth, canvasHeight, rotation) : undefined;
  };

  const leftShoulder = projected("left_shoulder");
  const rightShoulder = projected("right_shoulder");
  const leftHip = projected("left_hip");
  const rightHip = projected("right_hip");
  const nose = projected("nose");
  const leftEar = projected("left_ear");
  const rightEar = projected("right_ear");

  if (leftShoulder && rightShoulder && rightHip && leftHip) drawTorso(ctx, [leftShoulder, rightShoulder, rightHip, leftHip], palette);

  if (nose) {
    const earWidth = leftEar && rightEar ? Math.max(16, Math.abs(leftEar.x - rightEar.x) * 0.75) : 16;
    drawEllipse(ctx, nose, earWidth, 17, palette);
  }

  for (const [from, to, width] of boneHints) {
    const a = projected(from);
    const b = projected(to);
    if (!a || !b) continue;
    drawCapsule(ctx, a, b, width * 0.62, palette);
  }

  const visibleJoints = [
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ];
  visibleJoints.forEach((hint) => {
    const dot = projected(hint);
    if (!dot) return;
    ctx.fillStyle = palette.joint;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawScene(
  canvas: HTMLCanvasElement | null,
  dataset: MotionCapDataset | undefined,
  side: Side,
  frameIndex: number,
  zoom: number,
  rotation: number,
) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const palette = palettes[side];
  const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#f3f6f5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, rect.width, rect.height);
  drawFloor(ctx, rect.width, rect.height, palette);

  const frame = dataset?.frames[Math.min(frameIndex, Math.max(0, (dataset?.frameCount ?? 1) - 1))];
  if (!frame) return;
  const viewport = createStableViewport(dataset, rect.width, rect.height, rotation, zoom);
  drawBodyFrame(ctx, frame, side, viewport, rect.width, rect.height, rotation);
}

export function MotionCapViewer({ left, right, sync }: Props) {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(86);
  const [rotation, setRotation] = useState(0);
  const maxFrames = useMemo(() => Math.max(left?.frameCount ?? 0, right?.frameCount ?? 0), [left, right]);

  useEffect(() => {
    if (!playing || maxFrames < 2) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % maxFrames), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [playing, maxFrames]);

  useEffect(() => {
    const leftTime = frameTime(left, frame);
    const rightFrameIndex = right?.frames.indexOf(nearestFrameByTime(right, leftTime + sync.offsetSeconds) ?? right.frames[frame] ?? right.frames[0]) ?? frame;
    drawScene(leftCanvasRef.current, left, "left", frame, zoom, rotation);
    drawScene(rightCanvasRef.current, right, "right", Math.max(0, rightFrameIndex), zoom, rotation);
  }, [left, right, frame, zoom, rotation, sync.offsetSeconds]);

  return (
    <section className="panel visualizer">
      <div className="panel-title-row">
        <h2>3D визуализация движений</h2>
        <span className="muted">
          Эталон: {left ? `${left.frameCount} кадров` : "нет"} · Ученик: {right ? `${right.frameCount} кадров` : "нет"} · sync {sync.offsetSeconds.toFixed(2)} c
        </span>
      </div>
      <div className="viewer-split">
        <ViewerStage title="Эталон педагога" dataset={left} canvasRef={leftCanvasRef} />
        <ViewerStage title="Ученик / повторение" dataset={right} canvasRef={rightCanvasRef} />
      </div>
      <div className="viewer-controls">
        <button onClick={() => setPlaying((value) => !value)}>{playing ? "Пауза" : "Play"}</button>
        <button onClick={() => setFrame((value) => Math.max(0, value - 1))}>-1</button>
        <input
          type="range"
          min="0"
          max={Math.max(0, maxFrames - 1)}
          value={Math.min(frame, Math.max(0, maxFrames - 1))}
          onChange={(event) => setFrame(Number(event.target.value))}
        />
        <button onClick={() => setFrame((value) => Math.min(Math.max(0, maxFrames - 1), value + 1))}>+1</button>
        <label>
          Масштаб
          <input type="range" min="45" max="170" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <label>
          Камера
          <input
            type="range"
            min="-314"
            max="314"
            value={Math.round(rotation * 100)}
            onChange={(event) => setRotation(Number(event.target.value) / 100)}
          />
        </label>
        <button
          onClick={() => {
            setZoom(86);
            setRotation(0);
          }}
        >
          Сброс вида
        </button>
        <span className="muted">Кадр {Math.min(frame, Math.max(0, maxFrames - 1))}</span>
      </div>
    </section>
  );
}

function ViewerStage({
  title,
  dataset,
  canvasRef,
}: {
  title: string;
  dataset?: MotionCapDataset;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <div className="viewer-stage">
      <div className="viewer-stage-title">
        <strong>{title}</strong>
        <span>{dataset ? `${dataset.frameCount} кадров` : "нет данных"}</span>
      </div>
      <div className="canvas-wrap">
        {!dataset && <div className="canvas-empty">Импортируй CSV, и здесь появится движущаяся 3D-форма.</div>}
        <canvas ref={canvasRef} className="skeleton-canvas" aria-label={`${title}: 3D-форма по FreeMoCap данным`} />
      </div>
    </div>
  );
}
