import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PHONE_BRAND_DIRECTORY } from '../types/converter';

interface CompatibilityGuideProps {
  onApplyPreset: (presetId: string) => void;
}

export const CompatibilityGuide: React.FC<CompatibilityGuideProps> = ({ onApplyPreset }) => {
  const [query, setQuery] = useState('');

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_BRAND_DIRECTORY;
    return PHONE_BRAND_DIRECTORY.filter(
      (item) =>
        item.brand.toLowerCase().includes(q) ||
        item.models.toLowerCase().includes(q) ||
        item.formatSummary.toLowerCase().includes(q) ||
        item.codecSummary.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <section
      id="guide"
      className="mt-14 pt-10 border-t border-slate-200 dark:border-slate-800"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            বাটন ফোন মডেল অনুযায়ী ফরম্যাট গাইড
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            আপনার ফোনের ব্র্যান্ড বা মডেল খুঁজে “প্রিসেট সেট করুন” বাটনে ক্লিক করলেই কনভার্টার স্বয়ংক্রিয়ভাবে ওই ফোনের উপযোগী ফরম্যাটে সেট হয়ে যাবে।
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ফোনের নাম লিখুন (যেমন Nokia, Symphony)"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Compatibility Matrix Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4">ফোন ব্র্যান্ড ও মডেল</th>
                <th className="py-3 px-4">আউটপুট</th>
                <th className="py-3 px-4">কোডেক ও FPS</th>
                <th className="py-3 px-4">স্ক্রিন সাইজ</th>
                <th className="py-3 px-4">অডিও</th>
                <th className="py-3 px-4 text-right">দ্রুত সেটআপ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
              {filteredBrands.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    “{query}” নামে কোনো মডেল পাওয়া যায়নি — সাধারণ বাটন ফোনের জন্য Nokia Basic (3GP H.263) ব্যবহার করুন।
                  </td>
                </tr>
              ) : (
                filteredBrands.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {row.brand}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {row.models}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {row.formatSummary}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      {row.codecSummary}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">
                      {row.screenSummary}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{row.audioSummary}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(row.presetId);
                          document
                            .getElementById('converter')
                            ?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        প্রিসেট সেট করুন
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3 Practical Tips */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            01. 3GP না চললে AVI (MJPEG) দিন
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            অনেক পুরোনো Symphony, Walton বা চাইনিজ বাটন ফোনে 3GP-এর বদলে কেবল <span className="font-mono text-xs">AVI (MJPEG + MP3)</span> চলে। সেসব ফোনের জন্য ক্লাসিক AVI প্রিসেট বেছে নিন।
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            02. ভিডিও থেকে রিংটোন বা গান
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            যেকোনো MP4/MKV গানের ভিডিও আপলোড করে <span className="font-mono text-xs">MP3 অডিও</span> মোড বাছাই করলে এবং শুরু-শেষ ট্রিম করলে সাথে সাথে ফোনের রিংটোন তৈরি হয়ে যাবে।
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            03. মেমোরি কার্ডে কপি করার নিয়ম
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            ব্যাচ কনভার্ট শেষে <span className="font-mono text-xs">.zip</span> ফাইলটি আনজিপ করে ভিডিওগুলো <span className="font-mono text-xs">Videos</span> এবং অডিওগুলো <span className="font-mono text-xs">My Music</span> ফোল্ডারে রাখুন।
          </p>
        </div>
      </div>
    </section>
  );
};
