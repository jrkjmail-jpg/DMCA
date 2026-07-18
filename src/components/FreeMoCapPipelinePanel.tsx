import { useEffect, useState } from "react";
import {
  downloadFreeMoCapCsv,
  getFreeMoCapBackendStatus,
  getFreeMoCapJob,
  uploadFreeMoCapVideo,
  type FreeMoCapBackendStatus,
  type FreeMoCapJob,
} from "../motioncap/backend/freeMoCapBackend";

type Props = {
  onImportCsv: (side: "left" | "right", fileName: string, text: string) => void;
};

const activeJobStorageKey = "dmca.activeFreeMoCapJob";

type StoredJobState = {
  jobId: string;
  side: "left" | "right";
};

export function FreeMoCapPipelinePanel({ onImportCsv }: Props) {
  const [side, setSide] = useState<"left" | "right">("left");
  const [status, setStatus] = useState<FreeMoCapBackendStatus>();
  const [job, setJob] = useState<FreeMoCapJob>();
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [message, setMessage] = useState<string>("Backend еще не проверен.");

  useEffect(() => {
    getFreeMoCapBackendStatus()
      .then((next) => {
        setStatus(next);
        setMessage(
          next.configured || next.localFreeMoCapDetected
            ? "Backend готов к запуску локального FreeMoCap pipeline."
            : "Backend работает, но команда FreeMoCap pipeline еще не настроена.",
        );
      })
      .catch(() => setMessage("Backend не запущен. Для обработки видео нужен `npm run api`."));
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(activeJobStorageKey);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredJobState;
      setSide(stored.side);
      getFreeMoCapJob(stored.jobId)
        .then((next) => {
          setJob(next);
          setMessage(next.status === "complete" ? "CSV готов. Можно импортировать результат." : "Восстановил активную FreeMoCap задачу.");
        })
        .catch(() => {
          window.localStorage.removeItem(activeJobStorageKey);
          setMessage("Предыдущая FreeMoCap задача не найдена. Можно загрузить видео заново.");
        });
    } catch {
      window.localStorage.removeItem(activeJobStorageKey);
    }
  }, []);

  useEffect(() => {
    if (!job) return;
    const stored: StoredJobState = { jobId: job.id, side };
    window.localStorage.setItem(activeJobStorageKey, JSON.stringify(stored));
  }, [job?.id, side]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await getFreeMoCapJob(job.id);
        setJob(next);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Не удалось обновить статус job.");
      }
    }, 1600);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function refreshJobStatus() {
    if (!job) return;
    setMessage("Проверяю статус FreeMoCap job...");
    try {
      const next = await getFreeMoCapJob(job.id);
      setJob(next);
      setMessage(next.status === "complete" ? "CSV готов. Можно импортировать результат." : "Статус обновлен.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить статус job.");
    }
  }

  async function uploadVideo(file: File) {
    setUploadProgress(0);
    setJob(undefined);
    setMessage("Видео загружается на локальный backend...");
    try {
      const next = await uploadFreeMoCapVideo(file, setUploadProgress);
      setJob(next);
      setUploadProgress(100);
      setMessage("Видео загружено. FreeMoCap начал обработку.");
    } catch (error) {
      setUploadProgress(undefined);
      setMessage(error instanceof Error ? error.message : "Не удалось создать job.");
    }
  }

  async function importResult() {
    if (!job) return;
    const result = await downloadFreeMoCapCsv(job);
    onImportCsv(side, result.fileName, result.text);
    window.localStorage.removeItem(activeJobStorageKey);
    setMessage("CSV результата импортирован в выбранную сторону анализа.");
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
        Это главный загрузчик для видео. Выбери, куда положить результат, затем загрузи файл танца: backend обработает его через локальный FreeMoCap и вернет MotionCap CSV.
      </p>
      <div className="pipeline-controls">
        <label>
          Куда импортировать результат
          <select value={side} onChange={(event) => setSide(event.target.value as "left" | "right")}>
            <option value="left">Эталон педагога</option>
            <option value="right">Ученик / повторение</option>
          </select>
        </label>
        <label>
          Видео для FreeMoCap
          <input
            type="file"
            accept="video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadVideo(file);
            }}
          />
        </label>
      </div>
      <div className="pipeline-status">
        <strong>{job ? `Job ${job.status}` : "Нет активной задачи"}</strong>
        <span>{job?.fileName || message}</span>
        {uploadProgress !== undefined && uploadProgress < 100 && (
          <ProgressRow label="Загрузка видео" progress={uploadProgress} />
        )}
        {job && <ProgressRow label={job.phase || "Обработка FreeMoCap"} progress={job.progress} />}
        {job?.error && <span className="warning">{job.error}</span>}
        {job && ["queued", "running"].includes(job.status) && (
          <button onClick={refreshJobStatus}>Проверить статус</button>
        )}
        {job?.status === "complete" && (
          <button onClick={importResult}>Импортировать CSV в анализ</button>
        )}
        {job && <span className="muted">{message}</span>}
      </div>
    </section>
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
