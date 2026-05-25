export interface Photo {
  public_id: string;
  secure_url: string;
  thumbnail_url: string | null;
  download_url: string;
  original_filename: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  resource_type: 'image' | 'raw';
}

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}
