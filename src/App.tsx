import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  RotateCcw,
  Scissors,
  Smartphone,
  Upload,
  Volume2,
} from 'lucide-react';
import { CompatibilityGuide } from './components/CompatibilityGuide';
import { KeypadPhonePreview } from './components/KeypadPhonePreview';
import {
  BUTTON_PHONE_PRESETS,
  formatBytes,
  formatDuration,
  H263_RESOLUTIONS,
} from './types/converter';
import type {
  ButtonPhonePreset,
  ConversionSettings,
  ConvertJobStatus,
  FitMode,
  ResolutionOption,
  SourceMediaInfo,
  VideoCodec,
} from './types/converter';

const DEFAULT_PRESET = BUTTON_PHONE_PRESETS[0];

function buildInitialSettings(preset: ButtonPhonePreset, duration = 0, baseName = 'button_phone_video'): ConversionSettings {
  return {
    presetId: preset.id,
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
    trimEnd: duration,
    outputFilename: baseName,
  };
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

  const [source, setSource] = useState<SourceMediaInfo | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(() =>
    buildInitialSettings(DEFAULT_PRESET)
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [activeStageTab, setActiveStageTab] = useState<'source' | 'phone'>('source');
  const [activeJob, setActiveJob] = useState<ConvertJobStatus | null>(null);
  const [completedJobs, setCompletedJobs] = useState<ConvertJobStatus[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const applyUploadedSource = (data: SourceMediaInfo) => {
    setSource(data);
    setUploadError(null);
    setActiveJob(null);
    setActiveStageTab('source');
    const cleanBase = data.filename.replace(/\.[^/.]+$/, '');
    setSettings((prev) => ({
      ...prev,
      trimStart: 0,
      trimEnd: Math.round(data.duration * 10) / 10,
      outputFilename: cleanBase || 'button_phone_video',
    }));
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    stopPolling();

    try {
      const formData = new FormData();
      formData.append('video', file);
      const res = await fetch('/api/probe', {
        method: 'POST',
        body: formData,
      });
      const payload = (await res.json()) as SourceMediaInfo & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'ভিডিও আপলোড করা যায়নি।');
      }
      applyUploadedSource(payload);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'ভিডিও আপলোডে সমস্যা হয়েছে।');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateSample = async () => {
    setIsUploading(true);
    setUploadError(null);
    stopPolling();

    try {
      const res = await fetch('/api/sample', { method: 'POST' });
      const payload = (await res.json()) as SourceMediaInfo & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'স্যাম্পল ভিডিও তৈরি করা যায়নি।');
      }
      applyUploadedSource(payload);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'স্যাম্পল ভিডিও তৈরি করা যায়নি।');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectPreset = (preset: ButtonPhonePreset) => {
    setSettings((prev) => ({
      ...prev,
      presetId: preset.id,
      videoCodec: preset.videoCodec,
      resolution: preset.resolution,
      fps: preset.fps,
      videoBitrate: preset.videoBitrate,
      audioBitrate: preset.audioBitrate,
      audioSampleRate: preset.audioSampleRate,
      audioChannels: preset.audioChannels,
    }));
  };

  const handleCodecChange = (codec: VideoCodec) => {
    setSettings((prev) => {
      let nextResolution = prev.resolution;
      if (codec === 'h263' && !H263_RESOLUTIONS.includes(prev.resolution)) {
        nextResolution = '176x144';
      }
      return {
        ...prev,
        presetId: 'custom',
        videoCodec: codec,
        resolution: nextResolution,
      };
    });
  };

  const handleResolutionChange = (resolution: ResolutionOption) => {
    setSettings((prev) => {
      const nextCodec =
        prev.videoCodec === 'h263' && !H263_RESOLUTIONS.includes(resolution)
          ? 'mpeg4'
          : prev.videoCodec;
      return {
        ...prev,
        presetId: 'custom',
        resolution,
        videoCodec: nextCodec,
      };
    });
  };

  const handleStartConvert = async () => {
    if (!source) return;
    stopPolling();
    setUploadError(null);

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: source.fileId,
          videoCodec: settings.videoCodec,
          resolution: settings.resolution,
          fps: settings.fps,
          videoBitrate: settings.videoBitrate,
          audioBitrate: settings.audioBitrate,
          audioSampleRate: settings.audioSampleRate,
          audioChannels: settings.audioChannels,
          fitMode: settings.fitMode,
          audioBoostDb: settings.audioBoostDb,
          trimStart: settings.trimStart > 0 ? settings.trimStart : null,
          trimEnd:
            source.duration > 0 && settings.trimEnd < source.duration - 0.1
              ? settings.trimEnd
              : null,
          outputFilename: settings.outputFilename,
        }),
      });

      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || 'কনভার্সন শুরু করা যায়নি।');
      }

      const jobId = data.jobId;
      setActiveJob({
        jobId,
        status: 'converting',
        progress: 2,
        stageLabel: '3GP ফরম্যাটে এনকোড হচ্ছে...',
        outputFilename: `${settings.outputFilename || 'video'}.3gp`,
        outputSize: null,
        appliedCodec: settings.videoCodec,
        appliedResolution: settings.resolution,
        appliedFps: settings.fps,
        duration: source.duration,
        downloadUrl: null,
        previewUrl: null,
        error: null,
      });

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/jobs/${jobId}`);
          if (!pollRes.ok) return;
          const jobData = (await pollRes.json()) as ConvertJobStatus;
          setActiveJob(jobData);

          if (jobData.status === 'completed') {
            stopPolling();
            setCompletedJobs((prev) => [jobData, ...prev.slice(0, 7)]);
            setActiveStageTab('phone');
          } else if (jobData.status === 'error') {
            stopPolling();
          }
        } catch {
          // Retry on next interval tick
        }
      }, 350);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'কনভার্সন শুরু করতে সমস্যা হয়েছে।');
    }
  };

  const effectiveDuration = useMemo(() => {
    if (!source) return 0;
    const end = settings.trimEnd > 0 ? settings.trimEnd : source.duration;
    return Math.max(0.5, end - settings.trimStart);
  }, [source, settings.trimStart, settings.trimEnd]);

  const estimatedBytes = useMemo(() => {
    if (!source || effectiveDuration <= 0) return 0;
    const totalKbps =
      settings.videoBitrate + (source.hasAudio ? settings.audioBitrate : 0);
    return Math.round(((totalKbps * 1000) / 8) * effectiveDuration * 1.04);
  }, [source, effectiveDuration, settings.videoBitrate, settings.audioBitrate]);

  const isConverting = activeJob?.status === 'converting' || activeJob?.status === 'queued';

  const captureTime = (edge: 'start' | 'end') => {
    if (!sourceVideoRef.current || !source) return;
    const current = Math.round(sourceVideoRef.current.currentTime * 10) / 10;
    if (edge === 'start') {
      const clamped = Math.min(current, Math.max(0, settings.trimEnd - 0.5));
      setSettings((prev) => ({ ...prev, trimStart: clamped }));
    } else {
      const clamped = Math.max(current, Math.min(source.duration, settings.trimStart + 0.5));
      setSettings((prev) => ({ ...prev, trimEnd: clamped }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Hidden global file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mkv,.mov,.avi,.webm,.flv,.3gp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleFileUpload(file);
          }
          e.target.value = '';
        }}
      />

      {/* 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#converter"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            3GP স্টুডিও
          </a>

          {/* Zone 2: Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#converter"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              কনভার্টার
            </a>
            <a
              href="#presets"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              ফোন প্রিসেট
            </a>
            <a
              href="#guide"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              কম্প্যাটিবিলিটি গাইড
            </a>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              নতুন ভিডিও যোগ করুন
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="converter" className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-8">
        {/* Compact Header */}
        <div className="max-w-3xl mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
            MP4 থেকে বাটন ফোনের উপযোগী 3GP ভিডিও কনভার্টার
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Nokia, Symphony, Walton, Itel এবং Samsung বাটন ফোনে যেন ভিডিও আটকে না যায় বা ফরম্যাট এরর না দেখায়, সেজন্য সঠিক H.263 / MPEG-4 কোডেক, ১৫ fps এবং Mono অডিওতে আসল .3gp ফাইল তৈরি করুন।
          </p>
        </div>

        {/* Error Alert */}
        {uploadError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-sm text-red-800"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">{uploadError}</div>
          </div>
        )}

        {/* Two-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Stage: Upload, Video Stage, Convert & Result */}
          <div className="lg:col-span-7 space-y-6">
            {!source ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFileUpload(file);
                }}
                className={`bg-white border rounded-xl p-10 text-center transition-colors ${
                  isDragging ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200'
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 mb-4">
                  <Upload className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  আপনার MP4 ভিডিও ফাইল এখানে দিন
                </h2>
                <p className="mt-1.5 text-sm text-slate-600 max-w-md mx-auto">
                  ড্র্যাগ করে ছাড়ুন অথবা ব্রাউজ করুন (MP4, MKV, MOV, AVI, WebM · সর্বোচ্চ ৫০০ MB)
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isUploading ? 'ভিডিও বিশ্লেষণ হচ্ছে...' : 'ফাইল বাছাই করুন'}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateSample}
                    disabled={isUploading}
                    className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    টেস্ট স্যাম্পল MP4 দিয়ে দেখুন
                  </button>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>সার্ভার-সাইড FFmpeg ইঞ্জিন</span>
                  <span aria-hidden="true">·</span>
                  <span>H.263 ও MPEG-4 SP কোডেক</span>
                  <span aria-hidden="true">·</span>
                  <span>স্পিকার সাউন্ড বুস্ট সহ</span>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Source Info Strip */}
                <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-sm font-semibold text-slate-900 truncate max-w-[260px] sm:max-w-[360px]">
                        {source.filename}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span className="font-mono">
                        {source.width}×{source.height}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{formatDuration(source.duration)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {source.videoCodec.toUpperCase()}
                        {source.audioCodec ? ` / ${source.audioCodec.toUpperCase()}` : ' / No Audio'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{formatBytes(source.originalSize)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isConverting}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    ভিডিও বদলান
                  </button>
                </div>

                {/* Stage Switch Tabs */}
                <div className="px-5 pt-4 flex items-center justify-between gap-4">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveStageTab('source')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeStageTab === 'source'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      মূল ভিডিও ও ট্রিম
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveStageTab('phone')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeStageTab === 'phone'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      বাটন ফোন স্ক্রিন প্রিভিউ
                    </button>
                  </div>

                  {activeJob?.status === 'completed' && (
                    <span className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 whitespace-nowrap">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      প্রস্তুত
                    </span>
                  )}
                </div>

                {/* Stage Body */}
                <div className="p-5">
                  {activeStageTab === 'source' ? (
                    <div>
                      <div className="bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center border border-slate-200">
                        <video
                          ref={sourceVideoRef}
                          src={source.sourceUrl}
                          controls
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      </div>

                      {/* Trim Controls */}
                      {source.duration > 1 && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <div className="flex items-center justify-between mb-2.5">
                            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                              <Scissors className="w-3.5 h-3.5 text-slate-500" />
                              ভিডিও অংশ কাটুন (ঐচ্ছিক ট্রিম)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setSettings((prev) => ({
                                  ...prev,
                                  trimStart: 0,
                                  trimEnd: Math.round(source.duration * 10) / 10,
                                }))
                              }
                              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              সম্পূর্ণ রাখুন
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                <label htmlFor="trim-start">শুরু (সেকেন্ড)</label>
                                <button
                                  type="button"
                                  onClick={() => captureTime('start')}
                                  className="text-blue-700 hover:underline cursor-pointer"
                                >
                                  বর্তমান পজিশন নিন
                                </button>
                              </div>
                              <input
                                id="trim-start"
                                type="number"
                                min={0}
                                max={Math.max(0, settings.trimEnd - 0.5)}
                                step={0.5}
                                value={settings.trimStart}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setSettings((prev) => ({
                                    ...prev,
                                    trimStart: Math.min(val, Math.max(0, prev.trimEnd - 0.5)),
                                  }));
                                }}
                                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                <label htmlFor="trim-end">শেষ (সেকেন্ড)</label>
                                <button
                                  type="button"
                                  onClick={() => captureTime('end')}
                                  className="text-blue-700 hover:underline cursor-pointer"
                                >
                                  বর্তমান পজিশন নিন
                                </button>
                              </div>
                              <input
                                id="trim-end"
                                type="number"
                                min={Math.min(source.duration, settings.trimStart + 0.5)}
                                max={source.duration}
                                step={0.5}
                                value={settings.trimEnd}
                                onChange={(e) => {
                                  const val = Math.min(
                                    source.duration,
                                    Number(e.target.value) || source.duration
                                  );
                                  setSettings((prev) => ({
                                    ...prev,
                                    trimEnd: Math.max(val, prev.trimStart + 0.5),
                                  }));
                                }}
                                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <KeypadPhonePreview
                      videoUrl={
                        activeJob?.status === 'completed' && activeJob.previewUrl
                          ? activeJob.previewUrl
                          : source.sourceUrl
                      }
                      isConvertedOutput={activeJob?.status === 'completed'}
                      resolution={
                        activeJob?.status === 'completed'
                          ? (activeJob.appliedResolution as ResolutionOption)
                          : settings.resolution
                      }
                      fitMode={settings.fitMode}
                      codecLabel={
                        activeJob?.status === 'completed'
                          ? activeJob.appliedCodec
                          : settings.videoCodec
                      }
                      fps={
                        activeJob?.status === 'completed'
                          ? activeJob.appliedFps
                          : settings.fps
                      }
                    />
                  )}
                </div>

                {/* Output filename + Convert CTA bar */}
                <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor="output-name"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      আউটপুট ফাইলের নাম (.3gp)
                    </label>
                    <div className="flex items-center">
                      <input
                        id="output-name"
                        type="text"
                        value={settings.outputFilename}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, outputFilename: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        placeholder="button_phone_video"
                      />
                      <span className="px-3 py-2 text-sm font-mono bg-slate-100 border border-l-0 border-slate-300 rounded-r-lg text-slate-600">
                        .3gp
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-slate-500">আনুমানিক সাইজ</div>
                      <div className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                        ~{formatBytes(estimatedBytes)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartConvert}
                      disabled={isConverting}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isConverting ? 'কনভার্ট হচ্ছে...' : '3GP-তে কনভার্ট করুন'}
                    </button>
                  </div>
                </div>

                {/* Active Conversion Progress */}
                {activeJob && activeJob.status !== 'completed' && (
                  <div className="px-5 py-4 border-t border-slate-200 bg-white">
                    {activeJob.status === 'error' ? (
                      <div className="flex items-start gap-2.5 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>{activeJob.error || 'কনভার্সন ব্যর্থ হয়েছে।'}</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
                          <span>{activeJob.stageLabel}</span>
                          <span className="font-mono tabular-nums">{activeJob.progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-700 transition-all duration-200"
                            style={{ width: `${activeJob.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Completed Result Download Banner */}
                {activeJob?.status === 'completed' && activeJob.downloadUrl && (
                  <div className="px-5 py-4 border-t border-emerald-200 bg-emerald-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>বাটন ফোনের জন্য .3gp ভিডিও তৈরি হয়েছে</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-emerald-800 font-mono tabular-nums">
                        <span>{activeJob.outputFilename}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeJob.appliedResolution}</span>
                        <span aria-hidden="true">·</span>
                        <span>{activeJob.appliedCodec.toUpperCase()}</span>
                        {activeJob.outputSize !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatBytes(activeJob.outputSize)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={activeJob.downloadUrl}
                        download={activeJob.outputFilename}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        3GP ডাউনলোড করুন
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Session History List */}
            {completedJobs.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    তৈরি করা 3GP ফাইলসমূহ
                  </h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    মোট {completedJobs.length}টি
                  </span>
                </div>
                <div className="divide-y divide-slate-200">
                  {completedJobs.map((item) => (
                    <div
                      key={item.jobId}
                      className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {item.outputFilename}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums flex items-center gap-2">
                          <span>{item.appliedResolution}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.appliedCodec.toUpperCase()}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.outputSize ? formatBytes(item.outputSize) : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveJob(item);
                            setActiveStageTab('phone');
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                        >
                          প্রিভিউ
                        </button>
                        {item.downloadUrl && (
                          <a
                            href={item.downloadUrl}
                            download={item.outputFilename}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0"
                          >
                            ডাউনলোড
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Button Phone Presets & Technical Controls */}
          <aside id="presets" className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  বাটন ফোন প্রিসেট বাছাই করুন
                </h2>
              </div>
            </div>

            {/* Preset Buttons */}
            <div className="divide-y divide-slate-200">
              {BUTTON_PHONE_PRESETS.map((preset) => {
                const isSelected = settings.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`text-sm font-semibold ${
                          isSelected ? 'text-blue-800' : 'text-slate-900'
                        }`}
                      >
                        {preset.name}
                      </span>
                      <span className="text-xs font-mono text-slate-500 shrink-0 tabular-nums">
                        {preset.resolution}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-600">
                      {preset.subtitle}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{preset.devices}</div>
                  </button>
                );
              })}
            </div>

            {/* Fit Mode & Speaker Boost */}
            <div className="px-5 py-4 border-t border-slate-200 space-y-5">
              {/* Screen Fit Mode */}
              <div>
                <div className="text-xs font-semibold text-slate-800 mb-2">
                  স্ক্রিন ফিট মোড (ভিডিও কাটা বা কালো বর্ডার)
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
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
                      onClick={() => setSettings((prev) => ({ ...prev, fitMode: mode.id }))}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        settings.fitMode === mode.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Volume Boost */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                    স্পিকার সাউন্ড বুস্ট
                  </span>
                  <span className="text-xs font-mono text-slate-500 tabular-nums">
                    {settings.audioBoostDb === 0 ? 'নরমাল' : `+${settings.audioBoostDb} dB`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
                  {[0, 3, 6, 9].map((db) => (
                    <button
                      key={db}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, audioBoostDb: db }))}
                      className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                        settings.audioBoostDb === db
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {db === 0 ? '০ dB' : `+${db} dB`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle Advanced Technical Settings */}
              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-slate-950 py-1 cursor-pointer"
                >
                  <span>কাস্টম কোডেক ও বিটরেট সেটিংস</span>
                  <span className="font-mono text-blue-700">
                    {showAdvanced ? 'বন্ধ করুন' : 'পরিবর্তন করুন'}
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="codec-select" className="block text-slate-600 mb-1">
                          ভিডিও কোডেক
                        </label>
                        <select
                          id="codec-select"
                          value={settings.videoCodec}
                          onChange={(e) => handleCodecChange(e.target.value as VideoCodec)}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value="h263">H.263 (সর্বোচ্চ সাপোর্ট)</option>
                          <option value="mpeg4">MPEG-4 SP (বড় স্ক্রিন)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="res-select" className="block text-slate-600 mb-1">
                          রেজল্যুশন
                        </label>
                        <select
                          id="res-select"
                          value={settings.resolution}
                          onChange={(e) =>
                            handleResolutionChange(e.target.value as ResolutionOption)
                          }
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value="128x96">128×96 (SQCIF)</option>
                          <option value="176x144">176×144 (QCIF)</option>
                          <option value="320x240">320×240 (QVGA)</option>
                          <option value="240x320">240×320 (Portrait)</option>
                          <option value="352x288">352×288 (CIF)</option>
                        </select>
                      </div>
                    </div>

                    {settings.videoCodec === 'mpeg4' &&
                      !H263_RESOLUTIONS.includes(settings.resolution) && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                          320×240 বা 240×320 রেজল্যুশনের জন্য স্বয়ংক্রিয়ভাবে MPEG-4 SP কোডেক ব্যবহার করা হচ্ছে, কারণ H.263 কেবল 176×144 ও 352×288 সাপোর্ট করে।
                        </p>
                      )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="fps-select" className="block text-slate-600 mb-1">
                          ফ্রেম-রেট (FPS)
                        </label>
                        <select
                          id="fps-select"
                          value={settings.fps}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              fps: Number(e.target.value),
                            }))
                          }
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value={10}>10 fps (হালকা ফাইল)</option>
                          <option value={12}>12 fps</option>
                          <option value={15}>15 fps (আদর্শ)</option>
                          <option value={20}>20 fps</option>
                          <option value={24}>24 fps (উচ্চ)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="vbit-select" className="block text-slate-600 mb-1">
                          ভিডিও বিটরেট
                        </label>
                        <select
                          id="vbit-select"
                          value={settings.videoBitrate}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              videoBitrate: Number(e.target.value),
                            }))
                          }
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value={80}>80 kbps</option>
                          <option value={128}>128 kbps</option>
                          <option value={192}>192 kbps</option>
                          <option value={256}>256 kbps</option>
                          <option value={320}>320 kbps</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="ach-select" className="block text-slate-600 mb-1">
                          অডিও চ্যানেল
                        </label>
                        <select
                          id="ach-select"
                          value={settings.audioChannels}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              audioChannels: Number(e.target.value) === 2 ? 2 : 1,
                            }))
                          }
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value={1}>Mono (১ চ্যানেল · নিরাপদ)</option>
                          <option value={2}>Stereo (২ চ্যানেল)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="abit-select" className="block text-slate-600 mb-1">
                          অডিও বিটরেট ও রেট
                        </label>
                        <select
                          id="abit-select"
                          value={`${settings.audioBitrate}-${settings.audioSampleRate}`}
                          onChange={(e) => {
                            const [b, r] = e.target.value.split('-').map(Number);
                            setSettings((prev) => ({
                              ...prev,
                              presetId: 'custom',
                              audioBitrate: b,
                              audioSampleRate: r,
                            }));
                          }}
                          className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono text-slate-900"
                        >
                          <option value="24-22050">24 kbps · 22 kHz</option>
                          <option value="32-22050">32 kbps · 22 kHz</option>
                          <option value="48-44100">48 kbps · 44.1 kHz</option>
                          <option value="64-44100">64 kbps · 44.1 kHz</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {/* Compatibility & SD Card Guide */}
        <CompatibilityGuide />
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>3GP স্টুডিও · বাটন ফোন ভিডিও কনভার্টার</span>
          <span>আপলোড করা ফাইল ৪৫ মিনিট পর স্বয়ংক্রিয়ভাবে মুছে যায়</span>
        </div>
      </footer>
    </div>
  );
}
