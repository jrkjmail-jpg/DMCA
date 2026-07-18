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
