import React from 'react';

export const CompatibilityGuide: React.FC = () => {
  const rows = [
    {
      brand: 'Nokia (105, 130, 150, 215, 216, 3310)',
      codec: 'H.263 / MPEG-4 SP',
      resolution: '176×144 বা 320×240',
      fps: '15 fps',
      audio: 'AAC Mono · 22–44 kHz',
    },
    {
      brand: 'Symphony / Walton Olvio / Itel / Tecno',
      codec: 'H.263 / MPEG-4 SP',
      resolution: '176×144 বা 240×320',
      fps: '15 fps',
      audio: 'AAC Mono · 22 kHz',
    },
    {
      brand: 'Samsung Guru / Metro / Lava',
      codec: 'H.263 (সর্বোচ্চ নিরাপদ)',
      resolution: '176×144 (QCIF)',
      fps: '12–15 fps',
      audio: 'AAC Mono · 22 kHz',
    },
    {
      brand: 'নতুন 4G বাটন ফোন / KaiOS',
      codec: 'H.263 / MPEG-4 SP',
      resolution: '352×288 বা 320×240',
      fps: '20 fps',
      audio: 'AAC Stereo · 44.1 kHz',
    },
  ];

  return (
    <section id="guide" className="mt-14 pt-10 border-t border-slate-200">
      <div className="max-w-2xl mb-6">
        <h2 className="text-xl font-semibold text-slate-900">
          বাটন ফোন কম্প্যাটিবিলিটি ও ট্রান্সফার গাইড
        </h2>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
          অনেক সময় সাধারণ কনভার্টার দিয়ে 3GP বানালেও বাটন ফোনে “Format Not Supported” বা শুধু শব্দ আসে কিন্তু ছবি আসে না। নিচের নিয়মগুলো মানলে প্রায় সব বাটন ফোনে ভিডিও নিখুঁতভাবে চলবে।
        </p>
      </div>

      {/* Compatibility Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ফোন মডেল / ব্র্যান্ড</th>
                <th className="py-3 px-4">ভিডিও কোডেক</th>
                <th className="py-3 px-4">সাপোর্টেড সাইজ</th>
                <th className="py-3 px-4">ফ্রেম-রেট</th>
                <th className="py-3 px-4">অডিও সেটিংস</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm text-slate-700">
              {rows.map((row) => (
                <tr key={row.brand} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900">{row.brand}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{row.codec}</td>
                  <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                    {row.resolution}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                    {row.fps}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{row.audio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3 Practical Tips */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            01. কেন H.263 + 176×144 সবচেয়ে নিরাপদ?
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            পুরোনো ও কম দামের বাটন ফোনের প্রসেসর (MTK/Spreadtrum) H.264 বা HD রেজল্যুশন ডিকোড করতে পারে না। তাই ১৫ fps-এ H.263 (176×144) দিলে সব ফোনেই চলে।
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            02. মেমোরি কার্ডে কোথায় রাখবেন?
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            ডাউনলোড করা <span className="font-mono text-xs">.3gp</span> ফাইলটি এসডি কার্ডের <span className="font-mono text-xs">Videos</span> বা <span className="font-mono text-xs">My Videos</span> ফোল্ডারে রাখুন। ফাইলের নাম ছোট ও ইংরেজিতে রাখলে ফোনের গ্যালারি দ্রুত খুঁজে পায়।
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            03. সাউন্ড কম হলে কী করবেন?
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            বাটন ফোনের স্পিকার ছোট হওয়ায় অনেক ভিডিওর শব্দ কম শোনা যায়। কনভার্ট করার আগে ডানদিকের প্যানেল থেকে সাউন্ড বুস্ট <span className="font-mono text-xs">+3 dB</span> বা <span className="font-mono text-xs">+6 dB</span> নির্বাচন করুন।
          </p>
        </div>
      </div>
    </section>
  );
};
