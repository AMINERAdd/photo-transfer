import { useCallback, useState } from 'react';
import { Photo } from '../types';
import PhotoCard from './PhotoCard';
import Lightbox from './Lightbox';
import { downloadPhoto, downloadZip, isIOS } from '../utils/download';
import { apiUrl } from '../utils/api';

interface Props {
  photos: Photo[];
  loading: boolean;
  onDelete: (publicId: string) => void;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden animate-pulse">
      <div className="aspect-square bg-white/[0.04]" />
      <div className="p-3 space-y-2.5">
        <div className="h-3.5 bg-white/[0.05] rounded-lg w-3/4" />
        <div className="h-3 bg-white/[0.04] rounded-lg w-1/2" />
        <div className="h-10 bg-white/[0.04] rounded-xl sm:hidden" />
      </div>
    </div>
  );
}

export default function PhotoGrid({ photos, loading, onDelete }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSharing, setBulkSharing] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [dlProgress, setDlProgress] = useState({ current: 0, total: 0 });

  const enterSelection = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(photos.map((p) => p.public_id)));
  }, [photos]);

  const handleBulkDownload = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));
    setBulkDownloading(true);
    setDlProgress({ current: selected.length, total: selected.length });
    try {
      if (selected.length === 1) {
        // Single photo — direct download (no need for ZIP)
        const p = selected[0];
        await downloadPhoto(p.secure_url, p.original_filename + (p.format ? `.${p.format}` : ''));
      } else {
        // Multiple photos — bundle into a single ZIP file
        await downloadZip(selected);
      }
    } catch { /* silent fail */ }
    setBulkDownloading(false);
    setDlProgress({ current: 0, total: 0 });
  }, [photos, selectedIds]);

  const handleBulkDelete = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));
    if (!confirm(`Supprimer ${selected.length} photo${selected.length > 1 ? 's' : ''} ?`)) return;
    setBulkDeleting(true);
    for (const p of selected) {
      try {
        await fetch(apiUrl(`/api/photos/${encodeURIComponent(p.public_id)}`), { method: 'DELETE' });
        onDelete(p.public_id);
      } catch { /* continue */ }
    }
    setBulkDeleting(false);
    cancelSelection();
  }, [photos, selectedIds, onDelete, cancelSelection]);

  // Just open the share menu — always works, no detection needed
  const handleBulkShare = useCallback(() => {
    setShareMenu(true);
  }, []);

  // Open URL reliably (works in Safari, iOS PWA, etc.)
  const openExternalUrl = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Try native share sheet (iOS / Android / Windows 10+ Edge & Chrome)
  const shareNative = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));

    // Browser doesn't support Web Share API at all (older PC browsers)
    if (typeof navigator.share !== 'function') {
      alert(
        "Votre navigateur ne supporte pas le partage natif.\n\n" +
        "Utilisez WhatsApp Web, Telegram Web ou Copier les liens à la place."
      );
      return;
    }

    setShareMenu(false);
    setBulkSharing(true);

    try {
      const files: File[] = [];
      for (const p of selected) {
        try {
          const res = await fetch(p.secure_url, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const filename = p.original_filename + (p.format ? `.${p.format}` : '');
          files.push(new File([blob], filename, { type: blob.type }));
        } catch { /* skip */ }
      }

      if (files.length === 0) {
        alert('Impossible de charger les photos. Réessayez.');
        setBulkSharing(false);
        return;
      }

      // Try sharing with files first (best UX on iOS/Android/Win11)
      if (navigator.canShare?.({ files })) {
        try {
          await navigator.share({
            files,
            title: `${files.length} photo${files.length > 1 ? 's' : ''}`,
          });
          cancelSelection();
          setBulkSharing(false);
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') {
            setBulkSharing(false);
            return;
          }
        }
      }

      // Fallback: share URLs as text (Windows Chrome/Edge without file support)
      try {
        const urls = selected.map((p) => p.secure_url).join('\n');
        await navigator.share({
          title: `${selected.length} photo${selected.length > 1 ? 's' : ''}`,
          text: urls,
        });
        cancelSelection();
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          alert("Le partage natif n'est pas disponible. Utilisez une autre option.");
          setShareMenu(true);
        }
      }
    } catch {
      alert("Erreur lors du partage. Réessayez.");
    }
    setBulkSharing(false);
  }, [photos, selectedIds, cancelSelection]);

  const shareToWhatsApp = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));
    setShareMenu(false);
    setBulkSharing(true);
    try {
      if (selected.length === 1) {
        const p = selected[0];
        await downloadPhoto(p.secure_url, p.original_filename + (p.format ? `.${p.format}` : ''));
      } else {
        await downloadZip(selected);
      }
      openExternalUrl('https://web.whatsapp.com');
      cancelSelection();
    } catch { /* silent */ }
    setBulkSharing(false);
  }, [photos, selectedIds, cancelSelection]);

  const shareToTelegram = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));
    setShareMenu(false);
    setBulkSharing(true);
    try {
      if (selected.length === 1) {
        const p = selected[0];
        await downloadPhoto(p.secure_url, p.original_filename + (p.format ? `.${p.format}` : ''));
      } else {
        await downloadZip(selected);
      }
      openExternalUrl('https://web.telegram.org');
      cancelSelection();
    } catch { /* silent */ }
    setBulkSharing(false);
  }, [photos, selectedIds, cancelSelection]);

  const copyLinks = useCallback(async () => {
    const selected = photos.filter((p) => selectedIds.has(p.public_id));
    const text = selected.map((p) => p.secure_url).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setShareMenu(false);
      alert(`${selected.length} lien${selected.length > 1 ? 's' : ''} copié${selected.length > 1 ? 's' : ''} dans le presse-papier`);
    } catch {
      // Fallback for Safari < 13 or non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setShareMenu(false);
        alert(`${selected.length} lien${selected.length > 1 ? 's' : ''} copié${selected.length > 1 ? 's' : ''}`);
      } catch {
        alert('Impossible de copier les liens');
      }
      ta.remove();
    }
  }, [photos, selectedIds]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-700">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-500">Aucune photo</p>
          <p className="text-sm text-slate-700 mt-1">Uploadez vos premières photos avec la zone ci-dessus.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* "Sélectionner" button — visible when NOT in selection mode */}
      {!selectionMode && (
        <div className="flex justify-end mb-3 px-1">
          <button
            onClick={() => setSelectionMode(true)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.97] hover:border-white/20 text-slate-300 hover:text-white text-[13px] sm:text-sm font-medium px-3.5 sm:px-4 py-2 min-h-[40px] transition-all"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
            </svg>
            Sélectionner
          </button>
        </div>
      )}

      {/* Selection mode header */}
      {selectionMode && (
        <div className="flex items-center justify-between mb-3 px-1 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={cancelSelection}
              className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 shrink-0 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] active:scale-95 text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-[13px] sm:text-sm font-semibold text-white truncate">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={selectedIds.size === photos.length ? cancelSelection : selectAll}
            className="text-[13px] sm:text-sm text-sky-400 hover:text-sky-300 active:text-sky-500 font-medium transition-colors shrink-0 px-2 py-1.5"
          >
            {selectedIds.size === photos.length ? 'Désélect. tout' : 'Tout sélect.'}
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {photos.map((photo, i) => (
          <PhotoCard
            key={photo.public_id}
            photo={photo}
            onDelete={onDelete}
            onOpen={() => {
              if (selectionMode) { toggleSelect(photo.public_id); return; }
              setLightboxIndex(i);
            }}
            selectionMode={selectionMode}
            selected={selectedIds.has(photo.public_id)}
            onLongPress={() => enterSelection(photo.public_id)}
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && !selectionMode && (
        <Lightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={(id) => {
            onDelete(id);
            if (photos.length <= 1) setLightboxIndex(null);
          }}
        />
      )}

      {/* Floating action bar (selection mode) */}
      {selectionMode && selectedIds.size > 0 && (
        <div
          className="fixed inset-x-3 sm:inset-x-4 z-40 flex items-center gap-1.5 sm:gap-2 rounded-2xl bg-slate-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 px-2.5 sm:px-4 py-2.5 sm:py-3"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
        >
          {/* Download selected */}
          <button
            onClick={handleBulkDownload}
            disabled={bulkDownloading || bulkDeleting || bulkSharing}
            className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] py-2 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.96] text-white text-[13px] sm:text-sm font-semibold transition-all disabled:opacity-50"
          >
            {bulkDownloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="tabular-nums">{dlProgress.current}/{dlProgress.total}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className="hidden sm:inline">Télécharger</span>
              </>
            )}
          </button>

          {/* Share selected */}
          <button
            onClick={handleBulkShare}
            disabled={bulkSharing || bulkDownloading || bulkDeleting}
            className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] py-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 active:scale-[0.96] text-white text-[13px] sm:text-sm font-semibold transition-all disabled:opacity-50"
          >
            {bulkSharing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186 6.648-3.25m0 0a3.752 3.752 0 0 0-7.296 0M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
                <span className="hidden sm:inline">Partager</span>
              </>
            )}
          </button>

          {/* Delete selected */}
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting || bulkDownloading || bulkSharing}
            className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] py-2 rounded-xl bg-red-600/80 hover:bg-red-600 active:scale-[0.96] text-white text-[13px] sm:text-sm font-semibold transition-all disabled:opacity-50"
          >
            {bulkDeleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                <span className="hidden sm:inline">Supprimer</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Share menu (desktop fallback) */}
      {shareMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onClick={() => setShareMenu(false)}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-slate-900 border-t sm:border border-white/10 shadow-2xl p-4 sm:p-5 space-y-3 sm:space-y-4 animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle */}
            <div className="sm:hidden flex justify-center -mt-1 mb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Partager {selectedIds.size} photo{selectedIds.size > 1 ? 's' : ''}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Le ZIP sera téléchargé — glissez-le dans la conversation
                </p>
              </div>
              <button
                onClick={() => setShareMenu(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Native share (always visible — works on iOS, Android, Windows 10/11) */}
            <button
              onClick={shareNative}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/30 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.769-.283 1.093m0-2.186 6.648-3.25m0 0a3.752 3.752 0 0 0-7.296 0M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-white">Partage natif</div>
                <div className="text-xs text-slate-400">Menu de partage du système (iOS, Android, Windows)</div>
              </div>
            </button>

            {/* WhatsApp */}
            <button
              onClick={shareToWhatsApp}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-white">WhatsApp Web</div>
                <div className="text-xs text-slate-400">Télécharger ZIP + ouvrir WhatsApp</div>
              </div>
            </button>

            {/* Telegram */}
            <button
              onClick={shareToTelegram}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-[#0088cc]/15 hover:bg-[#0088cc]/25 border border-[#0088cc]/30 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0088cc] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-white">Telegram Web</div>
                <div className="text-xs text-slate-400">Télécharger ZIP + ouvrir Telegram</div>
              </div>
            </button>

            {/* Copy Links */}
            <button
              onClick={copyLinks}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-white">Copier les liens</div>
                <div className="text-xs text-slate-400">Coller les URLs dans n'importe quel chat</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
