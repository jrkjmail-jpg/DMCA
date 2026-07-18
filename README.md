# Dance Motion Cap Analytics

Dance Motion Cap Analytics v0.1.0 is a standalone React/Vite lab for importing and comparing prepared FreeMoCap / MotionCap exports.

## Supported MVP Inputs

- FreeMoCap wide CSV exports such as `mediapipe_body_3d_xyz.csv`
- FreeMoCap tidy CSV exports such as `*_by_frame.csv`
- Application JSON history imports
- Separate video files for side-by-side playback
- Audio/video files for waveform-based sync experiments

## Local Development

```bash
npm install
npm run dev
```

## Optional FreeMoCap Video Backend

The Cloudflare Pages frontend is static and cannot run the Python FreeMoCap pipeline by itself. To process videos, run the optional API backend on a machine where FreeMoCap is installed.

```bash
npm run api
```

The backend accepts video uploads and manages processing jobs. Set `FREEMOCAP_PROCESS_COMMAND` to the command that runs your local FreeMoCap processing workflow:

```bash
FREEMOCAP_PROCESS_COMMAND='your-command --input "{input}" --output "{output}"' npm run api
```

Available placeholders:

- `{input}` uploaded video path
- `{recording}` job recording folder
- `{output}` expected output folder
- `{jobId}` job id

After the command finishes, the backend looks for `mediapipe_body_3d_xyz.csv`, `body_3d_xyz.csv`, or `*_by_frame.csv` and lets the frontend import it into the analysis.

On JRK's local Mac, the backend auto-detects:

```text
/Users/jrk/miniconda3/envs/freemocap-env/bin/python
scripts/process_freemocap_recording.py
```

So `npm run api` can process a single uploaded video by creating a FreeMoCap-style recording folder with `synchronized_videos/`, running the headless pipeline, and importing the generated CSV.

## Validation

```bash
npm test
npm run build
```

## Cloudflare Pages

Recommended settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `20` or newer

The `public/_redirects` file is included so Cloudflare serves the React app for direct route loads.
