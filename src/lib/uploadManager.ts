// Global upload manager that persists across component unmounts
type UploadFile = {
  id: string;
  file: File;
  jsonFile?: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  audioPath?: string;
  jsonPath?: string;
};

type UploadListener = (files: UploadFile[]) => void;

class UploadManager {
  private files: Map<string, UploadFile> = new Map();
  private listeners: Set<UploadListener> = new Set();
  private uploading = false;
  private abortController: AbortController | null = null;
  private wakeLock: any = null;

  subscribe(listener: UploadListener) {
    this.listeners.add(listener);
    listener(Array.from(this.files.values()));
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const files = Array.from(this.files.values());
    this.listeners.forEach(listener => listener(files));
  }

  addFiles(newFiles: { file: File; jsonFile?: File }[]) {
    newFiles.forEach(({ file, jsonFile }) => {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      this.files.set(id, {
        id,
        file,
        jsonFile,
        status: 'pending',
        progress: 0,
      });
    });
    this.notify();
  }

  removeFile(id: string) {
    this.files.delete(id);
    this.notify();
  }

  clearCompleted() {
    Array.from(this.files.entries()).forEach(([id, file]) => {
      if (file.status === 'success') {
        this.files.delete(id);
      }
    });
    this.notify();
  }

  private updateFile(id: string, updates: Partial<UploadFile>) {
    const file = this.files.get(id);
    if (file) {
      this.files.set(id, { ...file, ...updates });
      this.notify();
    }
  }

  private async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
      }
    }
  }

  private async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
      }
    }
  }

  async startUpload(supabase: any) {
    if (this.uploading) return;

    this.uploading = true;
    this.abortController = new AbortController();

    await this.requestWakeLock();

    const pendingFiles = Array.from(this.files.values()).filter(
      f => f.status === 'pending'
    );

    for (const uploadFile of pendingFiles) {
      if (this.abortController.signal.aborted) {
        break;
      }

      await this.uploadSingleFile(uploadFile, supabase);
    }

    await this.releaseWakeLock();
    this.uploading = false;
    this.notify();
  }

  private async uploadSingleFile(uploadFile: UploadFile, supabase: any) {
    const { id, file, jsonFile } = uploadFile;

    try {
      this.updateFile(id, { status: 'uploading', progress: 0 });

      // Upload audio file
      const audioPath = file.name;
      const { error: audioError } = await supabase.storage
        .from('audio-files')
        .upload(audioPath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (audioError) throw audioError;

      this.updateFile(id, { progress: jsonFile ? 50 : 100, audioPath });

      // Upload JSON file if exists
      if (jsonFile) {
        const jsonPath = jsonFile.name;
        const { error: jsonError } = await supabase.storage
          .from('audio-files')
          .upload(jsonPath, jsonFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (jsonError) throw jsonError;

        this.updateFile(id, { progress: 100, status: 'success', jsonPath });
      } else {
        this.updateFile(id, { status: 'success' });
      }
    } catch (error: any) {
      this.updateFile(id, {
        status: 'error',
        error: error.message || 'Upload failed',
      });
    }
  }

  stopUpload() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.uploading = false;
    this.releaseWakeLock();
    this.notify();
  }

  isUploading() {
    return this.uploading;
  }

  getStats() {
    const files = Array.from(this.files.values());
    return {
      total: files.length,
      pending: files.filter(f => f.status === 'pending').length,
      uploading: files.filter(f => f.status === 'uploading').length,
      success: files.filter(f => f.status === 'success').length,
      error: files.filter(f => f.status === 'error').length,
    };
  }
}

// Global singleton instance
export const uploadManager = new UploadManager();
