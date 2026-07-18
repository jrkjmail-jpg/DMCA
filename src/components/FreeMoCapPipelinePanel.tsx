import { useEffect, useState } from "react";
import {
  downloadFreeMoCapCsv,
  getFreeMoCapBackendStatus,
  getFreeMoCapJob,
  uploadFreeMoCapVideo,
  type FreeMoCapBackendStatus,
  type FreeMoCapJob,
} from "../motioncap/backend/freeMoCapBackend";

type Side = "left" | "right";

type Props = {
  onImportCsv: (side: Side, fileName: string, text: string) => void;
};

type SlotState = {
  job?: FreeMoCapJob;
  uploadProgress?: number;
  message: string;
  imported: boolean;
};

type StoredJobsState = Partial<Record<Side, string>>;
type LegacyStoredJobState = {
  jobId: string;
  side: Side;
};

const activeJobsStorageKey = "dmca.activeFreeMoCapJobs";
const legacyActiveJobStorageKey = "dmca.activeFreeMoCapJob";
const sideTitles: Record<Side, string> = {
  left: "Эталон педагога",
  right: "Ученик / повторение",
};

const initialSlot: SlotState = {
  message: "Видео еще не загружено.",
  imported: false,
};

export function FreeMoCapPipelinePanel({ onImportCsv }: Props) {
  const [status, setStatus] = useState<FreeMoCapBackendStatus>();
  const [slots, setSlots] = useState<Record<Side, SlotState>>({
    left: initialSlot,
    right: initialSlot,
  });

  useEffect(() => {
    getFreeMoCapBackendStatus()
      .then(setStatus)
      .catch(() => {
        setSlots((current) => ({
          left: { ...current.left, message: "Backend не запущен. Для обработки видео нужен `npm run api`." },
          right: { ...current.right, message: "Backend не запущен. Для обработки видео нужен `npm run api`." },
        }));
      });
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(activeJobsStorageKey);
    const legacyRaw = window.localStorage.getItem(legacyActiveJobStorageKey);
    let stored: StoredJobsState = {};
    try {
      if (raw) stored = JSON.parse(raw) as StoredJobsState;
      if (!raw && legacyRaw) {
        const legacy = JSON.parse(legacyRaw) as LegacyStoredJobState;
        stored[legacy.side] = legacy.jobId;
      }
      (["left", "right"] as Side[]).forEach((side) => {
        const jobId = stored[side];
        if (!jobId) return;
        getFreeMoCapJob(jobId)
          .then((job) => updateSlot(side, {
            job,
            message: job.status === "complete" ? "CSV готов. Можно импортировать результат." : "Восстановил задачу после перезагрузки.",
          }))
          .catch(() => forgetJob(side));
      });
      if (legacyRaw) window.localStorage.removeItem(legacyActiveJobStorageKey);
    } catch {
      window.localStorage.removeItem(activeJobsStorageKey);
      window.localStorage.removeItem(legacyActiveJobStorageKey);
    }
  }, []);

  useEffect(() => {
    const stored: StoredJobsState = {};
    (["left", "right"] as Side[]).forEach((side) => {
      const jobId = slots[side].job?.id;
      if (jobId && !slots[side].imported) stored[side] = jobId;
    });
    window.localStorage.setItem(activeJobsStorageKey, JSON.stringify(stored));
  }, [slots.left.job?.id, slots.left.imported, slots.right.job?.id, slots.right.imported]);

  useEffect(() => {
    const runningSides = (["left", "right"] as Side[]).filter((side) => {
      const status = slots[side].job?.status;
      return status === "queued" || status === "running";
    });
    if (!runningSides.length) return undefined;

    const timer = window.setInterval(() => {
      runningSides.forEach((side) => refreshJobStatus(side));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [slots.left.job?.id, slots.left.job?.status, slots.right.job?.id, slots.right.job?.status]);

  function updateSlot(side: Side, patch: Partial<SlotState>) {
    setSlots((current) => ({ ...current, [side]: { ...current[side], ...patch } }));
  }

  function forgetJob(side: Side) {
    updateSlot(side, { job: undefined, uploadProgress: undefined, message: "Задача не найдена. Можно загрузить видео заново.", imported: false });
  }

  async function uploadVideo(side: Side, file: File) {
    updateSlot(side, {
      job: undefined,
      uploadProgress: 0,
      message: "Видео загружается на локальный backend...",
      imported: false,
    });
    try {
      const job = await uploadFreeMoCapVideo(file, (progress) => updateSlot(side, { uploadProgress: progress }));
      updateSlot(side, {
        job,
        uploadProgress: 100,
        message: "Видео загружено. FreeMoCap начал обработку.",
      });
    } catch (error) {
      updateSlot(side, {
        uploadProgress: undefined,
        message: error instanceof Error ? error.message : "Не удалось создать job.",
      });
    }
  }

  async function refreshJobStatus(side: Side) {
    const job = slots[side].job;
    if (!job) return;
    try {
      const next = await getFreeMoCapJob(job.id);
      updateSlot(side, {
        job: next,
        message: next.status === "complete" ? "CSV готов. Можно импортировать результат." : "Статус обновлен.",
      });
    } catch (error) {
      updateSlot(side, { message: error instanceof Error ? error.message : "Не удалось обновить статус job." });
    }
  }

  async function importResult(side: Side) {
    const job = slots[side].job;
    if (!job) return;
    try {
      const result = await downloadFreeMoCapCsv(job);
      onImportCsv(side, result.fileName, result.text);
      updateSlot(side, { message: `CSV импортирован в "${sideTitles[side]}".`, imported: true });
    } catch (error) {
      updateSlot(side, { message: error instanceof Error ? error.message : "Не удалось импортировать CSV." });
    }
  }

  return (
    <section className="panel pipeline-panel">
      <div className="panel-title-row">
        <h2>Загрузка видео в FreeMoCap</h2>
        <span className={status?.configured || status?.localFreeMoCapDetected ? "backend-ok" : "backend-warn"}>
          {status?.configured || status?.localFreeMoCapDetected ? "FreeMoCap ready" : "local backend"}
        </span>
      </div>
      <p className="muted">
        Загрузи два видео отдельно: слева эталон педагога, справа повторение ученика. После обработки нажми импорт в нужной карточке.
      </p>
      <div className="pipeline-slot-grid">
        <PipelineSlot
          side="left"
          title="1. Видео эталона"
          state={slots.left}
          onUpload={uploadVideo}
          onRefresh={refreshJobStatus}
          onImport={importResult}
        />
        <PipelineSlot
          side="right"
          title="2. Видео ученика"
          state={slots.right}
          onUpload={uploadVideo}
          onRefresh={refreshJobStatus}
          onImport={importResult}
        />
      </div>
    </section>
  );
}

function PipelineSlot({
  side,
  title,
  state,
  onUpload,
  onRefresh,
  onImport,
}: {
  side: Side;
  title: string;
  state: SlotState;
  onUpload: (side: Side, file: File) => void;
  onRefresh: (side: Side) => void;
  onImport: (side: Side) => void;
}) {
  const isWorking = state.job?.status === "queued" || state.job?.status === "running";
  return (
    <div className="pipeline-slot">
      <h3>{title}</h3>
      <label>
        Видео для FreeMoCap
        <input
          type="file"
          accept="video/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(side, file);
          }}
        />
      </label>
      <div className="pipeline-status">
        <strong>{state.job ? `Job ${state.job.status}` : "Нет активной задачи"}</strong>
        <span>{state.job?.fileName || state.message}</span>
        {state.uploadProgress !== undefined && state.uploadProgress < 100 && (
          <ProgressRow label="Загрузка видео" progress={state.uploadProgress} />
        )}
        {state.job && <ProgressRow label={state.job.phase || "Обработка FreeMoCap"} progress={state.job.progress} />}
        {state.job?.error && <span className="warning">{state.job.error}</span>}
        {isWorking && <button onClick={() => onRefresh(side)}>Проверить статус</button>}
        {state.job?.status === "complete" && !state.imported && (
          <button className="primary-action" onClick={() => onImport(side)}>
            Импортировать в {sideTitles[side]}
          </button>
        )}
        {state.imported && <span className="backend-ok">Импортировано в {sideTitles[side]}</span>}
        <span className="muted">{state.message}</span>
      </div>
    </div>
  );
}

function ProgressRow({ label, progress }: { label: string; progress: number }) {
  const normalized = Math.max(0, Math.min(100, Math.round(progress || 0)));
  return (
    <div className="progress-row" aria-label={`${label}: ${normalized}%`}>
      <div className="progress-meta">
        <span>{label}</span>
        <strong>{normalized}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}
