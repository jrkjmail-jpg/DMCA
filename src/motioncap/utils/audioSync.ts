export type AudioWaveform = number[];

export async function buildAudioWaveform(file: File, bars = 96): Promise<AudioWaveform> {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const data = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(data.length / bars));
  const waveform = Array.from({ length: bars }, (_, index) => {
    const start = index * bucketSize;
    const end = Math.min(data.length, start + bucketSize);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += Math.abs(data[cursor]);
    return sum / Math.max(1, end - start);
  });
  await context.close();
  const peak = Math.max(...waveform, 0.000001);
  return waveform.map((value) => value / peak);
}

export function estimateAudioOffset(left: AudioWaveform, right: AudioWaveform): { offsetBars: number; confidence: number } {
  const maxShift = Math.floor(Math.min(left.length, right.length) / 3);
  let bestShift = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let shift = -maxShift; shift <= maxShift; shift += 1) {
    let score = 0;
    let count = 0;
    for (let index = 0; index < left.length; index += 1) {
      const rightIndex = index + shift;
      if (rightIndex < 0 || rightIndex >= right.length) continue;
      score += left[index] * right[rightIndex];
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestShift = shift;
    }
  }
  return { offsetBars: bestShift, confidence: Math.max(0, Math.min(1, bestScore)) };
}
