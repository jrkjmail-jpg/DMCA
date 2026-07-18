export type FreeMoCapBackendStatus = {
  ok: boolean;
  configured: boolean;
  dataRoot: string;
};

export type FreeMoCapJob = {
  id: string;
  status: "queued" | "running" | "complete" | "failed" | "needs_configuration";
  fileName: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  csvFileName?: string;
  resultUrl?: string;
};

const apiBase = import.meta.env.VITE_MOTIONCAP_API_URL || "http://127.0.0.1:8787";

export async function getFreeMoCapBackendStatus(): Promise<FreeMoCapBackendStatus> {
  const response = await fetch(`${apiBase}/api/health`);
  if (!response.ok) throw new Error("FreeMoCap backend is not available.");
  return response.json();
}

export async function createFreeMoCapJob(video: File): Promise<FreeMoCapJob> {
  const form = new FormData();
  form.append("video", video);
  const response = await fetch(`${apiBase}/api/freemocap/jobs`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error("Не удалось отправить видео в FreeMoCap backend.");
  return response.json();
}

export async function getFreeMoCapJob(jobId: string): Promise<FreeMoCapJob> {
  const response = await fetch(`${apiBase}/api/freemocap/jobs/${jobId}`);
  if (!response.ok) throw new Error("FreeMoCap job не найден.");
  return response.json();
}

export async function downloadFreeMoCapCsv(job: FreeMoCapJob): Promise<{ fileName: string; text: string }> {
  if (!job.resultUrl) throw new Error("CSV еще не готов.");
  const response = await fetch(`${apiBase}${job.resultUrl}`);
  if (!response.ok) throw new Error("Не удалось скачать CSV результата.");
  return {
    fileName: job.csvFileName || `${job.id}_freemocap_body_3d_xyz.csv`,
    text: await response.text(),
  };
}
