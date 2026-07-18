import { useEffect, useState } from "react";
import {
  createFreeMoCapJob,
  downloadFreeMoCapCsv,
  getFreeMoCapBackendStatus,
  getFreeMoCapJob,
  type FreeMoCapBackendStatus,
  type FreeMoCapJob,
} from "../motioncap/backend/freeMoCapBackend";

type Props = {
  onImportCsv: (side: "left" | "right", fileName: string, text: string) => void;
};

export function FreeMoCapPipelinePanel({ onImportCsv }: Props) {
  const [side, setSide] = useState<"left" | "right">("left");
  const [status, setStatus] = useState<FreeMoCapBackendStatus>();
  const [job, setJob] = useState<FreeMoCapJob>();
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
    if (!job || !["queued", "running"].includes(job.status)) return undefined;
    const timer = window.setInterval(async () => {
      const next = await getFreeMoCapJob(job.id);
      setJob(next);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [job]);

  async function uploadVideo(file: File) {
    setMessage("Видео отправляется в FreeMoCap backend...");
    try {
      const next = await createFreeMoCapJob(file);
      setJob(next);
      setMessage("Job создан. Ждем обработки.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать job.");
    }
  }

  async function importResult() {
    if (!job) return;
    const result = await downloadFreeMoCapCsv(job);
    onImportCsv(side, result.fileName, result.text);
    setMessage("CSV результата импортирован в выбранную сторону анализа.");
  }

  return (
    <section className="panel pipeline-panel">
      <div className="panel-title-row">
        <h2>Обработка видео через FreeMoCap</h2>
        <span className={status?.configured || status?.localFreeMoCapDetected ? "backend-ok" : "backend-warn"}>
          {status?.configured || status?.localFreeMoCapDetected ? "FreeMoCap ready" : "local backend"}
        </span>
      </div>
      <p className="muted">
        Загрузи видео сюда, если хочешь получить MotionCap CSV автоматически. Это работает через локальный/server backend, не внутри Cloudflare Pages.
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
        {job?.error && <span className="warning">{job.error}</span>}
        {job?.status === "complete" && (
          <button onClick={importResult}>Импортировать CSV в анализ</button>
        )}
      </div>
    </section>
  );
}
