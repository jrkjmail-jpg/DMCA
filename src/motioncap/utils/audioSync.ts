export type AudioWaveform = number[] & {
  duration?: number;
  hopSeconds?: number;
  syncFeatures?: number[];
};

export async function buildAudioWaveform(file: File, bars = 96): Promise<AudioWaveform> {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const data = mixAudioChannels(buffer);
  const sampleRate = buffer.sampleRate;
  const bucketSize = Math.max(1, Math.floor(data.length / bars));
  const waveform = Array.from({ length: bars }, (_, index) => {
    const start = index * bucketSize;
    const end = Math.min(data.length, start + bucketSize);
    return rms(data, start, end);
  }) as AudioWaveform;
  const hopSeconds = 0.025;
  const hopSize = Math.max(1, Math.floor(sampleRate * hopSeconds));
  const windowSize = Math.max(hopSize, Math.floor(sampleRate * 0.12));
  const envelope: number[] = [];
  const flux: number[] = [];
  let previousEnergy = 0;
  for (let start = 0; start < data.length - windowSize; start += hopSize) {
    const energy = rms(data, start, start + windowSize);
    envelope.push(energy);
    flux.push(Math.max(0, energy - previousEnergy));
    previousEnergy = energy;
  }
  await context.close();
  normalizeInPlace(waveform);
  normalizeInPlace(envelope);
  normalizeInPlace(flux);
  const smoothEnvelope = normalizeSeries(smoothSeries(envelope, 13));
  const contrast = normalizeSeries(envelope.map((value, index) => Math.max(0, value - (smoothEnvelope[index] || 0) * 0.72)));
  const clippedFlux = normalizeSeries(clipOutliers(flux, 0.88));
  waveform.duration = buffer.duration;
  waveform.hopSeconds = hopSeconds;
  waveform.syncFeatures = buildSyncFeatures(envelope, clippedFlux, smoothEnvelope, contrast);
  return waveform;
}

export function estimateAudioOffset(left: AudioWaveform, right: AudioWaveform): { offsetBars: number; confidence: number } {
  const leftFeatures = zNormalize(left.syncFeatures?.length ? left.syncFeatures : left);
  const rightFeatures = zNormalize(right.syncFeatures?.length ? right.syncFeatures : right);
  const hop = left.hopSeconds || 1;
  const maxShift = Math.min(
    Math.round(35 / hop),
    Math.floor(Math.min(leftFeatures.length, rightFeatures.length) * 0.6),
  );
  let bestShift = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondBestScore = Number.NEGATIVE_INFINITY;
  for (let shift = -maxShift; shift <= maxShift; shift += 1) {
    let score = 0;
    let count = 0;
    for (let index = 0; index < leftFeatures.length; index += 1) {
      const rightIndex = index + shift;
      if (rightIndex < 0 || rightIndex >= rightFeatures.length) continue;
      score += leftFeatures[index] * rightFeatures[rightIndex];
      count += 1;
    }
    if (count < 20) continue;
    const overlapPenalty = Math.min(1, count / Math.min(leftFeatures.length, rightFeatures.length)) ** 1.35;
    const normalized = count ? (score / count) * overlapPenalty : 0;
    if (normalized > bestScore) {
      secondBestScore = bestScore;
      bestScore = normalized;
      bestShift = shift;
    } else if (normalized > secondBestScore) {
      secondBestScore = normalized;
    }
  }
  const peakSeparation = Math.max(0, bestScore - secondBestScore);
  return {
    offsetBars: bestShift,
    confidence: Math.max(0, Math.min(1, ((bestScore + 1) / 2) * 0.78 + Math.min(0.22, peakSeparation * 1.2))),
  };
}

function mixAudioChannels(buffer: AudioBuffer) {
  const length = buffer.length;
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  if (channels === 1) return buffer.getChannelData(0);
  const mixed = new Float32Array(length);
  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let index = 0; index < length; index += 1) mixed[index] += channel[index] / channels;
  }
  return mixed;
}

function rms(samples: Float32Array, start: number, end: number) {
  let sum = 0;
  let count = 0;
  for (let index = start; index < end && index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function normalizeInPlace(values: number[]) {
  const max = Math.max(...values, 0.000001);
  for (let index = 0; index < values.length; index += 1) values[index] /= max;
}

function normalizeSeries(values: number[]) {
  const copy = [...values];
  normalizeInPlace(copy);
  return copy;
}

function smoothSeries(values: number[], radius = 5) {
  return values.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (!Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
    return count ? sum / count : 0;
  });
}

function clipOutliers(values: number[], percentile = 0.9) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const limit = sorted.length ? sorted[Math.floor((sorted.length - 1) * percentile)] || 0.000001 : 0.000001;
  return values.map((value) => Math.min(value || 0, limit));
}

function buildSyncFeatures(envelope: number[], flux: number[], smoothEnvelope = envelope, contrast = envelope) {
  return envelope.map((value, index) => {
    const previous = envelope[index - 1] ?? value;
    const next = envelope[index + 1] ?? value;
    const localContrast = Math.max(0, value - (previous + next) / 2);
    return (smoothEnvelope[index] || value) * 0.56 + value * 0.22 + (contrast[index] || localContrast) * 0.14 + (flux[index] || 0) * 0.08;
  });
}

function zNormalize(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  const deviation = Math.sqrt(variance) || 1;
  return values.map((value) => (value - mean) / deviation);
}
