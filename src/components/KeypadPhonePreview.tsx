import React from 'react';
import { Music } from 'lucide-react';
import type { ConversionMode, FitMode, ResolutionOption } from '../types/converter';

interface KeypadPhonePreviewProps {
  mode: ConversionMode;
  mediaUrl: string;
  isConvertedOutput: boolean;
  resolution: ResolutionOption;
  fitMode: FitMode;
  formatLabel: string;
  codecLabel: string;
  fps: number | null;
  audioBitrate: number;
  filename: string;
}

export const KeypadPhonePreview: React.FC<KeypadPhonePreviewProps> = ({
  mode,
  mediaUrl,
  isConvertedOutput,
  resolution,
  fitMode,
  formatLabel,
  codecLabel,
  fps,
  audioBitrate,
  filename,
}) => {
  const [wStr, hStr] = resolution.split('x');
  const w = Number(wStr);
  const h = Number(hStr);
  const isPortrait = mode === 'mp3' ? false : h > w;

  const objectFitClass =
    isConvertedOutput
      ? 'object-contain'
      : fitMode === 'crop'
      ? 'object-cover'
      : fitMode === 'stretch'
      ? 'object-fill'
      : 'object-contain';

  return (
    <div className="flex flex-col items-center justify-center py-5 px-4 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex flex-wrap items-center justify-center gap-2 tabular-nums">
        <span>
          {isConvertedOutput
            ? `কনভার্টেড ${formatLabel.toUpperCase()} প্রিভিউ`
            : mode === 'mp3'
            ? 'MP3 অডিও প্লেয়ার প্রিভিউ'
            : 'স্ক্রিন ফ্রেমিং প্রিভিউ'}
        </span>
        <span aria-hidden="true">·</span>
        {mode === 'mp3' ? (
          <>
            <span className="font-mono">MP3</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{audioBitrate} kbps</span>
          </>
        ) : (
          <>
            <span className="font-mono">{resolution}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{codecLabel.toUpperCase()}</span>
            {fps !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{fps} fps</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Hardware Keypad Phone Shell */}
      <div
        className={`bg-slate-900 dark:bg-slate-950 rounded-2xl p-3.5 border border-slate-700 dark:border-slate-700 shadow-sm ${
          isPortrait ? 'w-[244px]' : 'w-[316px]'
        }`}
      >
        <div className="flex items-center justify-center mb-2.5">
          <div className="w-12 h-1 rounded-full bg-slate-700" />
        </div>

        {mode === 'mp3' ? (
          <div className="w-full bg-slate-950 rounded-md border border-slate-800 p-4 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-400">
              <Music className="w-5 h-5" />
            </div>
            <div className="text-xs text-slate-200 font-medium text-center truncate max-w-full">
              {filename}
            </div>
            <audio key={mediaUrl} src={mediaUrl} controls className="w-full h-9" />
          </div>
        ) : (
          <div
            className="w-full bg-black rounded-md overflow-hidden border border-slate-800 relative flex items-center justify-center"
            style={{ aspectRatio: `${w} / ${h}` }}
          >
            <video
              key={`${mediaUrl}-${isConvertedOutput ? 'out' : 'src'}`}
              src={mediaUrl}
              controls
              playsInline
              className={`w-full h-full bg-black ${objectFitClass}`}
            />
          </div>
        )}

        {/* Minimal Keypad Navigation Deck */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between px-3">
          <div className="flex flex-col gap-1">
            <div className="w-7 h-1.5 rounded-sm bg-slate-700" />
            <div className="w-5 h-1.5 rounded-sm bg-emerald-700" />
          </div>
          <div className="w-8 h-8 rounded-lg border-2 border-slate-700 flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-sm bg-slate-800" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="w-7 h-1.5 rounded-sm bg-slate-700" />
            <div className="w-5 h-1.5 rounded-sm bg-rose-800" />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center max-w-md leading-relaxed">
        {mode === 'mp3'
          ? 'এখান থেকে ট্রিম ও সাউন্ড বুস্ট করা MP3 গান বা রিংটোন শুনে পরীক্ষা করতে পারবেন।'
          : isConvertedOutput
          ? 'এটি আপনার কনভার্ট হওয়া আসল রেজল্যুশন, ফ্রেম-রেট এবং সাউন্ড বুস্টের প্রিভিউ।'
          : 'ডানদিক থেকে রেজল্যুশন ও স্ক্রিন ফিট মোড বদলালে এখানে বাটন ফোনের পর্দায় ভিডিওটি কেমন দেখাবে তা দেখা যাবে।'}
      </p>
    </div>
  );
};
