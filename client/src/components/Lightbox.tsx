import { useCallback, useEffect, useRef, useState } from 'react';
import { Photo } from '../types';
import { downloadPhoto, isIOS } from '../utils/download';
import { apiUrl } from '../utils/api';

interface Props {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onDelete: (publicId: string) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Lightbox({ photos, initialIndex, onClose, onDelete }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [visible, setVisible] = useState(false);
  const touchStartX = useRef(0);

  const photo = photos[index];
  const filename = photo.original_filename + (photo.format ? `.${photo.format}` : '');
  const isRaw = photo.resource_type === 'raw';

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Reset img loaded state when navigating
  useEffect(() => { setImgLoaded(false); }, [index]);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  const goPrev = useCallback(() =>
    setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);

  const goNext = useCallback(() =>
    setIndex((i) => (i + 1) % photos.length), [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      close();
      if (e.key === 'ArrowLeft')   goPrev();
      if (e.key === 'ArrowRight')  goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, goPrev, goNext]);

  // Swipe on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? goNext() : goPrev();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadPhoto(photo.secure_url, filename); }
    catch { window.location.href = photo.secure_url; }
    finally { setDownloading(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer "${filename}" ?`)) return;
    setDeleting(true);
    try {
      await fetch(apiUrl(`/api/photos/${encodeURIComponent(photo.public_id)}`), { method: 'DELETE' });
      onDelete(photo.public_id);
      if (photos.length <= 1) { close(); return; }
      setIndex((i) => Math.min(i, photos.length - 2));
    } finally { setDeleting(false); }
  };

  // Build a larger preview URL from the thumbnail URL
  // Replace thumbnail transform params with a wider constraint
  const previewUrl = photo.thumbnail_url
    ? photo.thumbnail_url.replace(/w_600,h_600,c_fill,q_auto:low,f_webp/, 'w_1800,c_limit,q_auto:good,f_webp')
    : null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={close} />

      {/* ── Top bar ───────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Counter */}
          <span className="text-xs sm:text-sm font-mono text-slate-400 tabular-nums shrink-0">
            {index + 1} / {photos.length}
          </span>
          {/* Format badge */}
          <span className="rounded-md sm:rounded-lg bg-white/[0.08] border border-white/10 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono font-bold tracking-widest text-slate-400 shrink-0">
            {(photo.format || 'RAW').toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-red-500/20 active:scale-95 hover:text-red-400 text-slate-400 border border-white/[0.08] hover:border-red-500/30 transition-all"
          >
            {deleting
              ? <div className="w-4 h-4 border border-current/30 border-t-current rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
            }
          </button>

          {/* Close */}
          <button
            onClick={close}
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 hover:bg-white/[0.12] active:scale-95 text-slate-300 hover:text-white border border-white/[0.08] transition-all"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Image area ────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center min-h-0 px-1 sm:px-16 py-1 sm:py-2">

        {/* Prev arrow */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-1 sm:left-4 z-20 flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-black/60 hover:bg-white/15 active:scale-90 text-slate-200 hover:text-white border border-white/10 transition-all backdrop-blur-md"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}

        {/* Image / placeholder */}
        <div className="relative max-h-full max-w-full flex items-center justify-center w-full h-full">
          {isRaw || !previewUrl ? (
            <div className="flex flex-col items-center gap-3 sm:gap-4 text-slate-500 px-6 text-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/5 flex items-center justify-center">
                <svg className="w-10 h-10 sm:w-12 sm:h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
              </div>
              <p className="text-xl sm:text-2xl font-mono font-bold tracking-widest">
                {(photo.format || 'RAW').toUpperCase()}
              </p>
              <p className="text-xs sm:text-sm text-slate-600">Aperçu non disponible pour les fichiers RAW</p>
            </div>
          ) : (
            <>
              {/* Shimmer while loading */}
              {!imgLoaded && (
                <div className="absolute inset-0 m-auto rounded-2xl bg-white/5 animate-pulse" style={{ maxWidth: 300, maxHeight: 200 }} />
              )}
              <img
                key={photo.public_id}
                src={previewUrl}
                alt={filename}
                onLoad={() => setImgLoaded(true)}
                className={`max-h-full max-w-full rounded-xl sm:rounded-2xl object-contain shadow-2xl transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              />
            </>
          )}
        </div>

        {/* Next arrow */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-1 sm:right-4 z-20 flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-black/60 hover:bg-white/15 active:scale-90 text-slate-200 hover:text-white border border-white/10 transition-all backdrop-blur-md"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Bottom bar ────────────────────────────────────── */}
      <div className="relative z-10 shrink-0 px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2.5 sm:gap-3">
        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-sm font-semibold text-slate-100 truncate">{filename}</p>
          <p className="text-[11px] sm:text-xs text-slate-500 font-mono mt-0.5 truncate">
            {formatBytes(photo.bytes)}
            {photo.width && photo.height && ` · ${photo.width}×${photo.height}`}
          </p>
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-2 px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.96] text-white text-[13px] sm:text-sm font-semibold shadow-xl shadow-sky-900/40 transition-all disabled:opacity-60 shrink-0"
        >
          {downloading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          }
          <span className="sm:hidden">{downloading ? '…' : 'Télécharger'}</span>
          <span className="hidden sm:inline">{downloading ? 'Téléchargement…' : "Télécharger l'original"}</span>
          {!downloading && isIOS() && (
            <span className="text-white/50 text-xs font-normal hidden md:inline">· Partager → Photos</span>
          )}
        </button>
      </div>
    </div>
  );
}
