import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Moon,
  Music,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { CompatibilityGuide } from './components/CompatibilityGuide';
import { KeypadPhonePreview } from './components/KeypadPhonePreview';
import {
  BUTTON_PHONE_VIDEO_PRESETS,
  createDefaultSettings,
  formatBytes,
  formatDuration,
  H263_RESOLUTIONS,
  MP3_AUDIO_PRESETS,
} from './types/converter';
import type {
  ButtonPhonePreset,
  ConversionMode,
  ConversionSettings,
  ConvertJobStatus,
  FitMode,
  OutputFormat,
  QueueItem,
  ResolutionOption,
  SourceMediaInfo,
  VideoCodec,
} from './types/converter';

const ALL_PRESETS: ButtonPhonePreset[] = [
  ...BUTTON_PHONE_VIDEO_PRESETS,
  ...MP3_AUDIO_PRESETS,
];

function estimateOutputBytes(
  source: SourceMediaInfo,
  settings: ConversionSettings
): number {
  const end = settings.trimEnd > 0 ? settings.trimEnd : source.duration;
  const dur = Math.max(0.5, end - settings.trimStart);
  if (settings.mode === 'mp3' || settings.outputFormat === 'mp3') {
    return Math.round(((settings.audioBitrate * 1000) / 8) * dur * 1.02);
  }
  const totalKbps =
    settings.videoBitrate + (source.hasAudio ? settings.audioBitrate : 0);
  return Math.round(((totalKbps * 1000) / 8) * dur * 1.05);
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaPreviewRef = useRef<HTMLMediaElement | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('studio-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('studio-theme', theme);
  }, [theme]);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globalMode, setGlobalMode] = useState<ConversionMode>('video');
  const [globalPreset, setGlobalPreset] = useState<ButtonPhonePreset>(
    BUTTON_PHONE_VIDEO_PRESETS[0]
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [activeStageTab, setActiveStageTab] = useState<'source' | 'phone'>('source');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedItem = useMemo(
    () => queue.find((q) => q.id === selectedId) || queue[0] || null,
    [queue, selectedId]
  );

  const activeSettings = useMemo(() => {
    if (selectedItem) return selectedItem.settings;
    return createDefaultSettings(globalPreset);
  }, [selectedItem, globalPreset]);

  const activeMode = selectedItem ? selectedItem.settings.mode : globalMode;
  const displayedPresets =
    activeMode === 'mp3' ? MP3_AUDIO_PRESETS : BUTTON_PHONE_VIDEO_PRESETS;

  // Poll all active jobs in a single lightweight interval
  const activeJobIds = useMemo(
    () =>
      queue
        .filter(
          (item) =>
            item.job &&
            (item.job.status === 'queued' || item.job.status === 'converting')
        )
        .map((item) => item.job!.jobId),
    [queue]
  );

  useEffect(() => {
    if (activeJobIds.length === 0) return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/jobs/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobIds: activeJobIds }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: ConvertJobStatus[] };
        const byId = new Map(data.jobs.map((j) => [j.jobId, j]));

        setQueue((prev) =>
          prev.map((item) => {
            if (!item.job) return item;
            const updated = byId.get(item.job.jobId);
            return updated ? { ...item, job: updated } : item;
          })
        );
      } catch {
        // Keep polling on transient network blip
      }
    }, 400);

    return () => window.clearInterval(timer);
  }, [activeJobIds]);

  const appendSourcesToQueue = (sources: SourceMediaInfo[]) => {
    if (sources.length === 0) return;
    const newItems: QueueItem[] = sources.map((src) => {
      const baseName = src.filename.replace(/\.[^/.]+$/, '') || 'media';
      // If source has no video track, automatically use MP3 mode for that item
      const chosenPreset = !src.hasVideo
        ? MP3_AUDIO_PRESETS[1]
        : globalPreset;
      return {
        id: src.fileId,
        source: src,
        settings: createDefaultSettings(chosenPreset, src.duration, baseName),
        job: null,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    setSelectedId((prev) => prev || newItems[0].id);
    setActiveStageTab('source');
  };

  const handleBatchUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setIsUploading(true);
    setErrorBanner(null);

    try {
      const formData = new FormData();
      for (const f of fileArray.slice(0, 20)) {
        formData.append('files', f);
      }
      const res = await fetch('/api/probe-batch', {
        method: 'POST',
        body: formData,
      });
      const payload = (await res.json()) as {
        items?: SourceMediaInfo[];
        errors?: Array<{ filename: string; error: string }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'ফাইল আপলোড করা যায়নি।');
      }
      if (payload.items && payload.items.length > 0) {
        appendSourcesToQueue(payload.items);
      }
      if (payload.errors && payload.errors.length > 0) {
        setErrorBanner(
          `${payload.errors.map((e) => `${e.filename}: ${e.error}`).join(' | ')}`
        );
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'ফাইল আপলোডে সমস্যা হয়েছে।'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateSampleBatch = async () => {
    setIsUploading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/sample-batch', { method: 'POST' });
      const payload = (await res.json()) as {
        items?: SourceMediaInfo[];
        error?: string;
      };
      if (!res.ok || !payload.items) {
        throw new Error(payload.error || 'স্যাম্পল ফাইল তৈরি করা যায়নি।');
      }
      appendSourcesToQueue(payload.items);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'স্যাম্পল ফাইল তৈরি করা যায়নি।'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const updateSelectedSettings = (
    updater: (prev: ConversionSettings, item: QueueItem) => ConversionSettings
  ) => {
    if (!selectedItem) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.id === selectedItem.id
          ? { ...item, settings: updater(item.settings, item) }
          : item
      )
    );
  };

  const applyPresetToTarget = (preset: ButtonPhonePreset, applyToAll: boolean) => {
    setGlobalMode(preset.mode);
    setGlobalPreset(preset);

    setQueue((prev) =>
      prev.map((item) => {
        const shouldUpdate = applyToAll || (selectedItem && item.id === selectedItem.id);
        if (!shouldUpdate) return item;
        // Do not force video format onto audio-only sources
        if (!item.source.hasVideo && preset.mode === 'video') {
          return item;
        }
        return {
          ...item,
          settings: {
            ...item.settings,
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
          },
        };
      })
    );
  };

  const handleModeSwitch = (mode: ConversionMode) => {
    const defaultPreset =
      mode === 'mp3' ? MP3_AUDIO_PRESETS[1] : BUTTON_PHONE_VIDEO_PRESETS[0];
    applyPresetToTarget(defaultPreset, true);
  };

  const handleApplyAllFromSelected = () => {
    if (!selectedItem) return;
    const s = selectedItem.settings;
    setQueue((prev) =>
      prev.map((item) => {
        if (!item.source.hasVideo && s.mode === 'video') {
          return item;
        }
        return {
          ...item,
          settings: {
            ...item.settings,
            mode: s.mode,
            presetId: s.presetId,
            outputFormat: s.outputFormat,
            videoCodec: s.videoCodec,
            resolution: s.resolution,
            fps: s.fps,
            videoBitrate: s.videoBitrate,
            audioBitrate: s.audioBitrate,
            audioSampleRate: s.audioSampleRate,
            audioChannels: s.audioChannels,
            fitMode: s.fitMode,
            audioBoostDb: s.audioBoostDb,
          },
        };
      })
    );
  };

  const startConversionForItems = async (itemsToConvert: QueueItem[]) => {
    if (itemsToConvert.length === 0) return;
    setErrorBanner(null);

    for (const item of itemsToConvert) {
      try {
        const s = item.settings;
        const res = await fetch('/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: item.source.fileId,
            outputFormat: s.outputFormat,
            videoCodec: s.videoCodec,
            resolution: s.resolution,
            fps: s.fps,
            videoBitrate: s.videoBitrate,
            audioBitrate: s.audioBitrate,
            audioSampleRate: s.audioSampleRate,
            audioChannels: s.audioChannels,
            fitMode: s.fitMode,
            audioBoostDb: s.audioBoostDb,
            trimStart: s.trimStart > 0 ? s.trimStart : null,
            trimEnd:
              item.source.duration > 0 && s.trimEnd < item.source.duration - 0.1
                ? s.trimEnd
                : null,
            outputFilename: s.outputFilename,
          }),
        });
        const job = (await res.json()) as ConvertJobStatus & { error?: string };
        if (!res.ok) {
          throw new Error(job.error || 'কনভার্সন শুরু করা যায়নি।');
        }
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, job } : q))
        );
      } catch (err) {
        setErrorBanner(
          err instanceof Error ? err.message : 'কনভার্সন শুরু করতে সমস্যা হয়েছে।'
        );
      }
    }
  };

  const handleConvertAll = () => {
    const eligible = queue.filter(
      (item) =>
        !item.job ||
        item.job.status === 'error' ||
        item.job.status === 'completed'
    );
    void startConversionForItems(eligible);
  };

  const handleDownloadZip = async () => {
    const completedIds = queue
      .filter((item) => item.job?.status === 'completed')
      .map((item) => item.job!.jobId);

    if (completedIds.length === 0) return;
    setIsZipping(true);
    setErrorBanner(null);

    try {
      const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: completedIds }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'ZIP ফাইল তৈরি করা যায়নি।');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'button_phone_converted_files.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'ZIP ডাউনলোড ব্যর্থ হয়েছে।'
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((q) => q.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id || null);
      }
      return next;
    });
  };

  const completedCount = useMemo(
    () => queue.filter((q) => q.job?.status === 'completed').length,
    [queue]
  );

  const isAnyConverting = activeJobIds.length > 0;

  const handleOutputFormatChange = (fmt: OutputFormat) => {
    if (fmt === 'mp3') {
      applyPresetToTarget(MP3_AUDIO_PRESETS[1], false);
      return;
    }
    updateSelectedSettings((prev) => {
      let nextCodec = prev.videoCodec;
      let nextRes = prev.resolution;
      if (fmt === 'avi') {
        nextCodec = 'mjpeg';
        if (nextRes === '128x96') nextRes = '320x240';
      } else if (fmt === 'mp4') {
        nextCodec = 'mpeg4';
      } else if (fmt === '3gp') {
        if (nextCodec === 'mjpeg') nextCodec = 'h263';
        if (nextCodec === 'h263' && !H263_RESOLUTIONS.includes(nextRes)) {
          nextRes = '176x144';
        }
      }
      return {
        ...prev,
        mode: 'video',
        presetId: 'custom',
        outputFormat: fmt,
        videoCodec: nextCodec,
        resolution: nextRes,
      };
    });
  };

  const handleCodecChange = (codec: VideoCodec) => {
    updateSelectedSettings((prev) => {
      let nextRes = prev.resolution;
      if (codec === 'h263' && !H263_RESOLUTIONS.includes(nextRes)) {
        nextRes = '176x144';
      }
      return {
        ...prev,
        presetId: 'custom',
        videoCodec: codec,
        resolution: nextRes,
      };
    });
  };

  const handleResolutionChange = (resolution: ResolutionOption) => {
    updateSelectedSettings((prev) => {
      let nextCodec = prev.videoCodec;
      if (
        prev.outputFormat === '3gp' &&
        nextCodec === 'h263' &&
        !H263_RESOLUTIONS.includes(resolution)
      ) {
        nextCodec = 'mpeg4';
      }
      return {
        ...prev,
        presetId: 'custom',
        resolution,
        videoCodec: nextCodec,
      };
    });
  };

  const captureTime = (edge: 'start' | 'end') => {
    if (!mediaPreviewRef.current || !selectedItem) return;
    const current = Math.round(mediaPreviewRef.current.currentTime * 10) / 10;
    const dur = selectedItem.source.duration;
    updateSelectedSettings((prev) => {
      if (edge === 'start') {
        return {
          ...prev,
          trimStart: Math.min(current, Math.max(0, prev.trimEnd - 0.5)),
        };
      }
      return {
        ...prev,
        trimEnd: Math.max(current, Math.min(dur, prev.trimStart + 0.5)),
      };
    });
  };

  const handleApplyBrandPreset = (presetId: string) => {
    const found = ALL_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    applyPresetToTarget(found, true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Hidden Multi-File Picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.3gp,.ts,.mp3,.m4a,.wav,.ogg,.flac,.aac,.wma"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleBatchUpload(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* 3-Zone Top Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#converter"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            ফোন-মিডিয়া স্টুডিও
          </a>

          {/* Zone 2: Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#converter"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              ব্যাচ কনভার্টার
            </a>
            <a
              href="#presets"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              ফরম্যাট ও প্রিসেট
            </a>
            <a
              href="#guide"
              className="hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              মডেল গাইড
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              একাধিক ফাইল যোগ করুন
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="converter" className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-8">
        {/* Hero Title + Workspace Mode & Theme Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-7">
          <div className="max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight text-balance">
              বাটন ফোন ভিডিও (3GP, AVI, MP4) ও MP3 ব্যাচ কনভার্টার
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
              একসাথে একাধিক ভিডিও বা অডিও সিলেক্ট করে Nokia, Symphony, Walton, Itel ও Samsung বাটন ফোনে চলার উপযোগী ফরম্যাটে অথবা MP3 রিংটোনে কনভার্ট করুন।
            </p>
          </div>

          {/* Workspace Toolbar: Mode Switch + Theme Switch */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => handleModeSwitch('video')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === 'video'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                বাটন ফোন ভিডিও
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('mp3')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeMode === 'mp3'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                MP3 অডিও ও রিংটোন
              </button>
            </div>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label="থিম পরিবর্তন করুন"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  ডার্ক মোড
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  লাইট মোড
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorBanner && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-3 text-sm text-red-800 dark:text-red-200"
          >
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">{errorBanner}</div>
          </div>
        )}

        {/* Main 2-Column Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Stage: Batch Queue + Selected File Inspector */}
          <div className="lg:col-span-7 space-y-6">
            {/* Dropzone (Full when empty, compact bar when queue has items) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleBatchUpload(e.dataTransfer.files);
                }
              }}
              className={`bg-white dark:bg-slate-900 border rounded-xl transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800'
              } ${queue.length === 0 ? 'p-10 text-center' : 'px-5 py-4'}`}
            >
              {queue.length === 0 ? (
                <div>
                  <div className="mx-auto w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 mb-4">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    একসাথে একাধিক ভিডিও বা অডিও ফাইল এখানে দিন
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    একবারে সর্বোচ্চ ২০টি ফাইল ড্র্যাগ বা সিলেক্ট করুন (MP4, MKV, MOV, AVI, WebM, FLV, MP3, M4A, WAV)
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isUploading ? 'ফাইল যাচাই হচ্ছে...' : 'ফাইলসমূহ বাছাই করুন'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateSampleBatch}
                      disabled={isUploading}
                      className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      ২টি টেস্ট ভিডিও দিয়ে দেখুন
                    </button>
                  </div>

                  <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>3GP (H.263 / MPEG-4)</span>
                    <span aria-hidden="true">·</span>
                    <span>AVI (MJPEG + MP3)</span>
                    <span aria-hidden="true">·</span>
                    <span>MP4 QVGA</span>
                    <span aria-hidden="true">·</span>
                    <span>MP3 অডিও ও রিংটোন</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    আরো ফাইল যোগ করতে এখানে ড্র্যাগ করুন অথবা বাটনে ক্লিক করুন
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isUploading ? 'আপলোড হচ্ছে...' : '+ আরো ফাইল যোগ করুন'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Batch Queue Table */}
            {queue.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {/* Batch Header & Bulk Actions */}
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      ব্যাচ কনভার্সন তালিকা
                    </h2>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 tabular-nums">
                      <span>মোট {queue.length}টি ফাইল</span>
                      <span aria-hidden="true">·</span>
                      <span>{completedCount}টি সম্পন্ন</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {completedCount > 0 && (
                      <button
                        type="button"
                        onClick={handleDownloadZip}
                        disabled={isZipping}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        {isZipping ? 'ZIP তৈরি হচ্ছে...' : `সবগুলো ZIP ডাউনলোড (${completedCount})`}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleConvertAll}
                      disabled={isAnyConverting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isAnyConverting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          কনভার্ট চলছে...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          সবগুলো একসাথে কনভার্ট করুন
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setQueue([]);
                        setSelectedId(null);
                      }}
                      disabled={isAnyConverting}
                      className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      তালিকা মুছুন
                    </button>
                  </div>
                </div>

                {/* Queue Rows */}
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {queue.map((item) => {
                    const isSelected = selectedItem?.id === item.id;
                    const job = item.job;
                    const isBusy =
                      job?.status === 'queued' || job?.status === 'converting';

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`px-5 py-3.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {item.source.hasVideo ? (
                                <Film className="w-4 h-4 text-slate-400 shrink-0" />
                              ) : (
                                <Music className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {item.source.filename}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              <span>
                                {item.source.hasVideo
                                  ? `${item.source.width}×${item.source.height}`
                                  : 'Audio'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDuration(item.source.duration)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatBytes(item.source.originalSize)}</span>
                              <span aria-hidden="true">→</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">
                                {item.settings.outputFormat.toUpperCase()}
                                {item.settings.mode === 'video'
                                  ? ` (${item.settings.resolution})`
                                  : ` (${item.settings.audioBitrate}k)`}
                              </span>
                            </div>
                          </div>

                          {/* Row Action Controls */}
                          <div
                            className="flex items-center gap-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {job?.status === 'completed' && job.downloadUrl && (
                              <a
                                href={job.downloadUrl}
                                download={job.outputFilename}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                                {job.outputSize ? formatBytes(job.outputSize) : 'ডাউনলোড'}
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => void startConversionForItems([item])}
                              disabled={isBusy}
                              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                            >
                              {isBusy
                                ? `${job?.progress || 0}%`
                                : job?.status === 'completed'
                                ? 'পুনরায়'
                                : 'কনভার্ট'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={isBusy}
                              aria-label="ফাইল সরান"
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Progress / Error / Success Sub-row */}
                        {job && (
                          <div className="mt-2.5">
                            {job.status === 'error' ? (
                              <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>{job.error || 'কনভার্সন ব্যর্থ'}</span>
                              </div>
                            ) : job.status === 'completed' ? (
                              <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400">
                                <span className="inline-flex items-center gap-1.5 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  {job.outputFilename} প্রস্তুত
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(item.id);
                                    setActiveStageTab('phone');
                                  }}
                                  className="underline hover:no-underline cursor-pointer"
                                >
                                  প্রিভিউ দেখুন
                                </button>
                              </div>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                  <span>{job.stageLabel}</span>
                                  <span className="font-mono tabular-nums">
                                    {job.progress}%
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-700 transition-all duration-200"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected File Preview & Trim Studio */}
            {selectedItem && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveStageTab('source')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeStageTab === 'source'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      মূল ফাইল ও ট্রিম
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStageTab('phone')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeStageTab === 'phone'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {selectedItem.settings.mode === 'mp3'
                        ? 'MP3 অডিও প্রিভিউ'
                        : 'বাটন ফোন স্ক্রিন প্রিভিউ'}
                    </button>
                  </div>

                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                    নির্বাচিত: {selectedItem.source.filename}
                  </span>
                </div>

                <div className="p-5">
                  {activeStageTab === 'source' ? (
                    <div>
                      {selectedItem.source.hasVideo ? (
                        <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center border border-slate-200 dark:border-slate-800">
                          <video
                            ref={(el) => {
                              mediaPreviewRef.current = el;
                            }}
                            key={selectedItem.source.sourceUrl}
                            src={selectedItem.source.sourceUrl}
                            controls
                            playsInline
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="p-5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col gap-3">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <Music className="w-4 h-4 text-blue-600" />
                            <span>{selectedItem.source.filename}</span>
                          </div>
                          <audio
                            ref={(el) => {
                              mediaPreviewRef.current = el;
                            }}
                            key={selectedItem.source.sourceUrl}
                            src={selectedItem.source.sourceUrl}
                            controls
                            className="w-full"
                          />
                        </div>
                      )}

                      {/* Trim & Filename Bar */}
                      {selectedItem.source.duration > 1 && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                              <Scissors className="w-3.5 h-3.5 text-slate-500" />
                              অংশ কাটুন (ট্রিম / রিংটোন ক্লিপ)
                            </span>
                            <div className="flex items-center gap-3">
                              {selectedItem.settings.mode === 'mp3' &&
                                selectedItem.source.duration > 30 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelectedSettings((prev) => ({
                                        ...prev,
                                        trimEnd: Math.min(
                                          selectedItem.source.duration,
                                          prev.trimStart + 30
                                        ),
                                      }))
                                    }
                                    className="text-xs text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    ৩০ সেকেন্ড রিংটোন সেট করুন
                                  </button>
                                )}
                              <button
                                type="button"
                                onClick={() =>
                                  updateSelectedSettings((prev) => ({
                                    ...prev,
                                    trimStart: 0,
                                    trimEnd:
                                      Math.round(selectedItem.source.duration * 10) / 10,
                                  }))
                                }
                                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                সম্পূর্ণ রাখুন
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                <label htmlFor="trim-start">শুরু (সেকেন্ড)</label>
                                <button
                                  type="button"
                                  onClick={() => captureTime('start')}
                                  className="text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  বর্তমান পজিশন নিন
                                </button>
                              </div>
                              <input
                                id="trim-start"
                                type="number"
                                min={0}
                                max={Math.max(0, selectedItem.settings.trimEnd - 0.5)}
                                step={0.5}
                                value={selectedItem.settings.trimStart}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  updateSelectedSettings((prev) => ({
                                    ...prev,
                                    trimStart: Math.min(
                                      val,
                                      Math.max(0, prev.trimEnd - 0.5)
                                    ),
                                  }));
                                }}
                                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                <label htmlFor="trim-end">শেষ (সেকেন্ড)</label>
                                <button
                                  type="button"
                                  onClick={() => captureTime('end')}
                                  className="text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  বর্তমান পজিশন নিন
                                </button>
                              </div>
                              <input
                                id="trim-end"
                                type="number"
                                min={Math.min(
                                  selectedItem.source.duration,
                                  selectedItem.settings.trimStart + 0.5
                                )}
                                max={selectedItem.source.duration}
                                step={0.5}
                                value={selectedItem.settings.trimEnd}
                                onChange={(e) => {
                                  const val = Math.min(
                                    selectedItem.source.duration,
                                    Number(e.target.value) || selectedItem.source.duration
                                  );
                                  updateSelectedSettings((prev) => ({
                                    ...prev,
                                    trimEnd: Math.max(val, prev.trimStart + 0.5),
                                  }));
                                }}
                                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Output Filename & Estimated Size */}
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor="selected-output-name"
                            className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                          >
                            আউটপুট ফাইলের নাম
                          </label>
                          <div className="flex items-center">
                            <input
                              id="selected-output-name"
                              type="text"
                              value={selectedItem.settings.outputFilename}
                              onChange={(e) =>
                                updateSelectedSettings((prev) => ({
                                  ...prev,
                                  outputFilename: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <span className="px-3 py-2 text-sm font-mono bg-slate-100 dark:bg-slate-800 border border-l-0 border-slate-300 dark:border-slate-700 rounded-r-lg text-slate-600 dark:text-slate-300">
                              .{selectedItem.settings.outputFormat}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            আনুমানিক আউটপুট সাইজ
                          </div>
                          <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
                            ~
                            {formatBytes(
                              estimateOutputBytes(
                                selectedItem.source,
                                selectedItem.settings
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <KeypadPhonePreview
                      mode={selectedItem.settings.mode}
                      mediaUrl={
                        selectedItem.job?.status === 'completed' &&
                        selectedItem.job.previewUrl
                          ? selectedItem.job.previewUrl
                          : selectedItem.source.sourceUrl
                      }
                      isConvertedOutput={selectedItem.job?.status === 'completed'}
                      resolution={
                        (selectedItem.job?.appliedResolution as ResolutionOption) ||
                        selectedItem.settings.resolution
                      }
                      fitMode={selectedItem.settings.fitMode}
                      formatLabel={
                        selectedItem.job?.outputFormat ||
                        selectedItem.settings.outputFormat
                      }
                      codecLabel={
                        selectedItem.job?.appliedCodec ||
                        selectedItem.settings.videoCodec
                      }
                      fps={
                        selectedItem.job?.appliedFps ?? selectedItem.settings.fps
                      }
                      audioBitrate={selectedItem.settings.audioBitrate}
                      filename={`${selectedItem.settings.outputFilename}.${selectedItem.settings.outputFormat}`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Inspector Panel: Presets, Multi-Format & Audio Controls */}
          <aside
            id="presets"
            className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {activeMode === 'mp3' ? (
                  <Music className="w-4 h-4 text-slate-500" />
                ) : (
                  <Smartphone className="w-4 h-4 text-slate-500" />
                )}
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {activeMode === 'mp3'
                    ? 'MP3 অডিও প্রিসেট'
                    : 'বাটন ফোন ভিডিও প্রিসেট'}
                </h2>
              </div>

              {queue.length > 1 && selectedItem && (
                <button
                  type="button"
                  onClick={handleApplyAllFromSelected}
                  className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  সব ফাইলে প্রয়োগ করুন
                </button>
              )}
            </div>

            {/* Preset List */}
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {displayedPresets.map((preset) => {
                const isSelected = activeSettings.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      applyPresetToTarget(preset, queue.length <= 1)
                    }
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`text-sm font-semibold ${
                          isSelected
                            ? 'text-blue-800 dark:text-blue-300'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {preset.name}
                      </span>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums uppercase">
                        {preset.mode === 'mp3'
                          ? `${preset.audioBitrate}k`
                          : preset.outputFormat}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-600 dark:text-slate-400">
                      {preset.subtitle}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {preset.devices}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Controls: Output Format, Fit Mode, Speaker Boost & Custom */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
              {/* Quick Output Container Format Picker */}
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  আউটপুট ফরম্যাট
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(
                    [
                      { id: '3gp', label: '3GP' },
                      { id: 'mp4', label: 'MP4' },
                      { id: 'avi', label: 'AVI' },
                      { id: 'mp3', label: 'MP3' },
                    ] as Array<{ id: OutputFormat; label: string }>
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => handleOutputFormatChange(fmt.id)}
                      className={`py-1.5 px-2 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        activeSettings.outputFormat === fmt.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen Fit Mode (Video Mode Only) */}
              {activeSettings.mode === 'video' && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    স্ক্রিন ফিট মোড (কালো বর্ডার বা পূর্ণ স্ক্রিন)
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    {(
                      [
                        { id: 'letterbox', label: 'পূর্ণ ছবি (Fit)' },
                        { id: 'crop', label: 'স্ক্রিন জুড়ে (Crop)' },
                        { id: 'stretch', label: 'টেনে ফিট' },
                      ] as Array<{ id: FitMode; label: string }>
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          if (selectedItem) {
                            updateSelectedSettings((prev) => ({
                              ...prev,
                              fitMode: mode.id,
                            }));
                          }
                        }}
                        className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          activeSettings.fitMode === mode.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Audio Volume Boost */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                    স্পিকার সাউন্ড বুস্ট
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {activeSettings.audioBoostDb === 0
                      ? 'নরমাল'
                      : `+${activeSettings.audioBoostDb} dB`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {[0, 3, 6, 9].map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => {
                        if (selectedItem) {
                          updateSelectedSettings((prev) => ({
                            ...prev,
                            audioBoostDb: db,
                          }));
                        }
                      }}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                        activeSettings.audioBoostDb === db
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {db === 0 ? '০ dB' : `+${db} dB`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced Codec & Bitrate Controls */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white py-1 cursor-pointer"
                >
                  <span>কাস্টম কোডেক, বিটরেট ও অডিও সেটিংস</span>
                  <span className="font-mono text-blue-700 dark:text-blue-400">
                    {showAdvanced ? 'বন্ধ করুন' : 'পরিবর্তন করুন'}
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4 text-xs">
                    {activeSettings.mode === 'video' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="codec-select"
                              className="block text-slate-600 dark:text-slate-400 mb-1"
                            >
                              ভিডিও কোডেক
                            </label>
                            <select
                              id="codec-select"
                              value={activeSettings.videoCodec}
                              onChange={(e) =>
                                handleCodecChange(e.target.value as VideoCodec)
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                            >
                              {activeSettings.outputFormat === '3gp' && (
                                <option value="h263">H.263 (সর্বোচ্চ সাপোর্ট)</option>
                              )}
                              {activeSettings.outputFormat !== 'avi' && (
                                <option value="mpeg4">MPEG-4 SP (বড় স্ক্রিন)</option>
                              )}
                              {activeSettings.outputFormat === 'avi' && (
                                <>
                                  <option value="mjpeg">MJPEG (ক্লাসিক AVI)</option>
                                  <option value="mpeg4">Xvid / MPEG-4 AVI</option>
                                </>
                              )}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="res-select"
                              className="block text-slate-600 dark:text-slate-400 mb-1"
                            >
                              রেজল্যুশন
                            </label>
                            <select
                              id="res-select"
                              value={activeSettings.resolution}
                              onChange={(e) =>
                                handleResolutionChange(
                                  e.target.value as ResolutionOption
                                )
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                            >
                              <option value="128x96">128×96 (SQCIF)</option>
                              <option value="176x144">176×144 (QCIF)</option>
                              <option value="320x240">320×240 (QVGA)</option>
                              <option value="240x320">240×320 (Portrait)</option>
                              <option value="352x288">352×288 (CIF)</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="fps-select"
                              className="block text-slate-600 dark:text-slate-400 mb-1"
                            >
                              ফ্রেম-রেট (FPS)
                            </label>
                            <select
                              id="fps-select"
                              value={activeSettings.fps}
                              onChange={(e) =>
                                updateSelectedSettings((prev) => ({
                                  ...prev,
                                  presetId: 'custom',
                                  fps: Number(e.target.value),
                                }))
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                            >
                              <option value={10}>10 fps (হালকা)</option>
                              <option value={12}>12 fps</option>
                              <option value={15}>15 fps (আদর্শ)</option>
                              <option value={20}>20 fps</option>
                              <option value={24}>24 fps</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="vbit-select"
                              className="block text-slate-600 dark:text-slate-400 mb-1"
                            >
                              ভিডিও বিটরেট
                            </label>
                            <select
                              id="vbit-select"
                              value={activeSettings.videoBitrate}
                              onChange={(e) =>
                                updateSelectedSettings((prev) => ({
                                  ...prev,
                                  presetId: 'custom',
                                  videoBitrate: Number(e.target.value),
                                }))
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                            >
                              <option value={80}>80 kbps</option>
                              <option value={128}>128 kbps</option>
                              <option value={224}>224 kbps</option>
                              <option value={320}>320 kbps</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="ach-select"
                          className="block text-slate-600 dark:text-slate-400 mb-1"
                        >
                          অডিও চ্যানেল
                        </label>
                        <select
                          id="ach-select"
                          value={activeSettings.audioChannels}
                          onChange={(e) =>
                            updateSelectedSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              audioChannels: Number(e.target.value) === 2 ? 2 : 1,
                            }))
                          }
                          className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                        >
                          <option value={1}>Mono (১ চ্যানেল)</option>
                          <option value={2}>Stereo (২ চ্যানেল)</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="abit-select"
                          className="block text-slate-600 dark:text-slate-400 mb-1"
                        >
                          অডিও বিটরেট ও রেট
                        </label>
                        <select
                          id="abit-select"
                          value={`${activeSettings.audioBitrate}-${activeSettings.audioSampleRate}`}
                          onChange={(e) => {
                            const [b, r] = e.target.value.split('-').map(Number);
                            updateSelectedSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              audioBitrate: b,
                              audioSampleRate: r,
                            }));
                          }}
                          className="w-full px-2.5 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-slate-900 dark:text-slate-100"
                        >
                          <option value="32-22050">32 kbps · 22 kHz</option>
                          <option value="48-44100">48 kbps · 44.1 kHz</option>
                          <option value="64-22050">64 kbps · 22 kHz</option>
                          <option value="128-44100">128 kbps · 44.1 kHz</option>
                          <option value="192-44100">192 kbps · 44.1 kHz</option>
                          <option value="320-44100">320 kbps · 44.1 kHz</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Searchable Phone Brand Compatibility Guide */}
        <CompatibilityGuide onApplyPreset={handleApplyBrandPreset} />
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-12">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>ফোন-মিডিয়া স্টুডিও · বাটন ফোন ভিডিও ও MP3 ব্যাচ কনভার্টার</span>
          <span>আপলোড করা ফাইল ৪৫ মিনিট পর স্বয়ংক্রিয়ভাবে মুছে যায়</span>
        </div>
      </footer>
    </div>
  );
}
