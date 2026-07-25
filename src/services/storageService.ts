// Storage service using AWS S3 via Supabase Edge Function
import { supabase } from '@/integrations/supabase/client';

interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  error?: string;
}

export class StorageService {
  // Upload file to S3 via Edge Function
  static async uploadToS3(file: File | Blob, folder: string = 'uploads', fileName?: string): Promise<UploadResult> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      if (fileName) {
        formData.append('fileName', fileName);
      }

      const { data, error } = await supabase.functions.invoke('s3-upload', {
        body: formData,
      });

      if (error) {
        console.error('S3 upload error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, url: data.url, key: data.key };
    } catch (error) {
      console.error('Error uploading to S3:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  // Upload a thumbnail to Supabase Storage (captures bucket). Thumbnails used
  // to go through the s3-upload edge function, but a misconfigured AWS_REGION
  // secret made that path fail silently for every capture — Supabase Storage
  // needs no AWS config, is RLS-governed, and serves a public URL directly.
  static async uploadThumbnail(file: File | Blob, fileName: string): Promise<UploadResult> {
    try {
      const path = `thumbnails/${fileName}`;
      const { error } = await supabase.storage
        .from('captures')
        .upload(path, file, { contentType: 'image/jpeg', upsert: true });
      if (error) {
        return { success: false, error: error.message };
      }
      const { data } = supabase.storage.from('captures').getPublicUrl(path);
      return { success: true, url: data.publicUrl, key: path };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Thumbnail upload failed',
      };
    }
  }

  // Upload thumbnail buffer
  static async uploadThumbnailBuffer(buffer: ArrayBuffer, fileName: string): Promise<UploadResult> {
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    return this.uploadThumbnail(blob, fileName);
  }

  // Generate thumbnail from video
  static async extractVideoThumbnail(videoFile: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Seek to 1 second
        video.currentTime = 1;
      };

      video.onseeked = () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(video.src);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create thumbnail blob'));
            }
          }, 'image/jpeg', 0.8);
        } else {
          reject(new Error('Canvas context not available'));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Video load error'));
      };

      video.src = URL.createObjectURL(videoFile);
      video.load();
    });
  }

  // Upload image file as thumbnail to S3
  static async uploadImageAsThumbnail(imageFile: File): Promise<UploadResult> {
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    return this.uploadThumbnail(imageFile, fileName);
  }

  // Upload an edited .splat to Supabase Storage (the `captures` bucket — avoids
  // the edge-function body-size limit, and authed write is allowed by RLS).
  static async uploadSplat(blob: Blob, captureId: string): Promise<UploadResult> {
    try {
      const path = `edited/${captureId}-${Date.now()}.splat`;
      const { error } = await supabase.storage
        .from('captures')
        .upload(path, blob, { contentType: 'application/octet-stream', upsert: true });
      if (error) {
        return { success: false, error: error.message };
      }
      const { data } = supabase.storage.from('captures').getPublicUrl(path);
      return { success: true, url: data.publicUrl, key: path };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Splat upload failed',
      };
    }
  }
}