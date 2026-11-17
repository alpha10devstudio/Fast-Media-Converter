import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
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

interface SourceMediaInfo {
  fileId: string;
  filename: string;
  filePath: string;
  originalSize: number;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fps: number;
  hasAudio: boolean;
  createdAt: number;
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
  outputSize: number | null;
  appliedCodec: 'h263' | 'mpeg4';
  appliedResolution: string;
  appliedFps: number;
  duration: number;
  error: string | null;
  createdAt: number;
}

const sourceRegistry = new Map<string, SourceMediaInfo>();
const jobRegistry = new Map<string, ConvertJob>();

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
  return cleaned.slice(0, 64) || 'button_phone_video';
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

function probeVideo(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string | null;
  fps: number;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(new Error('ভিডিও ফাইলটি বিশ্লেষণ (probe) করা যায়নি।'));
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
          const videoStream = streams.find((s) => s.codec_type === 'video');
          if (!videoStream) {
            reject(new Error('ফাইলটিতে কোনো ভিডিও ট্র্যাক পাওয়া যায়নি।'));
            return;
          }
          const audioStream = streams.find((s) => s.codec_type === 'audio');
          const rawDuration = Number(data.format?.duration || videoStream.duration || 0);

          resolve({
            duration: Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0,
            width: Number(videoStream.width || 0),
            height: Number(videoStream.height || 0),
            videoCodec: videoStream.codec_name || 'unknown',
            audioCodec: audioStream?.codec_name || null,
            fps: parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate),
            hasAudio: Boolean(audioStream),
          });
        } catch {
          reject(new Error('ভিডিও মেটাডেটা পড়তে সমস্যা হয়েছে।'));
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

    proc.on('error', (err) => {
      reject(err);
    });

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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = new Set(['.mp4', '.m4v', '.mov', '.mkv', '.avi', '.webm', '.flv', '.3gp', '.ts']);
    if (allowedExts.has(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র ভিডিও ফাইল (MP4, MKV, MOV, AVI, WebM) আপলোড করা যাবে।'));
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    execFile('ffmpeg', ['-version'], (err) => {
      res.json({
        ok: !err,
        ffmpeg: !err,
      });
    });
  });

  app.post('/api/probe', (req: Request, res: Response) => {
    upload.single('video')(req, res, async (uploadErr) => {
      if (uploadErr) {
        res.status(400).json({ error: uploadErr.message || 'ফাইল আপলোড ব্যর্থ হয়েছে।' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'কোনো ভিডিও ফাইল নির্বাচন করা হয়নি।' });
        return;
      }

      const filePath = req.file.path;
      const fileId = path.basename(filePath, path.extname(filePath));

      try {
        const probe = await probeVideo(filePath);
        const info: SourceMediaInfo = {
          fileId,
          filename: req.file.originalname,
          filePath,
          originalSize: req.file.size,
          duration: probe.duration,
          width: probe.width,
          height: probe.height,
          videoCodec: probe.videoCodec,
          audioCodec: probe.audioCodec,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          createdAt: Date.now(),
        };
        sourceRegistry.set(fileId, info);

        res.json({
          fileId: info.fileId,
          filename: info.filename,
          originalSize: info.originalSize,
          duration: info.duration,
          width: info.width,
          height: info.height,
          videoCodec: info.videoCodec,
          audioCodec: info.audioCodec,
          fps: info.fps,
          hasAudio: info.hasAudio,
          sourceUrl: `/api/source/${info.fileId}`,
        });
      } catch (err) {
        fs.rmSync(filePath, { force: true });
        res.status(422).json({
          error: err instanceof Error ? err.message : 'ভিডিও বিশ্লেষণ করা যায়নি।',
        });
      }
    });
  });

  app.post('/api/sample', async (_req: Request, res: Response) => {
    const fileId = crypto.randomUUID();
    const filePath = path.join(UPLOAD_DIR, `${fileId}.mp4`);
    const filename = 'nokia_test_sample_720p.mp4';

    try {
      await runFfmpegWithProgress(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=duration=6:size=1280x720:rate=30',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=523.25:duration=6',
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
        6,
        () => {}
      );

      const stat = fs.statSync(filePath);
      const probe = await probeVideo(filePath);
      const info: SourceMediaInfo = {
        fileId,
        filename,
        filePath,
        originalSize: stat.size,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec,
        fps: probe.fps,
        hasAudio: probe.hasAudio,
        createdAt: Date.now(),
      };
      sourceRegistry.set(fileId, info);

      res.json({
        fileId: info.fileId,
        filename: info.filename,
        originalSize: info.originalSize,
        duration: info.duration,
        width: info.width,
        height: info.height,
        videoCodec: info.videoCodec,
        audioCodec: info.audioCodec,
        fps: info.fps,
        hasAudio: info.hasAudio,
        sourceUrl: `/api/source/${info.fileId}`,
      });
    } catch (err) {
      fs.rmSync(filePath, { force: true });
      res.status(500).json({
        error: err instanceof Error ? err.message : 'স্যাম্পল ভিডিও তৈরি করা যায়নি।',
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
      res.status(404).json({ error: 'আগে একটি MP4 ভিডিও আপলোড করুন।' });
      return;
    }

    const resolution = ALLOWED_RESOLUTIONS.has(String(body.resolution))
      ? String(body.resolution)
      : '176x144';
    const [widthStr, heightStr] = resolution.split('x');
    const width = Number(widthStr);
    const height = Number(heightStr);

    let videoCodec: 'h263' | 'mpeg4' = body.videoCodec === 'mpeg4' ? 'mpeg4' : 'h263';
    if (videoCodec === 'h263' && !H263_ALLOWED_RESOLUTIONS.has(resolution)) {
      videoCodec = 'mpeg4';
    }

    const fps = ALLOWED_FPS.has(Number(body.fps)) ? Number(body.fps) : 15;
    const videoBitrate = Math.max(64, Math.min(512, Math.round(Number(body.videoBitrate) || 128)));
    const audioBitrate = Math.max(24, Math.min(128, Math.round(Number(body.audioBitrate) || 32)));
    const audioSampleRate = ALLOWED_SAMPLE_RATES.has(Number(body.audioSampleRate))
      ? Number(body.audioSampleRate)
      : 22050;
    const audioChannels = Number(body.audioChannels) === 2 ? 2 : 1;
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
    const outputFilename = `${baseName}.3gp`;
    const outputPath = path.join(OUTPUT_DIR, `${jobId}.3gp`);
    const previewPath = path.join(OUTPUT_DIR, `${jobId}_preview.mp4`);

    const job: ConvertJob = {
      jobId,
      fileId,
      status: 'converting',
      progress: 2,
      stageLabel: '3GP ফরম্যাটে এনকোড হচ্ছে...',
      outputPath,
      previewPath,
      outputFilename,
      outputSize: null,
      appliedCodec: videoCodec,
      appliedResolution: resolution,
      appliedFps: fps,
      duration: targetDuration,
      error: null,
      createdAt: Date.now(),
    };
    jobRegistry.set(jobId, job);

    res.status(202).json({ jobId });

    // Run FFmpeg asynchronously
    (async () => {
      try {
        let vf = '';
        if (fitMode === 'letterbox') {
          vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
        } else if (fitMode === 'crop') {
          vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
        } else {
          vf = `scale=${width}:${height},setsar=1`;
        }

        const trimArgs: string[] = [];
        if (trimStart > 0) {
          trimArgs.push('-ss', trimStart.toFixed(2));
        }
        if (source.duration > 0 && trimEnd < source.duration - 0.05) {
          trimArgs.push('-t', (trimEnd - trimStart).toFixed(2));
        }

        const videoArgs: string[] =
          videoCodec === 'h263'
            ? ['-c:v', 'h263', '-b:v', `${videoBitrate}k`, '-r', String(fps), '-pix_fmt', 'yuv420p']
            : [
                '-c:v',
                'mpeg4',
                '-vtag',
                'mp4v',
                '-b:v',
                `${videoBitrate}k`,
                '-r',
                String(fps),
                '-pix_fmt',
                'yuv420p',
              ];

        const audioArgs: string[] = source.hasAudio
          ? [
              ...(audioBoostDb > 0 ? ['-af', `volume=${audioBoostDb}dB`] : []),
              '-c:a',
              'aac',
              '-ac',
              String(audioChannels),
              '-ar',
              String(audioSampleRate),
              '-b:a',
              `${audioBitrate}k`,
            ]
          : ['-an'];

        const convertArgs = [
          '-y',
          ...trimArgs,
          '-i',
          source.filePath,
          '-vf',
          vf,
          ...videoArgs,
          ...audioArgs,
          '-f',
          '3gp',
          '-progress',
          'pipe:1',
          '-nostats',
          outputPath,
        ];

        await runFfmpegWithProgress(convertArgs, targetDuration, (ratio) => {
          job.progress = Math.max(3, Math.min(88, Math.round(ratio * 88)));
        });

        job.progress = 90;
        job.stageLabel = 'বাটন ফোন প্রিভিউ তৈরি হচ্ছে...';

        // Generate lightweight browser-playable MP4 preview matching exact dimensions, fps & audio
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
          String(fps),
          '-pix_fmt',
          'yuv420p',
          ...(source.hasAudio
            ? [
                ...(audioBoostDb > 0 ? ['-af', `volume=${audioBoostDb}dB`] : []),
                '-c:a',
                'aac',
                '-ac',
                String(audioChannels),
                '-ar',
                String(audioSampleRate),
                '-b:a',
                `${audioBitrate}k`,
              ]
            : ['-an']),
          '-movflags',
          '+faststart',
          '-progress',
          'pipe:1',
          '-nostats',
          previewPath,
        ];

        await runFfmpegWithProgress(previewArgs, targetDuration, (ratio) => {
          job.progress = Math.max(90, Math.min(99, 90 + Math.round(ratio * 9)));
        });

        const stat = fs.statSync(outputPath);
        job.outputSize = stat.size;
        job.progress = 100;
        job.status = 'completed';
        job.stageLabel = 'কনভার্সন সম্পন্ন';
      } catch (err) {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : 'কনভার্সনের সময় অজানা ত্রুটি ঘটেছে।';
        job.stageLabel = 'কনভার্সন ব্যর্থ';
      }
    })();
  });

  app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobRegistry.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'কনভার্সন জব পাওয়া যায়নি।' });
      return;
    }

    res.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      outputFilename: job.outputFilename,
      outputSize: job.outputSize,
      appliedCodec: job.appliedCodec,
      appliedResolution: job.appliedResolution,
      appliedFps: job.appliedFps,
      duration: job.duration,
      downloadUrl: job.status === 'completed' ? `/api/download/${job.jobId}` : null,
      previewUrl: job.status === 'completed' ? `/api/preview/${job.jobId}` : null,
      error: job.error,
    });
  });

  app.get('/api/download/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobRegistry.get(jobId);
    if (!job || job.status !== 'completed' || !fs.existsSync(job.outputPath)) {
      res.status(404).json({ error: '3GP ফাইল পাওয়া যায়নি।' });
      return;
    }

    res.setHeader('Content-Type', 'video/3gpp');
    res.download(job.outputPath, job.outputFilename);
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
    console.log(`3GP Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
