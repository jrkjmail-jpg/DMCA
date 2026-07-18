import { useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { AudioSyncTimeline } from "./components/AudioSyncTimeline";
import { DataSourcePanel } from "./components/DataSourcePanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { FreeMoCapPipelinePanel } from "./components/FreeMoCapPipelinePanel";
import { ModelsPanel } from "./components/ModelsPanel";
import { MotionCapSettingsPanel } from "./components/MotionCapSettingsPanel";
import { MotionCapUploadPane } from "./components/MotionCapUploadPane";
import { ResultPanel } from "./components/ResultPanel";
import { compareBasic3D } from "./motioncap/compare/compareBasic3D";
import { createHistoryRecord, loadMotionCapHistory, saveMotionCapHistory } from "./motioncap/dataset/motionCapHistory";
import type { AudioSyncState, MotionCapDataset, MotionCapHistoryRecord } from "./motioncap/dataset/motionCapSchema";
import { parseFreeMoCapCsv } from "./motioncap/parsers/parseFreeMoCapCsv";
import { parseFreeMoCapJson } from "./motioncap/parsers/parseFreeMoCapJson";
import { buildAudioWaveform, estimateAudioOffset, type AudioWaveform } from "./motioncap/utils/audioSync";
import { MotionCapViewer } from "./motioncap/visualize/MotionCapViewer";

type Side = "left" | "right";

type MediaState = {
  videoUrl?: string;
  videoName?: string;
  audioWaveform: AudioWaveform;
};

const initialMedia: Record<Side, MediaState> = {
  left: { audioWaveform: [] },
  right: { audioWaveform: [] },
};

function statusFor(left?: MotionCapDataset, right?: MotionCapDataset) {
  if (left && right) return "Готово к анализу";
  if (left) return "Данные эталона загружены";
  if (right) return "Данные ученика загружены";
  return "Ожидание данных";
}

async function parseDataFile(file: File): Promise<MotionCapDataset | MotionCapHistoryRecord[]> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => item && typeof item === "object" && "createdAt" in item)) {
      return parsed as MotionCapHistoryRecord[];
    }
    return parseFreeMoCapJson(file.name, text);
  }
  return parseFreeMoCapCsv(file.name, text);
}

export default function App() {
  const [left, setLeft] = useState<MotionCapDataset>();
  const [right, setRight] = useState<MotionCapDataset>();
  const [media, setMedia] = useState(initialMedia);
  const [history, setHistory] = useState<MotionCapHistoryRecord[]>(() => loadMotionCapHistory());
  const [sync, setSync] = useState<AudioSyncState>({ offsetSeconds: 0, method: "none" });
  const [error, setError] = useState<string>();
  const result = useMemo(() => compareBasic3D(left, right, sync.offsetSeconds), [left, right, sync.offsetSeconds]);

  async function handleDataFile(side: Side, file: File) {
    setError(undefined);
    try {
      const parsed = await parseDataFile(file);
      if (Array.isArray(parsed)) {
        setHistory(parsed);
        saveMotionCapHistory(parsed);
        return;
      }
      if (side === "left") setLeft(parsed);
      else setRight(parsed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось прочитать файл данных.");
    }
  }

  function importPipelineCsv(side: Side, fileName: string, text: string) {
    const parsed = parseFreeMoCapCsv(fileName, text);
    if (side === "left") setLeft(parsed);
    else setRight(parsed);
  }

  function handleVideoFile(side: Side, file: File) {
    setMedia((current) => ({
      ...current,
      [side]: {
        ...current[side],
        videoUrl: URL.createObjectURL(file),
        videoName: file.name,
      },
    }));
  }

  async function handleAudioFile(side: Side, file: File) {
    setError(undefined);
    try {
      const audioWaveform = await buildAudioWaveform(file);
      setMedia((current) => ({ ...current, [side]: { ...current[side], audioWaveform } }));
    } catch {
      setError("Браузер не смог декодировать аудио/видео для волны синхронизации.");
    }
  }

  function saveAnalysis() {
    if (!left || !right || !result.ready) return;
    const record = createHistoryRecord({
      left,
      right,
      leftVideoName: media.left.videoName,
      rightVideoName: media.right.videoName,
      result,
      audioSync: sync,
    });
    const next = [record, ...history];
    setHistory(next);
    saveMotionCapHistory(next);
  }

  function exportHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dance-motion-cap-analytics-history.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importHistory(file: File) {
    const text = await file.text();
    const records = JSON.parse(text) as MotionCapHistoryRecord[];
    setHistory(records);
    saveMotionCapHistory(records);
  }

  function synchronizeAudio() {
    const estimate = estimateAudioOffset(media.left.audioWaveform, media.right.audioWaveform);
    const secondsPerBar = media.left.audioWaveform.hopSeconds || Math.max(left?.duration ?? 0, right?.duration ?? 0, 1) / Math.max(1, media.left.audioWaveform.length);
    setSync({
      offsetSeconds: Number((estimate.offsetBars * secondsPerBar).toFixed(3)),
      confidence: estimate.confidence,
      method: "audio-correlation",
    });
  }

  return (
    <div className="app-shell">
      <AppHeader status={statusFor(left, right)} />
      {error && <div className="error-banner">{error}</div>}
      <main>
        <div className="top-grid">
          <DataSourcePanel />
          <MotionCapSettingsPanel left={left} right={right} />
          <ModelsPanel />
        </div>
        <FreeMoCapPipelinePanel onImportCsv={importPipelineCsv} />
        <div className="upload-grid">
          <MotionCapUploadPane
            title="Эталон педагога"
            role="left"
            dataset={left}
            videoUrl={media.left.videoUrl}
            videoName={media.left.videoName}
            onDataFile={(file) => handleDataFile("left", file)}
            onVideoFile={(file) => handleVideoFile("left", file)}
            onAudioFile={(file) => handleAudioFile("left", file)}
          />
          <MotionCapUploadPane
            title="Ученик / повторение"
            role="right"
            dataset={right}
            videoUrl={media.right.videoUrl}
            videoName={media.right.videoName}
            onDataFile={(file) => handleDataFile("right", file)}
            onVideoFile={(file) => handleVideoFile("right", file)}
            onAudioFile={(file) => handleAudioFile("right", file)}
          />
        </div>
        <AudioSyncTimeline
          leftWaveform={media.left.audioWaveform}
          rightWaveform={media.right.audioWaveform}
          sync={sync}
          onSync={synchronizeAudio}
          onManualOffset={(offsetSeconds) => setSync({ offsetSeconds, method: "manual" })}
        />
        <MotionCapViewer left={left} right={right} sync={sync} />
        <ResultPanel result={result} onSave={saveAnalysis} />
        <HistoryPanel
          records={history}
          onImport={importHistory}
          onExport={exportHistory}
          onClear={() => {
            setHistory([]);
            saveMotionCapHistory([]);
          }}
        />
      </main>
    </div>
  );
}
