import React from 'react';
import type { FitMode, ResolutionOption } from '../types/converter';

interface KeypadPhonePreviewProps {
  videoUrl: string;
  isConvertedOutput: boolean;
  resolution: ResolutionOption;
  fitMode: FitMode;
  codecLabel: string;
  fps: number;
}

export const KeypadPhonePreview: React.FC<KeypadPhonePreviewProps> = ({
  videoUrl,
  isConvertedOutput,
  resolution,
  fitMode,
  codecLabel,
  fps,
}) => {
  const [wStr, hStr] = resolution.split('x');
  const w = Number(wStr);
  const h = Number(hStr);
  const isPortrait = h > w;

  const objectFitClass =
    isConvertedOutput
      ? 'object-contain'
      : fitMode === 'crop'
      ? 'object-cover'
      : fitMode === 'stretch'
      ? 'object-fill'
      : 'object-contain';

  return (
    <div className="flex flex-col items-center justify-center py-4 px-4 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-xs text-slate-500 mb-3 flex items-center gap-2 tabular-nums">
        <span>{isConvertedOutput ? 'কনভার্টেড 3GP প্রিভিউ' : 'স্ক্রিন ফ্রেমিং প্রিভিউ'}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">{resolution}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">{codecLabel.toUpperCase()}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">{fps} fps</span>
      </div>

      {/* Hardware Keypad Phone Shell */}
      <div
        className={`bg-slate-900 rounded-2xl p-3.5 border border-slate-700 shadow-sm ${
          isPortrait ? 'w-[248px]' : 'w-[320px]'
        }`}
      >
        {/* Earpiece slit */}
        <div className="flex items-center justify-center mb-2.5">
          <div className="w-12 h-1 rounded-full bg-slate-700" />
        </div>

        {/* LCD Viewport matching target aspect ratio */}
        <div
          className="w-full bg-black rounded-md overflow-hidden border border-slate-800 relative flex items-center justify-center"
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          <video
            key={`${videoUrl}-${isConvertedOutput ? 'out' : 'src'}`}
            src={videoUrl}
            controls
            playsInline
            className={`w-full h-full bg-black ${objectFitClass}`}
          />
        </div>

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

      <p className="mt-3 text-xs text-slate-500 text-center max-w-md leading-relaxed">
        {isConvertedOutput
          ? 'এটি আপনার কনভার্ট হওয়া আসল রেজল্যুশন, ফ্রেম-রেট এবং সাউন্ড বুস্টের প্রিভিউ। বাটন ফোনে চালানোর জন্য নিচের ডাউনলোড বাটন থেকে .3gp ফাইলটি নিন।'
          : 'ডানদিক থেকে রেজল্যুশন ও স্ক্রিন ফিট মোড বদলালে এখানে বাটন ফোনের পর্দায় ভিডিওটি কেমন দেখাবে তা তাৎক্ষণিক দেখা যাবে।'}
      </p>
    </div>
  );
};
