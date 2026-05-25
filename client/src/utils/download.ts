import { apiUrl } from './api';

export function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Download / save a photo.
 * Always pass `secure_url` (not the fl_attachment URL) — fl_attachment
 * is a browser-navigation hint and breaks fetch() on iOS Safari.
 */
export async function downloadPhoto(url: string, filename: string): Promise<void> {
  // ── iOS (PWA + Safari) ─────────────────────────────────────
  if (isIOS()) {
    // Web Share API with File object — best UX on iOS 15+
    // Opens the native share sheet → "Enregistrer dans Photos"
    if (typeof navigator.share === 'function') {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (e) {
        // User cancelled share sheet — stop silently
        if ((e as Error).name === 'AbortError') return;
        // Fetch/share failed — fall through to direct navigation
      }
    }

    // Fallback: navigate directly to the URL.
    // In PWA standalone mode window.open is often blocked;
    // window.location.href works reliably on all iOS versions.
    window.location.href = url;
    return;
  }

  // ── Desktop & Android ──────────────────────────────────────
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Download multiple photos as a single ZIP file.
 * The server builds the ZIP — one network request, one file saved.
 * On iOS: uses Web Share API to share the ZIP (saves to Files app).
 * On desktop/Android: blob + <a download>.
 */
export async function downloadZip(
  photos: Array<{ secure_url: string; original_filename: string; format: string }>
): Promise<void> {
  const body = photos.map((p) => ({
    secure_url: p.secure_url,
    filename: p.original_filename + (p.format ? `.${p.format}` : ''),
  }));

  const res = await fetch(apiUrl('/api/download-zip'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos: body }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const blob = await res.blob();
  const zipName = `PhotoTransfer_${new Date().toISOString().slice(0, 10)}.zip`;

  // iOS — share ZIP via native share sheet → "Enregistrer dans Fichiers"
  if (isIOS() && typeof navigator.share === 'function') {
    try {
      const file = new File([blob], zipName, { type: 'application/zip' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: zipName });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }

  // Desktop & Android — trigger blob download
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
