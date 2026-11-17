export type VideoCodec = 'h263' | 'mpeg4';
export type FitMode = 'letterbox' | 'crop' | 'stretch';
export type ResolutionOption = '128x96' | '176x144' | '240x320' | '320x240' | '352x288';

export interface SourceMediaInfo {
  fileId: string;
  filename: string;
  originalSize: number;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fps: number;
  hasAudio: boolean;
  sourceUrl: string;
}

export interface ConversionSettings {
  presetId: string;
  videoCodec: VideoCodec;
  resolution: ResolutionOption;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: 1 | 2;
  fitMode: FitMode;
  audioBoostDb: number;
  trimStart: number;
  trimEnd: number;
  outputFilename: string;
}

export interface ButtonPhonePreset {
  id: string;
  name: string;
  subtitle: string;
  devices: string;
  videoCodec: VideoCodec;
  resolution: ResolutionOption;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: 1 | 2;
}

export interface ConvertJobStatus {
  jobId: string;
  status: 'queued' | 'converting' | 'completed' | 'error';
  progress: number;
  stageLabel: string;
  outputFilename: string;
  outputSize: number | null;
  appliedCodec: VideoCodec;
  appliedResolution: string;
  appliedFps: number;
  duration: number;
  downloadUrl: string | null;
  previewUrl: string | null;
  error: string | null;
}

export const BUTTON_PHONE_PRESETS: ButtonPhonePreset[] = [
  {
    id: 'universal-qcif',
    name: 'ইউনিভার্সাল বাটন ফোন (সর্বোচ্চ সাপোর্ট)',
    subtitle: '176×144 QCIF · H.263 · 15 fps · AAC Mono',
    devices: 'Nokia 105/130/150, Symphony, Walton, Itel, Samsung Guru',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 32,
    audioSampleRate: 22050,
    audioChannels: 1,
  },
  {
    id: 'large-qvga',
    name: 'বড় স্ক্রিন বাটন ফোন (QVGA ল্যান্ডস্কেপ)',
    subtitle: '320×240 · MPEG-4 SP · 15 fps · AAC Mono',
    devices: 'Nokia 215/216/225/3310, Itel it5026, Walton Olvio 2.4"-2.8"',
    videoCodec: 'mpeg4',
    resolution: '320x240',
    fps: 15,
    videoBitrate: 224,
    audioBitrate: 48,
    audioSampleRate: 44100,
    audioChannels: 1,
  },
  {
    id: 'portrait-qvga',
    name: 'পোর্ট্রেট স্ক্রিন বাটন ফোন',
    subtitle: '240×320 · MPEG-4 SP · 15 fps · AAC Mono',
    devices: '২.৪ থেকে ২.৮ ইঞ্চি ভার্টিক্যাল ডিসপ্লে ও ফ্লিপ ফোন',
    videoCodec: 'mpeg4',
    resolution: '240x320',
    fps: 15,
    videoBitrate: 200,
    audioBitrate: 48,
    audioSampleRate: 44100,
    audioChannels: 1,
  },
  {
    id: 'high-cif',
    name: '৪জি ফিচার ফোন ও কাইওএস (CIF হাই)',
    subtitle: '352×288 CIF · H.263 · 20 fps · AAC Stereo',
    devices: 'Nokia 4G Series, KaiOS, JioPhone ও আধুনিক ফিচার ফোন',
    videoCodec: 'h263',
    resolution: '352x288',
    fps: 20,
    videoBitrate: 320,
    audioBitrate: 64,
    audioSampleRate: 44100,
    audioChannels: 2,
  },
];

export const H263_RESOLUTIONS: ResolutionOption[] = ['128x96', '176x144', '352x288'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
