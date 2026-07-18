import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { AudioSyncState, MotionCapDataset, MotionCapFrame, MotionCapPoint } from "../dataset/motionCapSchema";

type Side = "left" | "right";

type Props = {
  left?: MotionCapDataset;
  right?: MotionCapDataset;
  sync: AudioSyncState;
};

const boneHints = [
  ["left_shoulder", "right_shoulder", 0.12],
  ["left_hip", "right_hip", 0.13],
  ["left_shoulder", "left_elbow", 0.08],
  ["left_elbow", "left_wrist", 0.065],
  ["right_shoulder", "right_elbow", 0.08],
  ["right_elbow", "right_wrist", 0.065],
  ["left_hip", "left_knee", 0.09],
  ["left_knee", "left_ankle", 0.075],
  ["right_hip", "right_knee", 0.09],
  ["right_knee", "right_ankle", 0.075],
] as const;

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
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
] as const;

const handHints = ["thumb", "index", "middle", "ring", "pinky"] as const;

const colors: Record<Side, { body: number; joint: number; ghost: number }> = {
  left: { body: 0xd13f40, joint: 0x8f1f28, ghost: 0xf4b4b4 },
  right: { body: 0x2374c9, joint: 0x104d8a, ghost: 0x9fc8f0 },
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  scale: number;
  center: THREE.Vector3;
};

function pointLookup(frame: MotionCapFrame, hint: string): MotionCapPoint | undefined {
  const exact = frame.points[hint];
  if (exact) return exact;
  return Object.values(frame.points).find((point) => point.name.toLowerCase().includes(hint));
}

function toVec(point: MotionCapPoint, bounds: Bounds) {
  const raw = new THREE.Vector3(point.x, point.z, point.y * 0.55);
  return raw.sub(bounds.center).multiplyScalar(bounds.scale);
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

function createBounds(dataset: MotionCapDataset | undefined): Bounds {
  const stride = Math.max(1, Math.floor((dataset?.frameCount ?? 0) / 100));
  const points =
    dataset?.frames
      .filter((_, index) => index % stride === 0)
      .flatMap((frame) => visibleJoints.flatMap((hint) => {
        const point = pointLookup(frame, hint);
        return point ? [new THREE.Vector3(point.x, point.z, point.y * 0.55)] : [];
      })) ?? [];
  if (!points.length) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1, scale: 1, center: new THREE.Vector3() };
  }
  const box = new THREE.Box3().setFromPoints(points);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1);
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
    scale: 3.2 / largest,
    center,
  };
}

function createCapsuleBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 8, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addSphere(group: THREE.Group, position: THREE.Vector3, radius: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.copy(position);
  group.add(mesh);
}

function drawMannequin(group: THREE.Group, frame: MotionCapFrame, side: Side, bounds: Bounds, detail: number) {
  group.clear();
  const palette = colors[side];
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: palette.body, roughness: 0.55, metalness: 0.05 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: palette.joint, roughness: 0.45 });
  const ghostMaterial = new THREE.MeshStandardMaterial({ color: palette.ghost, roughness: 0.8, transparent: true, opacity: 0.42 });
  const vec = (hint: string) => {
    const point = pointLookup(frame, hint);
    return point ? toVec(point, bounds) : undefined;
  };

  const leftShoulder = vec("left_shoulder");
  const rightShoulder = vec("right_shoulder");
  const leftHip = vec("left_hip");
  const rightHip = vec("right_hip");
  const nose = vec("nose");

  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const torsoCenter = new THREE.Vector3().addVectors(leftShoulder, rightShoulder).add(leftHip).add(rightHip).multiplyScalar(0.25);
    const torsoHeight = Math.max(0.55, leftShoulder.distanceTo(leftHip) * 0.98);
    const torsoWidth = Math.max(0.3, leftShoulder.distanceTo(rightShoulder) * 0.86);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyMaterial);
    torso.scale.set(torsoWidth * 0.75, torsoHeight * 0.58, 0.22);
    torso.position.copy(torsoCenter);
    group.add(torso);
  }

  if (nose) addSphere(group, nose, 0.16, bodyMaterial);

  for (const [from, to, radius] of boneHints) {
    const a = vec(from);
    const b = vec(to);
    if (!a || !b) continue;
    group.add(createCapsuleBetween(a, b, radius, bodyMaterial));
  }

  visibleJoints.forEach((hint) => {
    const point = vec(hint);
    if (point) addSphere(group, point, 0.055, jointMaterial);
  });

  if (detail > 80) {
    Object.values(frame.points)
      .filter((point) => handHints.some((hint) => point.name.toLowerCase().includes(hint)))
      .slice(0, 60)
      .forEach((point) => addSphere(group, toVec(point, bounds), 0.028, ghostMaterial));
  }

  if (detail > 120) {
    Object.values(frame.points)
      .filter((point) => point.name.toLowerCase().includes("face"))
      .filter((_, index) => index % 8 === 0)
      .slice(0, 70)
      .forEach((point) => addSphere(group, toVec(point, bounds), 0.018, ghostMaterial));
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material.dispose();
  });
}

export function MotionCapViewer({ left, right, sync }: Props) {
  const leftMountRef = useRef<HTMLDivElement>(null);
  const rightMountRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0.2);
  const maxFrames = useMemo(() => Math.max(left?.frameCount ?? 0, right?.frameCount ?? 0), [left, right]);

  useEffect(() => {
    if (!playing || maxFrames < 2) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % maxFrames), 1000 / 30);
    return () => window.clearInterval(timer);
  }, [playing, maxFrames]);

  const leftTime = frameTime(left, frame);
  const rightFrame = nearestFrameByTime(right, leftTime + sync.offsetSeconds);
  const rightIndex = rightFrame ? right?.frames.indexOf(rightFrame) ?? frame : frame;

  return (
    <section className="panel visualizer">
      <div className="panel-title-row">
        <h2>3D визуализация движений</h2>
        <span className="muted">
          Эталон: {left ? `${left.frameCount} кадров` : "нет"} · Ученик: {right ? `${right.frameCount} кадров` : "нет"} · sync {sync.offsetSeconds.toFixed(2)} c
        </span>
      </div>
      <div className="viewer-split">
        <ThreeStage
          title="Эталон педагога"
          dataset={left}
          frameIndex={frame}
          mountRef={leftMountRef}
          side="left"
          rotation={rotation}
          zoom={zoom}
          onRotate={setRotation}
        />
        <ThreeStage
          title="Ученик / повторение"
          dataset={right}
          frameIndex={Math.max(0, rightIndex)}
          mountRef={rightMountRef}
          side="right"
          rotation={rotation}
          zoom={zoom}
          onRotate={setRotation}
        />
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
          <input type="range" min="70" max="140" value={Math.round(zoom * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} />
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
            setZoom(1);
            setRotation(0.2);
          }}
        >
          Сброс вида
        </button>
        <span className="muted">Кадр {Math.min(frame, Math.max(0, maxFrames - 1))}</span>
      </div>
    </section>
  );
}

function ThreeStage({
  title,
  dataset,
  frameIndex,
  mountRef,
  side,
  rotation,
  zoom,
  onRotate,
}: {
  title: string;
  dataset?: MotionCapDataset;
  frameIndex: number;
  mountRef: RefObject<HTMLDivElement | null>;
  side: Side;
  rotation: number;
  zoom: number;
  onRotate: (rotation: number) => void;
}) {
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    scene: THREE.Scene;
    group: THREE.Group;
    frameId: number;
  } | undefined>(undefined);
  const dragRef = useRef<{ x: number; rotation: number } | null>(null);
  const bounds = useMemo(() => createBounds(dataset), [dataset]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8faf9);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 1.1, 6);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8d2cf, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.4, 4, 3.2);
    scene.add(key);

    const grid = new THREE.GridHelper(5.5, 10, 0xc9d2ce, 0xe1e7e4);
    grid.position.y = -1.85;
    scene.add(grid);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 48),
      new THREE.MeshBasicMaterial({ color: colors[side].ghost, transparent: true, opacity: 0.24 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.84;
    scene.add(floor);

    const group = new THREE.Group();
    scene.add(group);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      renderer.render(scene, camera);
      sceneRef.current!.frameId = requestAnimationFrame(render);
    };
    sceneRef.current = { renderer, camera, scene, group, frameId: requestAnimationFrame(render) };

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(sceneRef.current?.frameId ?? 0);
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = undefined;
    };
  }, [mountRef, side]);

  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    const cameraDistance = 6 / zoom;
    state.camera.position.set(Math.sin(rotation) * cameraDistance, 1.1, Math.cos(rotation) * cameraDistance);
    state.camera.lookAt(0, 0, 0);
    state.group.rotation.y = rotation;
    const frame = dataset?.frames[Math.min(frameIndex, Math.max(0, (dataset?.frameCount ?? 1) - 1))];
    if (frame) drawMannequin(state.group, frame, side, bounds, dataset?.pointCount ?? 0);
    else state.group.clear();
  }, [dataset, frameIndex, side, bounds, rotation, zoom]);

  return (
    <div className="viewer-stage">
      <div className="viewer-stage-title">
        <strong>{title}</strong>
        <span>{dataset ? `${dataset.pointCount} точек · ${dataset.frameCount} кадров` : "нет данных"}</span>
      </div>
      <div
        className="three-stage"
        ref={mountRef}
        onPointerDown={(event) => {
          dragRef.current = { x: event.clientX, rotation };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          onRotate(dragRef.current.rotation + (event.clientX - dragRef.current.x) * 0.008);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        {!dataset && <div className="canvas-empty">Импортируй FreeMoCap CSV, и здесь появится объемный персонаж.</div>}
      </div>
    </div>
  );
}
