import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadItem, Photo } from '../types';
import { apiUrl } from '../utils/api';

interface Props {
  onUploaded: (photos: Photo[]) => void;
}

const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/*': [],
  'application/octet-stream': ['.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.rw2', '.rwl', '.pef', '.ptx', '.dng', '.orf', '.srw', '.x3f', '.raw'],
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let idCounter = 0;
const uid = () => `u-${++idCounter}`;

export default function DragAndDropZone({ onUploaded }: Props) {
  const [queue, setQueue] = useState<UploadItem[]>([]);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const uploadFile = useCallback((item: UploadItem) => {
    const formData = new FormData();
    formData.append('photos', item.file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        updateItem(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          updateItem(item.id, { status: 'done', progress: 100 });
          if (data.uploaded?.length) onUploaded(data.uploaded);
        } catch {
          updateItem(item.id, { status: 'error', error: 'Invalid response' });
        }
      } else {
        updateItem(item.id, { status: 'error', error: `Error ${xhr.status}` });
      }
    });

    xhr.addEventListener('error', () =>
      updateItem(item.id, { status: 'error', error: 'Network error' })
    );

    xhr.open('POST', apiUrl('/api/upload'));
    xhr.send(formData);
  }, [onUploaded]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newItems: UploadItem[] = acceptedFiles.map((file) => ({
      id: uid(),
      file,
      progress: 0,
      status: 'uploading',
    }));
    setQueue((prev) => [...prev, ...newItems]);
    newItems.forEach(uploadFile);
  }, [uploadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 500 * 1024 * 1024,
  });

  const activeCount = queue.filter((i) => i.status === 'uploading').length;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 cursor-pointer select-none
          transition-all duration-300 ease-out py-14 px-8
          ${isDragActive
            ? 'border-sky-400 bg-sky-500/[0.07] scale-[1.005] shadow-[0_0_40px_-8px_rgba(56,189,248,0.3)]'
            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]'
          }`}
      >
        <input {...getInputProps()} />

        {/* Animated ring on drag */}
        {isDragActive && (
          <div className="absolute inset-0 rounded-2xl border-2 border-sky-400/40 animate-ping" style={{ animationDuration: '1.5s' }} />
        )}

        {/* Icon */}
        <div className={`relative rounded-2xl p-4 transition-all duration-300
          ${isDragActive ? 'bg-sky-500/20 scale-110' : 'bg-white/5 group-hover:bg-white/8'}`}>
          <svg
            className={`w-10 h-10 transition-colors duration-300 ${isDragActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        {/* Text */}
        <div className="text-center space-y-1.5">
          <p className={`text-base font-semibold transition-colors duration-200 ${isDragActive ? 'text-sky-300' : 'text-slate-300'}`}>
            {isDragActive ? 'Release to upload' : 'Drag & drop your photos'}
          </p>
          <p className="text-sm text-slate-600">
            JPEG · PNG · RAW · CR2 · NEF · ARW · DNG — up to 500 MB each
          </p>
        </div>

        {/* Browse button */}
        <button
          type="button"
          className={`relative z-10 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${isDragActive
              ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
              : 'bg-white/8 hover:bg-white/14 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white'
            }`}
          onClick={(e) => e.stopPropagation()}
        >
          Browse Files
        </button>
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {activeCount > 0 && (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-1">
              Uploading {activeCount} file{activeCount !== 1 ? 's' : ''}…
            </p>
          )}
          <div className="space-y-1.5">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors
                  ${item.status === 'done'
                    ? 'bg-emerald-500/5 border-emerald-500/15'
                    : item.status === 'error'
                    ? 'bg-red-500/5 border-red-500/15'
                    : 'bg-white/[0.03] border-white/[0.06]'
                  }`}
              >
                {/* Status icon */}
                <div className="shrink-0 w-5 flex justify-center">
                  {item.status === 'done' && (
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  {item.status === 'error' && (
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                  {item.status === 'uploading' && (
                    <div className="w-4 h-4 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
                  )}
                </div>

                {/* File info + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-300 truncate font-medium">{item.file.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-600">{formatBytes(item.file.size)}</span>
                      {item.status === 'uploading' && (
                        <span className="text-xs font-mono text-sky-400 min-w-[36px] text-right">{item.progress}%</span>
                      )}
                    </div>
                  </div>
                  {item.status === 'uploading' && (
                    <div className="mt-1.5 h-[3px] rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
