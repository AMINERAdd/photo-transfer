import { useCallback, useEffect, useState } from 'react';
import DragAndDropZone from './components/DragAndDropZone';
import PhotoGrid from './components/PhotoGrid';
import { Photo } from './types';
import { downloadPhoto, downloadZip, isIOS } from './utils/download';
import { apiUrl } from './utils/api';


function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  const fetchPhotos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/photos'));
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setPhotos(data.photos);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load photos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleUploaded = useCallback((newPhotos: Photo[]) => {
    setPhotos((prev) => [...newPhotos, ...prev]);
  }, []);

  const handleDelete = useCallback((publicId: string) => {
    setPhotos((prev) => prev.filter((p) => p.public_id !== publicId));
  }, []);

  const handleClearAll = useCallback(async () => {
    if (!confirm(`Delete all ${photos.length} photos from Cloudinary? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const res = await fetch(apiUrl('/api/photos/clear-all'), { method: 'DELETE' });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setPhotos([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear gallery.');
    } finally {
      setClearing(false);
    }
  }, [photos.length]);

  const handleDownloadAll = useCallback(async () => {
    if (photos.length === 0) return;
    setDownloadingAll(true);
    setDownloadProgress({ current: 0, total: photos.length });

    // Download each photo individually — no ZIP
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      try {
        await downloadPhoto(p.secure_url, p.original_filename + (p.format ? `.${p.format}` : ''));
      } catch { /* continue */ }
      setDownloadProgress({ current: i + 1, total: photos.length });
      if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 250));
    }

    setDownloadingAll(false);
    setDownloadProgress({ current: 0, total: 0 });
  }, [photos]);

  const totalBytes = photos.reduce((acc, p) => acc + p.bytes, 0);

  return (
    <div className="min-h-full flex flex-col bg-slate-950">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
            </div>
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-[14px] sm:text-[15px] font-bold tracking-tight text-white truncate">PhotoTransfer</span>
              <span className="text-[9px] sm:text-[10px] text-sky-400/80 font-medium tracking-wider uppercase truncate">Zero Compression</span>
            </div>
          </div>

          {/* Stats + actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {!loading && (
              <div className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/[0.08] px-2.5 sm:px-3 py-1.5">
                <span className="text-[11px] sm:text-xs font-semibold text-sky-400 tabular-nums">{photos.length}</span>
                <span className="text-[11px] sm:text-xs text-slate-500">photo{photos.length !== 1 ? 's' : ''}</span>
                {photos.length > 0 && (
                  <>
                    <span className="text-slate-700 hidden sm:inline">·</span>
                    <span className="text-xs text-slate-500 hidden sm:inline">{formatBytes(totalBytes)}</span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => fetchPhotos(true)}
              disabled={refreshing || loading}
              title="Refresh"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 text-slate-400 hover:text-slate-200 border border-white/[0.08] transition-all disabled:opacity-40"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 py-5 sm:py-8 space-y-6 sm:space-y-10">

        <DragAndDropZone onUploaded={handleUploaded} />

        {error && (
          <div className="flex items-center gap-3 rounded-2xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
            <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <span className="flex-1">{error}</span>
            <button onClick={() => fetchPhotos()} className="text-red-400 hover:text-red-300 underline underline-offset-2 shrink-0">Retry</button>
          </div>
        )}

        {/* Gallery section */}
        <section className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-slate-500">Gallery</h2>
              {!loading && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/10 border border-sky-500/20 px-2.5 py-0.5">
                  <span className="text-sm font-bold text-sky-400 tabular-nums">{photos.length}</span>
                  <span className="text-xs text-sky-500/70">photo{photos.length !== 1 ? 's' : ''}</span>
                </span>
              )}
            </div>

            {photos.length > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Download All */}
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll || clearing}
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 hover:bg-sky-500/20 active:scale-[0.97] hover:border-sky-500/40 text-sky-400 hover:text-sky-300 text-[13px] sm:text-sm font-medium px-3 sm:px-4 py-2 min-h-[40px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadingAll ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
                      <span className="tabular-nums">{downloadProgress.current}/{downloadProgress.total}</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      <span className="hidden sm:inline">Tout télécharger</span>
                      <span className="sm:hidden">Télécharger</span>
                    </>
                  )}
                </button>

                {/* Delete All */}
                <button
                  onClick={handleClearAll}
                  disabled={clearing || downloadingAll}
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-red-500/25 bg-red-500/10 hover:bg-red-500/20 active:scale-[0.97] hover:border-red-500/40 text-red-400 hover:text-red-300 text-[13px] sm:text-sm font-medium px-3 sm:px-4 py-2 min-h-[40px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing ? (
                    <div className="w-4 h-4 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  )}
                  <span className="hidden sm:inline">{clearing ? 'Suppression…' : 'Tout supprimer'}</span>
                  <span className="sm:hidden">{clearing ? '…' : 'Supprimer'}</span>
                </button>
              </div>
            )}
          </div>

          <PhotoGrid photos={photos} loading={loading} onDelete={handleDelete} />
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.04] py-5 mt-4">
        <p className="text-center text-xs text-slate-700">
          Files stored at original quality on Cloudinary · Private transfer only
        </p>
      </footer>
    </div>
  );
}
