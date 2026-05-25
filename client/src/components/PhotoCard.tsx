import { useRef, useState } from 'react';
import { Photo } from '../types';
import { downloadPhoto, isIOS } from '../utils/download';
import { apiUrl } from '../utils/api';

interface Props {
  photo: Photo;
  onDelete: (publicId: string) => void;
  onOpen: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onLongPress?: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export default function PhotoCard({ photo, onDelete, onOpen, selectionMode, selected, onLongPress }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    if (selectionMode) return;
    longPressTimer.current = setTimeout(() => onLongPress?.(), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const ext = photo.format ? photo.format.toUpperCase() : 'RAW';
  const filename = photo.original_filename + (photo.format ? `.${photo.format}` : '');

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Use secure_url (original, no transformation) — fl_attachment breaks fetch() on iOS
      await downloadPhoto(photo.secure_url, filename);
    } catch {
      window.location.href = photo.secure_url;
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${filename}"?`)) return;
    setDeleting(true);
    try {
      await fetch(apiUrl(`/api/photos/${encodeURIComponent(photo.public_id)}`), { method: 'DELETE' });
      onDelete(photo.public_id);
    } finally {
      setDeleting(false);
    }
  };

  const isRaw = photo.resource_type === 'raw';
  const showThumb = !isRaw && !imgError && photo.thumbnail_url;

  return (
    <div
      className={`group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-xl hover:shadow-black/30
        ${selected
          ? 'border-2 border-sky-400 shadow-lg shadow-sky-500/20 scale-[0.97]'
          : 'border border-white/[0.07] hover:border-white/[0.12] hover:-translate-y-0.5'
        } bg-white/[0.03]`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >

      {/* ── Thumbnail (click → lightbox) ──────────────────── */}
      <div
        className="relative aspect-square bg-white/[0.02] overflow-hidden cursor-pointer"
        onClick={onOpen}
      >
        {showThumb ? (
          <img
            src={photo.thumbnail_url!}
            alt={filename}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-slate-600">{ext}</span>
          </div>
        )}

        {/* Hover overlay — expand icon (hidden in selection mode) */}
        {!selectionMode && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </div>
          </div>
        )}

        {/* Selection checkmark */}
        {selectionMode && (
          <div className="absolute inset-0 bg-black/20 flex items-start justify-end p-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
              ${selected
                ? 'bg-sky-500 border-sky-500'
                : 'bg-black/40 border-white/60 backdrop-blur-sm'
              }`}>
              {selected && (
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Format badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className="inline-flex items-center rounded-lg bg-black/60 backdrop-blur-md px-2 py-0.5 text-[9px] font-mono font-bold tracking-widest text-slate-300 border border-white/10">
            {ext}
          </span>
        </div>

        {/* Delete — desktop (hover), mobile (always) */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all
            sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-40"
        >
          {deleting
            ? <div className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
          }
        </button>
      </div>

      {/* ── Info + Mobile download ─────────────────────────── */}
      <div className="p-3 flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate leading-snug" title={filename}>{filename}</p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-600 font-mono">
            <span>{formatBytes(photo.bytes)}</span>
            {photo.width && photo.height && (
              <><span>·</span><span>{photo.width}×{photo.height}</span></>
            )}
            <span>·</span>
            <span>{formatDate(photo.created_at)}</span>
          </div>
        </div>

        {/* Mobile download button — always visible on small screens */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="sm:hidden flex flex-col items-center justify-center gap-0.5 w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.98] text-white text-sm font-semibold shadow-lg shadow-sky-900/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-2">
            {downloading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            }
            {downloading ? 'En cours…' : 'Télécharger l\'original'}
          </span>
          {!downloading && isIOS() && (
            <span className="text-[10px] text-white/50 font-normal">
              Partager → Enregistrer dans Photos
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
