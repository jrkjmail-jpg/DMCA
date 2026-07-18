import { useEffect, useMemo, useRef, useState } from "react";
import type { MotionCapDataset, MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

type ViewerMode = "left" | "right" | "overlay";

type Props = {
  left?: MotionCapDataset;
  right?: MotionCapDataset;
};

const boneHints = [
  ["left_shoulder", "right_shoulder"],
  ["left_hip", "right_hip"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
];

function pointLookup(frame: MotionCapFrame, hint: string): MotionCapPoint | undefined {
  const exact = frame.points[hint];
  if (exact) return exact;
  return Object.values(frame.points).find((point) => point.name.toLowerCase().includes(hint));
}

function project(point: MotionCapPoint, width: number, height: number, zoom: number, rotation: number) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x = point.x * cos - point.z * sin;
  const z = point.x * sin + point.z * cos;
  return {
    x: width / 2 + x * zoom,
    y: height / 2 - (point.y * zoom - z * zoom * 0.22),
  };
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: MotionCapFrame, color: string, zoom: number, rotation: number) {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  for (const [from, to] of boneHints) {
    const a = pointLookup(frame, from);
    const b = pointLookup(frame, to);
    if (!a || !b) continue;
    const pa = project(a, width, height, zoom, rotation);
    const pb = project(b, width, height, zoom, rotation);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  Object.values(frame.points).forEach((point) => {
    const projected = project(point, width, height, zoom, rotation);
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function MotionCapViewer({ left, right }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ViewerMode>("overlay");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(42);
  const [rotation, setRotation] = useState(0);
  const maxFrames = useMemo(() => Math.max(left?.frameCount ?? 0, right?.frameCount ?? 0), [left, right]);

  useEffect(() => {
    if (!playing || maxFrames < 2) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % maxFrames), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [playing, maxFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--panel");
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.moveTo(rect.width / 2, 0);
    ctx.lineTo(rect.width / 2, rect.height);
    ctx.stroke();

    if ((mode === "left" || mode === "overlay") && left?.frames[frame]) drawFrame(ctx, left.frames[frame], "#d13f40", zoom, rotation);
    if ((mode === "right" || mode === "overlay") && right?.frames[frame]) drawFrame(ctx, right.frames[frame], "#2374c9", zoom, rotation);
  }, [left, right, frame, mode, zoom, rotation]);

  return (
    <section className="panel visualizer">
      <div className="panel-title-row">
        <h2>3D визуализация скелетов</h2>
        <div className="segmented" aria-label="Режим визуализации">
          {(["left", "right", "overlay"] as ViewerMode[]).map((item) => (
            <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
              {item === "left" ? "Эталон" : item === "right" ? "Ученик" : "Наложение"}
            </button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="skeleton-canvas" aria-label="Проекция 3D-скелетов X/Z" />
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
          <input type="range" min="12" max="120" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
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
            setZoom(42);
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
