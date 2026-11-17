export type ConversionMode = 'video' | 'mp3';
export type OutputFormat = '3gp' | 'mp4' | 'avi' | 'mp3';
export type VideoCodec = 'h263' | 'mpeg4' | 'mjpeg';
export type FitMode = 'letterbox' | 'crop' | 'stretch';
export type ResolutionOption = '128x96' | '176x144' | '240x320' | '320x240' | '352x288';

export interface SourceMediaInfo {
  fileId: string;
  filename: string;
  originalSize: number;
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  sourceUrl: string;
}

export interface ConversionSettings {
  mode: ConversionMode;
  presetId: string;
  outputFormat: OutputFormat;
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
  mode: ConversionMode;
  name: string;
  subtitle: string;
  devices: string;
  outputFormat: OutputFormat;
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
  fileId: string;
  status: 'queued' | 'converting' | 'completed' | 'error';
  progress: number;
  stageLabel: string;
  outputFilename: string;
  outputFormat: OutputFormat;
  outputSize: number | null;
  appliedCodec: string;
  appliedResolution: string | null;
  appliedFps: number | null;
  duration: number;
  downloadUrl: string | null;
  previewUrl: string | null;
  error: string | null;
}

export interface QueueItem {
  id: string;
  source: SourceMediaInfo;
  settings: ConversionSettings;
  job: ConvertJobStatus | null;
}

export interface PhoneBrandEntry {
  id: string;
  brand: string;
  models: string;
  presetId: string;
  formatSummary: string;
  codecSummary: string;
  screenSummary: string;
  audioSummary: string;
}

export const BUTTON_PHONE_VIDEO_PRESETS: ButtonPhonePreset[] = [
  {
    id: 'universal-3gp-qcif',
    mode: 'video',
    name: 'ইউনিভার্সাল বাটন ফোন (3GP · সর্বোচ্চ সাপোর্ট)',
    subtitle: '3GP · 176×144 · H.263 · 15 fps · AAC Mono',
    devices: 'Nokia 105/130/150, Symphony, Walton, Itel, Samsung Guru',
    outputFormat: '3gp',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 32,
    audioSampleRate: 22050,
    audioChannels: 1,
  },
  {
    id: 'large-3gp-qvga',
    mode: 'video',
    name: 'বড় স্ক্রিন বাটন ফোন (3GP QVGA)',
    subtitle: '3GP · 320×240 · MPEG-4 SP · 15 fps · AAC Mono',
    devices: 'Nokia 215/216/225/3310, Itel it5026, Walton Olvio 2.4"-2.8"',
    outputFormat: '3gp',
    videoCodec: 'mpeg4',
    resolution: '320x240',
    fps: 15,
    videoBitrate: 224,
    audioBitrate: 48,
    audioSampleRate: 44100,
    audioChannels: 1,
  },
  {
    id: 'mp4-qvga',
    mode: 'video',
    name: 'নতুন বাটন ও 4G ফিচার ফোন (MP4 QVGA)',
    subtitle: 'MP4 · 320×240 · MPEG-4 SP · 20 fps · AAC Stereo',
    devices: 'Nokia 4G Series, KaiOS, JioPhone, আধুনিক Itel/Symphony',
    outputFormat: 'mp4',
    videoCodec: 'mpeg4',
    resolution: '320x240',
    fps: 20,
    videoBitrate: 280,
    audioBitrate: 64,
    audioSampleRate: 44100,
    audioChannels: 2,
  },
  {
    id: 'avi-mjpeg',
    mode: 'video',
    name: 'ক্লাসিক AVI বাটন ফোন (Motion JPEG)',
    subtitle: 'AVI · 320×240 · MJPEG · 15 fps · MP3 Mono',
    devices: 'পুরোনো চাইনিজ, Symphony, Walton ও যেসব ফোনে শুধু AVI চলে',
    outputFormat: 'avi',
    videoCodec: 'mjpeg',
    resolution: '320x240',
    fps: 15,
    videoBitrate: 320,
    audioBitrate: 64,
    audioSampleRate: 22050,
    audioChannels: 1,
  },
  {
    id: 'portrait-3gp-qvga',
    mode: 'video',
    name: 'পোর্ট্রেট ও ফ্লিপ স্ক্রিন (3GP)',
    subtitle: '3GP · 240×320 · MPEG-4 SP · 15 fps · AAC Mono',
    devices: '২.৪–২.৮ ইঞ্চি ভার্টিক্যাল ডিসপ্লে ও ফ্লিপ বাটন ফোন',
    outputFormat: '3gp',
    videoCodec: 'mpeg4',
    resolution: '240x320',
    fps: 15,
    videoBitrate: 200,
    audioBitrate: 48,
    audioSampleRate: 44100,
    audioChannels: 1,
  },
];

export const MP3_AUDIO_PRESETS: ButtonPhonePreset[] = [
  {
    id: 'mp3-ringtone',
    mode: 'mp3',
    name: 'বাটন ফোন রিংটোন ও হালকা ফাইল (MP3 64k)',
    subtitle: 'MP3 · 64 kbps · 22.05 kHz · Mono',
    devices: 'কম মেমোরি ও ছোট স্পিকারের জন্য আদর্শ রিংটোন',
    outputFormat: 'mp3',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 64,
    audioSampleRate: 22050,
    audioChannels: 1,
  },
  {
    id: 'mp3-standard',
    mode: 'mp3',
    name: 'স্ট্যান্ডার্ড MP3 গান ও ওয়াজ (128 kbps)',
    subtitle: 'MP3 · 128 kbps · 44.1 kHz · Stereo',
    devices: 'সকল Nokia, Symphony, Walton, Itel ও মেমোরি কার্ড প্লেয়ার',
    outputFormat: 'mp3',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 128,
    audioSampleRate: 44100,
    audioChannels: 2,
  },
  {
    id: 'mp3-high',
    mode: 'mp3',
    name: 'হাই-কোয়ালিটি MP3 (192 kbps)',
    subtitle: 'MP3 · 192 kbps · 44.1 kHz · Stereo',
    devices: 'ইয়ারফোন ও স্পিকারে পরিষ্কার স্টুডিও অডিওর জন্য',
    outputFormat: 'mp3',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 192,
    audioSampleRate: 44100,
    audioChannels: 2,
  },
  {
    id: 'mp3-ultra',
    mode: 'mp3',
    name: 'সর্বোচ্চ স্টুডিও MP3 (320 kbps)',
    subtitle: 'MP3 · 320 kbps · 44.1 kHz · Stereo',
    devices: 'মিউজিক সিস্টেম ও আধুনিক ফিচার ফোনের জন্য',
    outputFormat: 'mp3',
    videoCodec: 'h263',
    resolution: '176x144',
    fps: 15,
    videoBitrate: 128,
    audioBitrate: 320,
    audioSampleRate: 44100,
    audioChannels: 2,
  },
];

export const PHONE_BRAND_DIRECTORY: PhoneBrandEntry[] = [
  {
    id: 'nokia-basic',
    brand: 'Nokia Basic',
    models: '105, 106, 110, 130, 150',
    presetId: 'universal-3gp-qcif',
    formatSummary: '3GP',
    codecSummary: 'H.263 · 15 fps',
    screenSummary: '176×144',
    audioSummary: 'AAC Mono 22kHz',
  },
  {
    id: 'nokia-large',
    brand: 'Nokia Big Screen',
    models: '215, 216, 225, 3310, 5310',
    presetId: 'large-3gp-qvga',
    formatSummary: '3GP',
    codecSummary: 'MPEG-4 SP · 15 fps',
    screenSummary: '320×240',
    audioSummary: 'AAC Mono 44kHz',
  },
  {
    id: 'symphony-classic',
    brand: 'Symphony / Walton (AVI)',
    models: 'BL/L/D সিরিজ, Walton Olvio',
    presetId: 'avi-mjpeg',
    formatSummary: 'AVI',
    codecSummary: 'MJPEG · 15 fps',
    screenSummary: '320×240',
    audioSummary: 'MP3 Mono 22kHz',
  },
  {
    id: 'itel-tecno',
    brand: 'Itel / Tecno / Lava',
    models: 'it2163, it5026, it5617, T301',
    presetId: 'universal-3gp-qcif',
    formatSummary: '3GP',
    codecSummary: 'H.263 · 15 fps',
    screenSummary: '176×144',
    audioSummary: 'AAC Mono 22kHz',
  },
  {
    id: 'samsung-guru',
    brand: 'Samsung Guru / Metro',
    models: 'Guru Music 2, Metro 313/350',
    presetId: 'universal-3gp-qcif',
    formatSummary: '3GP',
    codecSummary: 'H.263 · 15 fps',
    screenSummary: '176×144',
    audioSummary: 'AAC Mono 22kHz',
  },
  {
    id: 'nokia-4g',
    brand: '4G Feature / KaiOS',
    models: 'Nokia 110 4G, 2660 Flip, JioPhone',
    presetId: 'mp4-qvga',
    formatSummary: 'MP4',
    codecSummary: 'MPEG-4 SP · 20 fps',
    screenSummary: '320×240',
    audioSummary: 'AAC Stereo 44kHz',
  },
  {
    id: 'mp3-all',
    brand: 'সকল বাটন ফোন (অডিও/রিংটোন)',
    models: 'যেকোনো কিপ্যাড ফোন ও স্পিকার',
    presetId: 'mp3-standard',
    formatSummary: 'MP3',
    codecSummary: 'LAME MP3',
    screenSummary: 'অডিও মাত্র',
    audioSummary: '128 kbps · 44.1kHz',
  },
];

export const H263_RESOLUTIONS: ResolutionOption[] = ['128x96', '176x144', '352x288'];

export function createDefaultSettings(
  preset: ButtonPhonePreset = BUTTON_PHONE_VIDEO_PRESETS[0],
  duration = 0,
  baseName = 'button_phone_media'
): ConversionSettings {
  return {
    mode: preset.mode,
    presetId: preset.id,
    outputFormat: preset.outputFormat,
    videoCodec: preset.videoCodec,
    resolution: preset.resolution,
    fps: preset.fps,
    videoBitrate: preset.videoBitrate,
    audioBitrate: preset.audioBitrate,
    audioSampleRate: preset.audioSampleRate,
    audioChannels: preset.audioChannels,
    fitMode: 'letterbox',
    audioBoostDb: 3,
    trimStart: 0,
    trimEnd: duration > 0 ? Math.round(duration * 10) / 10 : 0,
    outputFilename: baseName,
  };
}

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
