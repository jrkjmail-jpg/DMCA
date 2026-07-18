import cors from "cors";
import express from "express";
import multer from "multer";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const app = express();
const port = Number(process.env.PORT || 8787);
const dataRoot = resolve(process.env.DMCA_DATA_ROOT || "motioncap_jobs");
const localFreeMoCapPython = "/Users/jrk/miniconda3/envs/freemocap-env/bin/python";
const localFreeMoCapScript = resolve("scripts/process_freemocap_recording.py");
const upload = multer({ dest: join(dataRoot, "incoming") });
const jobs = new Map();

app.use(cors());
app.use(express.json());

function jobPath(jobId, ...parts) {
  return join(dataRoot, jobId, ...parts);
}

async function listFilesRecursive(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFilesRecursive(path)));
    else files.push(path);
  }
  return files;
}

async function findMotionCapCsv(outputDir) {
  if (!existsSync(outputDir)) return undefined;
  const files = await listFilesRecursive(outputDir);
  return (
    files.find((file) => basename(file).toLowerCase() === "mediapipe_body_3d_xyz.csv") ||
    files.find((file) => /body_3d_xyz\.csv$/i.test(file)) ||
    files.find((file) => /_by_frame\.csv$/i.test(file))
  );
}

async function readJobFromDisk(jobId) {
  const path = jobPath(jobId, "job.json");
  let job;
  if (existsSync(path)) {
    job = JSON.parse(await readFile(path, "utf8"));
  } else {
    const recordingDir = jobPath(jobId, "recording");
    if (!existsSync(recordingDir)) return undefined;
    const synchronizedVideosDir = join(recordingDir, "synchronized_videos");
    const videoFiles = existsSync(synchronizedVideosDir) ? await readdir(synchronizedVideosDir) : [];
    job = {
      id: jobId,
      status: "running",
      fileName: videoFiles[0] || "video",
      progress: 12,
      phase: "Восстанавливаю задачу",
      recordingDir,
      outputDir: join(recordingDir, "output_data"),
      createdAt: new Date().toISOString(),
    };
  }
  job.recordingDir ||= jobPath(job.id, "recording");
  job.outputDir ||= join(job.recordingDir, "output_data");
  jobs.set(job.id, job);
  return job;
}

async function persistJob(job) {
  await mkdir(jobPath(job.id), { recursive: true });
  await writeFile(jobPath(job.id, "job.json"), JSON.stringify(job, null, 2));
}

async function refreshJobProgress(job) {
  const csvPath = await findMotionCapCsv(job.outputDir);
  if (csvPath) {
    job.status = "complete";
    job.progress = 100;
    job.phase = "CSV готов";
    job.csvPath = csvPath;
    job.csvFileName = basename(csvPath);
    job.finishedAt ||= new Date().toISOString();
    await persistJob(job);
    return job;
  }

  const files = await listFilesRecursive(job.recordingDir);
  const hasAnnotatedVideo = files.some((file) => file.includes("/annotated_videos/") && file.endsWith(".mp4"));
  const hasRawData = files.some((file) => file.includes("/raw_data/"));
  const hasRecordingTable = files.some((file) => /recording_by_(frame|trajectory)\.(csv|json)$/i.test(file));
  const hasCommand = existsSync(jobPath(job.id, "command.txt"));

  if (job.status === "queued") {
    job.progress = Math.max(job.progress || 0, 8);
    job.phase = "Видео принято";
  } else if (hasRecordingTable) {
    job.progress = Math.max(job.progress || 0, 88);
    job.phase = "Собираю таблицы движения";
  } else if (hasRawData) {
    job.progress = Math.max(job.progress || 0, 78);
    job.phase = "Считаю 3D-точки";
  } else if (hasAnnotatedVideo) {
    job.progress = Math.max(job.progress || 0, 64);
    job.phase = "MediaPipe нашел тело на видео";
  } else if (hasCommand) {
    job.progress = Math.max(job.progress || 0, 24);
    job.phase = "FreeMoCap запущен";
  }

  await persistJob(job);
  return job;
}

function commandForJob(job) {
  const template = process.env.FREEMOCAP_PROCESS_COMMAND;
  const defaultTemplate =
    existsSync(localFreeMoCapPython) && existsSync(localFreeMoCapScript)
      ? `"${localFreeMoCapPython}" "${localFreeMoCapScript}" --recording "{recording}"`
      : undefined;
  const commandTemplate = template || defaultTemplate;
  if (!commandTemplate) return undefined;
  return commandTemplate
    .replaceAll("{input}", job.inputPath)
    .replaceAll("{recording}", job.recordingDir)
    .replaceAll("{output}", job.outputDir)
    .replaceAll("{jobId}", job.id);
}

async function runJob(job) {
  job.status = "running";
  job.progress = Math.max(job.progress || 0, 12);
  job.phase = "Запускаю FreeMoCap";
  job.startedAt = new Date().toISOString();
  await persistJob(job);
  const command = commandForJob(job);
  if (!command) {
    job.status = "needs_configuration";
    job.progress = 0;
    job.phase = "Нужна настройка backend";
    job.error =
      "Backend готов принять видео, но FREEMOCAP_PROCESS_COMMAND не настроен. Укажи команду запуска FreeMoCap pipeline на сервере.";
    await persistJob(job);
    return;
  }

  await writeFile(jobPath(job.id, "command.txt"), command);
  await refreshJobProgress(job);
  const child = spawn(command, { shell: true, cwd: job.recordingDir });
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    log += chunk.toString();
  });

  child.on("close", async (code) => {
    job.finishedAt = new Date().toISOString();
    await writeFile(jobPath(job.id, "pipeline.log"), log);
    if (code !== 0) {
      job.status = "failed";
      job.progress = job.progress || 0;
      job.phase = "FreeMoCap завершился с ошибкой";
      job.error = `FreeMoCap command exited with code ${code}.`;
      await persistJob(job);
      return;
    }
    const csvPath = await findMotionCapCsv(job.outputDir);
    if (!csvPath) {
      job.status = "failed";
      job.phase = "CSV не найден";
      job.error = "Pipeline завершился, но CSV с 3D-скелетом не найден.";
      await persistJob(job);
      return;
    }
    job.status = "complete";
    job.progress = 100;
    job.phase = "CSV готов";
    job.csvPath = csvPath;
    job.csvFileName = basename(csvPath);
    await persistJob(job);
  });
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    configured: Boolean(process.env.FREEMOCAP_PROCESS_COMMAND),
    localFreeMoCapDetected: existsSync(localFreeMoCapPython) && existsSync(localFreeMoCapScript),
    dataRoot,
  });
});

app.post("/api/freemocap/jobs", upload.single("video"), async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "video file is required" });
    return;
  }

  const id = crypto.randomUUID();
  const recordingDir = jobPath(id, "recording");
  const synchronizedVideosDir = join(recordingDir, "synchronized_videos");
  const outputDir = join(recordingDir, "output_data");
  await mkdir(recordingDir, { recursive: true });
  await mkdir(synchronizedVideosDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  const inputPath = join(synchronizedVideosDir, request.file.originalname);
  await writeFile(inputPath, await readFile(request.file.path));
  await rm(request.file.path, { force: true });

  const job = {
    id,
    status: "queued",
    fileName: request.file.originalname,
    progress: 8,
    phase: "Видео принято",
    inputPath,
    recordingDir,
    outputDir,
    createdAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  await persistJob(job);
  runJob(job).catch((error) => {
    job.status = "failed";
    job.phase = "Ошибка запуска FreeMoCap";
    job.error = error instanceof Error ? error.message : String(error);
    persistJob(job).catch(() => {});
  });

  response.json(safeJob(job));
});

app.get("/api/freemocap/jobs/:id", async (request, response) => {
  const job = jobs.get(request.params.id) || (await readJobFromDisk(request.params.id));
  if (!job) {
    response.status(404).json({ error: "job not found" });
    return;
  }
  await refreshJobProgress(job);
  response.json(safeJob(job));
});

app.get("/api/freemocap/jobs/:id/result.csv", async (request, response) => {
  const job = jobs.get(request.params.id) || (await readJobFromDisk(request.params.id));
  if (job) await refreshJobProgress(job);
  if (!job?.csvPath) {
    response.status(404).json({ error: "result csv not ready" });
    return;
  }
  response.setHeader("content-type", "text/csv; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${job.csvFileName}"`);
  createReadStream(job.csvPath).pipe(response);
});

function safeJob(job) {
  return {
    id: job.id,
    status: job.status,
    fileName: job.fileName,
    progress: job.progress ?? 0,
    phase: job.phase,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    csvFileName: job.csvFileName,
    resultUrl: job.csvPath ? `/api/freemocap/jobs/${job.id}/result.csv` : undefined,
  };
}

app.listen(port, async () => {
  await mkdir(join(dataRoot, "incoming"), { recursive: true });
  console.log(`Dance Motion Cap Analytics API listening on http://127.0.0.1:${port}`);
});
