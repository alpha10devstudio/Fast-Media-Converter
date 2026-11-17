import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import type { ArchiverError } from 'archiver';
import path from 'path';
import fs from 'fs';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const WORK_DIR = '/tmp/3gp-studio';
const UPLOAD_DIR = path.join(WORK_DIR, 'uploads');
const OUTPUT_DIR = path.join(WORK_DIR, 'outputs');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

type OutputFormat = '3gp' | 'mp4' | 'avi' | 'mp3';
type VideoCodec = 'h263' | 'mpeg4' | 'mjpeg';

interface SourceMediaInfo {
  fileId: string;
  filename: string;
  filePath: string;
  originalSize: number;
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  createdAt: number;
}

interface ConvertJobParams {
  fileId: string;
  outputFormat: OutputFormat;
  videoCodec: VideoCodec;
  resolution: string;
  fps: number;
  videoBitrate: number;
  audioBitrate: number;
  audioSampleRate: number;
  audioChannels: 1 | 2;
  fitMode: 'letterbox' | 'crop' | 'stretch';
  audioBoostDb: number;
  trimStart: number;
  trimEnd: number;
  outputFilename: string;
}

interface ConvertJob {
  jobId: string;
  fileId: string;
  status: 'queued' | 'converting' | 'completed' | 'error';
  progress: number;
  stageLabel: string;
  outputPath: string;
  previewPath: string;
  outputFilename: string;
  outputFormat: OutputFormat;
  outputSize: number | null;
  appliedCodec: string;
  appliedResolution: string | null;
  appliedFps: number | null;
  duration: number;
  error: string | null;
  createdAt: number;
  params: ConvertJobParams;
}

const sourceRegistry = new Map<string, SourceMediaInfo>();
const jobRegistry = new Map<string, ConvertJob>();
const pendingQueue: string[] = [];
let activeWorkers = 0;
const MAX_CONCURRENT_JOBS = 2;

const H263_ALLOWED_RESOLUTIONS = new Set(['128x96', '176x144', '352x288', '704x576']);
const ALLOWED_RESOLUTIONS = new Set(['128x96', '176x144', '240x320', '320x240', '352x288']);
const ALLOWED_FPS = new Set([10, 12, 15, 20, 24]);
const ALLOWED_SAMPLE_RATES = new Set([16000, 22050, 32000, 44100]);

function sanitizeOutputBaseName(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt
    .replace(/[^\w\s\-\u0980-\u09FF.]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return cleaned.slice(0, 64) || 'button_phone_media';
}

function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 30;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && Number.isFinite(num)) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function probeMedia(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(new Error('মিডিয়া ফাইলটি বিশ্লেষণ (probe) করা যায়নি।'));
          return;
        }
        try {
          const data = JSON.parse(stdout) as {
            format?: { duration?: string };
            streams?: Array<{
              codec_type?: string;
              codec_name?: string;
              width?: number;
              height?: number;
              r_frame_rate?: string;
              avg_frame_rate?: string;
              duration?: string;
            }>;
          };
          const streams = data.streams || [];
          const videoStream = streams.find((s) => s.codec_type === 'video' && (s.width || 0) > 0);
          const audioStream = streams.find((s) => s.codec_type === 'audio');

          if (!videoStream && !audioStream) {
            reject(new Error('ফাইলটিতে কোনো ভিডিও বা অডিও ট্র্যাক পাওয়া যায়নি।'));
            return;
          }

          const rawDuration = Number(
            data.format?.duration || videoStream?.duration || audioStream?.duration || 0
          );

          resolve({
            duration: Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0,
            width: Number(videoStream?.width || 0),
            height: Number(videoStream?.height || 0),
            videoCodec: videoStream?.codec_name || null,
            audioCodec: audioStream?.codec_name || null,
            fps: videoStream ? parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate) : 0,
            hasVideo: Boolean(videoStream),
            hasAudio: Boolean(audioStream),
          });
        } catch {
          reject(new Error('মিডিয়া মেটাডেটা পড়তে সমস্যা হয়েছে।'));
        }
      }
    );
  });
}

function runFfmpegWithProgress(
  args: string[],
  targetDurationSec: number,
  onProgress: (ratio: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrTail = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const us = Number(line.slice('out_time_ms='.length));
          if (Number.isFinite(us) && targetDurationSec > 0) {
            const sec = us / 1_000_000;
            const ratio = Math.max(0, Math.min(1, sec / targetDurationSec));
            onProgress(ratio);
          }
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail += chunk.toString('utf8');
      if (stderrTail.length > 4000) {
        stderrTail = stderrTail.slice(-4000);
      }
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const lastLine =
          stderrTail
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(-2)
            .join(' ') || `FFmpeg exited with code ${code}`;
        reject(new Error(lastLine));
      }
    });
  });
}

async function processNextJob(): Promise<void> {
  if (activeWorkers >= MAX_CONCURRENT_JOBS) return;
  const nextJobId = pendingQueue.shift();
  if (!nextJobId) return;

  const job = jobRegistry.get(nextJobId);
  if (!job) {
    void processNextJob();
    return;
  }

  activeWorkers += 1;
  try {
    await executeConversionJob(job);
  } finally {
    activeWorkers -= 1;
    void processNextJob();
  }
}

async function executeConversionJob(job: ConvertJob): Promise<void> {
  const source = sourceRegistry.get(job.fileId);
  if (!source || !fs.existsSync(source.filePath)) {
    job.status = 'error';
    job.error = 'সোর্স ফাইলটি পাওয়া যায়নি।';
    job.stageLabel = 'ব্যর্থ';
    return;
  }

  const p = job.params;
  job.status = 'converting';
  job.progress = 2;

  try {
    const trimArgs: string[] = [];
    if (p.trimStart > 0) {
      trimArgs.push('-ss', p.trimStart.toFixed(2));
    }
    if (source.duration > 0 && p.trimEnd < source.duration - 0.05) {
      trimArgs.push('-t', (p.trimEnd - p.trimStart).toFixed(2));
    }

    if (p.outputFormat === 'mp3') {
      if (!source.hasAudio) {
        throw new Error('এই ফাইলে কোনো অডিও ট্র্যাক নেই, তাই MP3 তৈরি করা যাবে না।');
      }

      job.stageLabel = 'MP3 অডিওতে কনভার্ট হচ্ছে...';
      const mp3Args = [
        '-y',
        ...trimArgs,
        '-i',
        source.filePath,
        '-vn',
        ...(p.audioBoostDb > 0 ? ['-af', `volume=${p.audioBoostDb}dB`] : []),
        '-c:a',
        'libmp3lame',
        '-ac',
        String(p.audioChannels),
        '-ar',
        String(p.audioSampleRate),
        '-b:a',
        `${p.audioBitrate}k`,
        '-f',
        'mp3',
        '-progress',
        'pipe:1',
        '-nostats',
        job.outputPath,
      ];

      await runFfmpegWithProgress(mp3Args, job.duration, (ratio) => {
        job.progress = Math.max(3, Math.min(98, Math.round(ratio * 98)));
      });

      const stat = fs.statSync(job.outputPath);
      job.outputSize = stat.size;
      job.progress = 100;
      job.status = 'completed';
      job.stageLabel = 'MP3 প্রস্তুত';
      return;
    }

    if (!source.hasVideo) {
      throw new Error('অডিও ফাইল থেকে ভিডিও ফরম্যাট বানানো যাবে না — MP3 মোড ব্যবহার করুন।');
    }

    const [widthStr, heightStr] = p.resolution.split('x');
    const width = Number(widthStr);
    const height = Number(heightStr);

    let vf = '';
    if (p.fitMode === 'letterbox') {
      vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    } else if (p.fitMode === 'crop') {
      vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
    } else {
      vf = `scale=${width}:${height},setsar=1`;
    }

    job.stageLabel = `${p.outputFormat.toUpperCase()} ফরম্যাটে এনকোড হচ্ছে...`;

    let videoArgs: string[];
    let audioArgs: string[];
    let formatArgs: string[];

    if (p.outputFormat === 'avi') {
      if (p.videoCodec === 'mjpeg') {
        const mjpegQ = p.videoBitrate >= 320 ? 5 : p.videoBitrate >= 220 ? 7 : 10;
        videoArgs = ['-c:v', 'mjpeg', '-q:v', String(mjpegQ), '-r', String(p.fps), '-pix_fmt', 'yuvj420p'];
      } else {
        videoArgs = ['-c:v', 'mpeg4', '-vtag', 'XVID', '-b:v', `${p.videoBitrate}k`, '-r', String(p.fps), '-pix_fmt', 'yuv420p'];
      }
      audioArgs = source.hasAudio
        ? [
            ...(p.audioBoostDb > 0 ? ['-af', `volume=${p.audioBoostDb}dB`] : []),
            '-c:a',
            'libmp3lame',
            '-ac',
            String(p.audioChannels),
            '-ar',
            String(p.audioSampleRate),
            '-b:a',
            `${p.audioBitrate}k`,
          ]
        : ['-an'];
      formatArgs = ['-f', 'avi'];
    } else if (p.outputFormat === 'mp4') {
      videoArgs = ['-c:v', 'mpeg4', '-vtag', 'mp4v', '-b:v', `${p.videoBitrate}k`, '-r', String(p.fps), '-pix_fmt', 'yuv420p'];
      audioArgs = source.hasAudio
        ? [
            ...(p.audioBoostDb > 0 ? ['-af', `volume=${p.audioBoostDb}dB`] : []),
            '-c:a',
            'aac',
            '-ac',
            String(p.audioChannels),
            '-ar',
            String(p.audioSampleRate),
            '-b:a',
            `${p.audioBitrate}k`,
          ]
        : ['-an'];
      formatArgs = ['-movflags', '+faststart', '-f', 'mp4'];
    } else {
      // 3gp
      videoArgs =
        p.videoCodec === 'h263'
          ? ['-c:v', 'h263', '-b:v', `${p.videoBitrate}k`, '-r', String(p.fps), '-pix_fmt', 'yuv420p']
          : ['-c:v', 'mpeg4', '-vtag', 'mp4v', '-b:v', `${p.videoBitrate}k`, '-r', String(p.fps), '-pix_fmt', 'yuv420p'];
      audioArgs = source.hasAudio
        ? [
            ...(p.audioBoostDb > 0 ? ['-af', `volume=${p.audioBoostDb}dB`] : []),
            '-c:a',
            'aac',
            '-ac',
            String(p.audioChannels),
            '-ar',
            String(p.audioSampleRate),
            '-b:a',
            `${p.audioBitrate}k`,
          ]
        : ['-an'];
      formatArgs = ['-f', '3gp'];
    }

    const convertArgs = [
      '-y',
      ...trimArgs,
      '-i',
      source.filePath,
      '-vf',
      vf,
      ...videoArgs,
      ...audioArgs,
      ...formatArgs,
      '-progress',
      'pipe:1',
      '-nostats',
      job.outputPath,
    ];

    await runFfmpegWithProgress(convertArgs, job.duration, (ratio) => {
      job.progress = Math.max(3, Math.min(86, Math.round(ratio * 86)));
    });

    job.progress = 88;
    job.stageLabel = 'বাটন ফোন প্রিভিউ তৈরি হচ্ছে...';

    const previewArgs = [
      '-y',
      ...trimArgs,
      '-i',
      source.filePath,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-r',
      String(p.fps),
      '-pix_fmt',
      'yuv420p',
      ...(source.hasAudio
        ? [
            ...(p.audioBoostDb > 0 ? ['-af', `volume=${p.audioBoostDb}dB`] : []),
            '-c:a',
            'aac',
            '-ac',
            String(p.audioChannels),
            '-ar',
            String(p.audioSampleRate),
            '-b:a',
            `${p.audioBitrate}k`,
          ]
        : ['-an']),
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      job.previewPath,
    ];

    await runFfmpegWithProgress(previewArgs, job.duration, (ratio) => {
      job.progress = Math.max(88, Math.min(99, 88 + Math.round(ratio * 11)));
    });

    const stat = fs.statSync(job.outputPath);
    job.outputSize = stat.size;
    job.progress = 100;
    job.status = 'completed';
    job.stageLabel = 'সম্পন্ন';
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'কনভার্সনের সময় অজানা ত্রুটি ঘটেছে।';
    job.stageLabel = 'ব্যর্থ';
  }
}

function serializeJob(job: ConvertJob) {
  return {
    jobId: job.jobId,
    fileId: job.fileId,
    status: job.status,
    progress: job.progress,
    stageLabel: job.stageLabel,
    outputFilename: job.outputFilename,
    outputFormat: job.outputFormat,
    outputSize: job.outputSize,
    appliedCodec: job.appliedCodec,
    appliedResolution: job.appliedResolution,
    appliedFps: job.appliedFps,
    duration: job.duration,
    downloadUrl: job.status === 'completed' ? `/api/download/${job.jobId}` : null,
    previewUrl: job.status === 'completed' ? `/api/preview/${job.jobId}` : null,
    error: job.error,
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `${id}${ext}`);
  },
});

const ALLOWED_INPUT_EXTS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
  '.flv',
  '.3gp',
  '.ts',
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.wma',
]);

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
      ALLOWED_INPUT_EXTS.has(ext) ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র ভিডিও বা অডিও ফাইল (MP4, MKV, MOV, AVI, WebM, MP3, M4A, WAV) আপলোড করা যাবে।'));
    }
  },
});

// Cleanup old files every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [id, info] of sourceRegistry.entries()) {
    if (info.createdAt < cutoff) {
      fs.rmSync(info.filePath, { force: true });
      sourceRegistry.delete(id);
    }
  }
  for (const [jobId, job] of jobRegistry.entries()) {
    if (job.createdAt < cutoff) {
      fs.rmSync(job.outputPath, { force: true });
      fs.rmSync(job.previewPath, { force: true });
      jobRegistry.delete(jobId);
    }
  }
}, 10 * 60 * 1000).unref();

async function registerProbedFile(filePath: string, originalName: string, size: number) {
  const fileId = path.basename(filePath, path.extname(filePath));
  const probe = await probeMedia(filePath);
  const info: SourceMediaInfo = {
    fileId,
    filename: originalName,
    filePath,
    originalSize: size,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    videoCodec: probe.videoCodec,
    audioCodec: probe.audioCodec,
    fps: probe.fps,
    hasVideo: probe.hasVideo,
    hasAudio: probe.hasAudio,
    createdAt: Date.now(),
  };
  sourceRegistry.set(fileId, info);
  return {
    fileId: info.fileId,
    filename: info.filename,
    originalSize: info.originalSize,
    duration: info.duration,
    width: info.width,
    height: info.height,
    videoCodec: info.videoCodec,
    audioCodec: info.audioCodec,
    fps: info.fps,
    hasVideo: info.hasVideo,
    hasAudio: info.hasAudio,
    sourceUrl: `/api/source/${info.fileId}`,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    execFile('ffmpeg', ['-version'], (err) => {
      res.json({ ok: !err, ffmpeg: !err });
    });
  });

  app.post('/api/probe', (req: Request, res: Response) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ error: uploadErr.message || 'ফাইল আপলোড ব্যর্থ হয়েছে।' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'কোনো ফাইল নির্বাচন করা হয়নি।' });
        return;
      }
      try {
        const result = await registerProbedFile(req.file.path, req.file.originalname, req.file.size);
        res.json(result);
      } catch (err) {
        fs.rmSync(req.file.path, { force: true });
        res.status(422).json({
          error: err instanceof Error ? err.message : 'ফাইল বিশ্লেষণ করা যায়নি।',
        });
      }
    });
  });

  app.post('/api/probe-batch', (req: Request, res: Response) => {
    upload.array('files', 20)(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ error: uploadErr.message || 'ফাইল আপলোড ব্যর্থ হয়েছে।' });
        return;
      }
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: 'কমপক্ষে একটি ভিডিও বা অডিও ফাইল নির্বাচন করুন।' });
        return;
      }

      const items: Array<Awaited<ReturnType<typeof registerProbedFile>>> = [];
      const errors: Array<{ filename: string; error: string }> = [];

      for (const file of files) {
        try {
          const item = await registerProbedFile(file.path, file.originalname, file.size);
          items.push(item);
        } catch (err) {
          fs.rmSync(file.path, { force: true });
          errors.push({
            filename: file.originalname,
            error: err instanceof Error ? err.message : 'ফাইলটি প্রসেস করা যায়নি।',
          });
        }
      }

      res.json({ items, errors });
    });
  });

  app.post('/api/sample-batch', async (_req: Request, res: Response) => {
    const specs = [
      {
        filename: 'nokia_clip_sample_720p.mp4',
        freq: 523.25,
        duration: 5,
        size: '1280x720',
      },
      {
        filename: 'symphony_song_sample.mp4',
        freq: 659.25,
        duration: 4,
        size: '854x480',
      },
    ];

    const createdPaths: string[] = [];
    try {
      const items: Array<Awaited<ReturnType<typeof registerProbedFile>>> = [];
      for (const spec of specs) {
        const fileId = crypto.randomUUID();
        const filePath = path.join(UPLOAD_DIR, `${fileId}.mp4`);
        createdPaths.push(filePath);

        await runFfmpegWithProgress(
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            `testsrc2=duration=${spec.duration}:size=${spec.size}:rate=30`,
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=${spec.freq}:duration=${spec.duration}`,
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            filePath,
          ],
          spec.duration,
          () => {}
        );

        const stat = fs.statSync(filePath);
        const item = await registerProbedFile(filePath, spec.filename, stat.size);
        items.push(item);
      }
      res.json({ items, errors: [] });
    } catch (err) {
      for (const p of createdPaths) {
        fs.rmSync(p, { force: true });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'স্যাম্পল ব্যাচ তৈরি করা যায়নি।',
      });
    }
  });

  app.get('/api/source/:fileId', (req: Request, res: Response) => {
    const fileId = String(req.params.fileId);
    const info = sourceRegistry.get(fileId);
    if (!info || !fs.existsSync(info.filePath)) {
      res.status(404).json({ error: 'সোর্স ফাইল পাওয়া যায়নি।' });
      return;
    }
    res.sendFile(info.filePath);
  });

  app.post('/api/convert', (req: Request, res: Response) => {
    const body = req.body as {
      fileId?: string;
      outputFormat?: string;
      videoCodec?: string;
      resolution?: string;
      fps?: number;
      videoBitrate?: number;
      audioBitrate?: number;
      audioSampleRate?: number;
      audioChannels?: number;
      fitMode?: 'letterbox' | 'crop' | 'stretch';
      audioBoostDb?: number;
      trimStart?: number | null;
      trimEnd?: number | null;
      outputFilename?: string;
    };

    const fileId = String(body.fileId || '');
    const source = sourceRegistry.get(fileId);
    if (!source || !fs.existsSync(source.filePath)) {
      res.status(404).json({ error: 'সোর্স ফাইল পাওয়া যায়নি।' });
      return;
    }

    const rawFormat = String(body.outputFormat || '3gp');
    const outputFormat: OutputFormat =
      rawFormat === 'mp4' || rawFormat === 'avi' || rawFormat === 'mp3' ? rawFormat : '3gp';

    const resolution = ALLOWED_RESOLUTIONS.has(String(body.resolution))
      ? String(body.resolution)
      : '176x144';

    let videoCodec: VideoCodec =
      body.videoCodec === 'mpeg4'
        ? 'mpeg4'
        : body.videoCodec === 'mjpeg'
        ? 'mjpeg'
        : 'h263';

    if (outputFormat === '3gp' && videoCodec === 'h263' && !H263_ALLOWED_RESOLUTIONS.has(resolution)) {
      videoCodec = 'mpeg4';
    }
    if (outputFormat === 'mp4') {
      videoCodec = 'mpeg4';
    }
    if (outputFormat === 'avi' && videoCodec === 'h263') {
      videoCodec = 'mjpeg';
    }

    const fps = ALLOWED_FPS.has(Number(body.fps)) ? Number(body.fps) : 15;
    const videoBitrate = Math.max(64, Math.min(512, Math.round(Number(body.videoBitrate) || 128)));
    const audioBitrate = Math.max(24, Math.min(320, Math.round(Number(body.audioBitrate) || 64)));
    const audioSampleRate = ALLOWED_SAMPLE_RATES.has(Number(body.audioSampleRate))
      ? Number(body.audioSampleRate)
      : outputFormat === 'mp3'
      ? 44100
      : 22050;
    const audioChannels: 1 | 2 = Number(body.audioChannels) === 2 ? 2 : 1;
    const fitMode =
      body.fitMode === 'crop' || body.fitMode === 'stretch' ? body.fitMode : 'letterbox';
    const audioBoostDb = Math.max(0, Math.min(12, Number(body.audioBoostDb) || 0));

    const trimStart =
      typeof body.trimStart === 'number' && Number.isFinite(body.trimStart) && body.trimStart > 0
        ? Math.min(body.trimStart, Math.max(0, source.duration - 0.5))
        : 0;
    const trimEnd =
      typeof body.trimEnd === 'number' &&
      Number.isFinite(body.trimEnd) &&
      body.trimEnd > trimStart + 0.3
        ? Math.min(body.trimEnd, source.duration)
        : source.duration;

    const targetDuration = Math.max(1, trimEnd - trimStart || source.duration || 1);

    const jobId = crypto.randomUUID();
    const baseName = sanitizeOutputBaseName(body.outputFilename || source.filename);
    const outputFilename = `${baseName}.${outputFormat}`;
    const outputPath = path.join(OUTPUT_DIR, `${jobId}.${outputFormat}`);
    const previewPath =
      outputFormat === 'mp3'
        ? outputPath
        : path.join(OUTPUT_DIR, `${jobId}_preview.mp4`);

    const job: ConvertJob = {
      jobId,
      fileId,
      status: 'queued',
      progress: 0,
      stageLabel: 'কিউয়ে অপেক্ষমাণ...',
      outputPath,
      previewPath,
      outputFilename,
      outputFormat,
      outputSize: null,
      appliedCodec: outputFormat === 'mp3' ? 'mp3' : videoCodec,
      appliedResolution: outputFormat === 'mp3' ? null : resolution,
      appliedFps: outputFormat === 'mp3' ? null : fps,
      duration: targetDuration,
      error: null,
      createdAt: Date.now(),
      params: {
        fileId,
        outputFormat,
        videoCodec,
        resolution,
        fps,
        videoBitrate,
        audioBitrate,
        audioSampleRate,
        audioChannels,
        fitMode,
        audioBoostDb,
        trimStart,
        trimEnd,
        outputFilename,
      },
    };

    jobRegistry.set(jobId, job);
    pendingQueue.push(jobId);
    void processNextJob();

    res.status(202).json(serializeJob(job));
  });

  app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobRegistry.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'কনভার্সন জব পাওয়া যায়নি।' });
      return;
    }
    res.json(serializeJob(job));
  });

  app.post('/api/jobs/status', (req: Request, res: Response) => {
    const body = req.body as { jobIds?: string[] };
    const ids = Array.isArray(body.jobIds) ? body.jobIds : [];
    const jobs = ids
      .map((id) => jobRegistry.get(String(id)))
      .filter((job): job is ConvertJob => Boolean(job))
      .map(serializeJob);
    res.json({ jobs });
  });

  app.get('/api/download/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobRegistry.get(jobId);
    if (!job || job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: 'কনভার্টেড ফাইল পাওয়া যায়নি।' });
      return;
    }

    const mimeByFormat: Record<OutputFormat, string> = {
      '3gp': 'video/3gpp',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mp3: 'audio/mpeg',
    };
    res.setHeader('Content-Type', mimeByFormat[job.outputFormat]);
    res.download(job.outputPath, job.outputFilename);
  });

  app.post('/api/download-zip', (req: Request, res: Response) => {
    const body = req.body as { jobIds?: string[] };
    const jobIds = Array.isArray(body.jobIds) ? body.jobIds : [];
    const validJobs = jobIds
      .map((id) => jobRegistry.get(String(id)))
      .filter(
        (job): job is ConvertJob =>
          Boolean(job && job.status === 'completed' && fs.existsSync(job.outputPath))
      );

    if (validJobs.length === 0) {
      res.status(400).json({ error: 'ডাউনলোডের জন্য কোনো সম্পন্ন ফাইল নেই।' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="button_phone_converted_files.zip"'
    );

    const archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on('error', (err: ArchiverError) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    });
    archive.pipe(res);

    const usedNames = new Map<string, number>();
    for (const job of validJobs) {
      const count = usedNames.get(job.outputFilename) || 0;
      usedNames.set(job.outputFilename, count + 1);
      let entryName = job.outputFilename;
      if (count > 0) {
        const ext = path.extname(job.outputFilename);
        const base = path.basename(job.outputFilename, ext);
        entryName = `${base}_${count + 1}${ext}`;
      }
      archive.file(job.outputPath, { name: entryName });
    }

    void archive.finalize();
  });

  app.get('/api/preview/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobRegistry.get(jobId);
    if (!job || job.status !== 'completed' || !fs.existsSync(job.previewPath)) {
      res.status(404).json({ error: 'প্রিভিউ পাওয়া যায়নি।' });
      return;
    }
    res.sendFile(job.previewPath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Button Phone Media Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
