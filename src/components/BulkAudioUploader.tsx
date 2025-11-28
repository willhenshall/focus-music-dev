import { useState, useRef, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertCircle, Loader, Music } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadManager } from '../lib/uploadManager';

type UploadFile = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  audioPath?: string;
  jsonPath?: string;
};

export function BulkAudioUploader() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to upload manager updates
  useEffect(() => {
    const unsubscribe = uploadManager.subscribe((updatedFiles) => {
      setFiles(updatedFiles);
      setUploading(uploadManager.isUploading());
    });

    return unsubscribe;
  }, []);

  const handleAudioFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles)
      .filter(file => file.name.endsWith('.mp3'))
      .map(file => ({ file }));

    uploadManager.addFiles(newFiles);
  };

  const handleJsonFiles = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const jsonFileMap = new Map<string, File>();
    Array.from(selectedFiles).forEach(file => {
      if (file.name.endsWith('.json')) {
        const baseName = file.name.replace('.json', '');
        jsonFileMap.set(baseName, file);
      }
    });

    // Match JSON files with existing audio files and re-add them
    const updatedFiles = files
      .filter(f => f.status === 'pending')
      .map(uploadFile => {
        const baseName = uploadFile.file.name.replace('.mp3', '');
        const jsonFile = jsonFileMap.get(baseName);
        return {
          file: uploadFile.file,
          jsonFile,
        };
      })
      .filter(f => f.jsonFile); // Only keep files with matching JSON

    if (updatedFiles.length > 0) {
      // Remove old files and add new ones with JSON
      files
        .filter(f => f.status === 'pending')
        .forEach(f => uploadManager.removeFile(f.id));

      uploadManager.addFiles(updatedFiles);
    }
  };

  const removeFile = (id: string) => {
    uploadManager.removeFile(id);
  };

  const startUpload = async () => {
    uploadManager.startUpload(supabase);
  };

  const stopUpload = () => {
    uploadManager.stopUpload();
  };

  const clearCompleted = () => {
    uploadManager.clearCompleted();
  };

  const totalFiles = files.length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const pendingCount = files.filter(f => f.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Bulk Audio Upload</h2>
        <p className="text-slate-600">
          Upload MP3 files and their JSON metadata sidecars to the audio-files storage bucket
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Audio Files (.mp3)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3"
              multiple
              onChange={(e) => handleAudioFiles(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Music size={20} />
              Choose MP3 Files
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select JSON Sidecars (.json)
            </label>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={(e) => handleJsonFiles(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => jsonInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload size={20} />
              Choose JSON Files
            </button>
          </div>
        </div>

        {uploading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Loader size={20} className="animate-spin text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">Upload in progress</p>
                <p className="text-sm text-blue-700 mb-2">
                  Uploads will continue even if you navigate to other tabs within this app.
                  Screen will stay awake during upload.
                </p>
                <p className="text-xs text-blue-600">
                  Note: Do not close this browser tab or the upload will stop.
                </p>
              </div>
            </div>
          </div>
        )}

        {totalFiles > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-slate-600">
                Total: <span className="font-semibold text-slate-900">{totalFiles}</span>
              </span>
              {pendingCount > 0 && (
                <span className="text-amber-600">
                  Pending: <span className="font-semibold">{pendingCount}</span>
                </span>
              )}
              {successCount > 0 && (
                <span className="text-green-600">
                  Success: <span className="font-semibold">{successCount}</span>
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-red-600">
                  Failed: <span className="font-semibold">{errorCount}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {successCount > 0 && (
                <button
                  onClick={clearCompleted}
                  disabled={uploading}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Clear Completed
                </button>
              )}
              {uploading ? (
                <button
                  onClick={stopUpload}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <X size={18} />
                  Stop Upload
                </button>
              ) : (
                <button
                  onClick={startUpload}
                  disabled={pendingCount === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Upload size={18} />
                  Upload All
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
          {files.map(file => (
            <div key={file.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  {file.status === 'pending' && (
                    <div className="w-5 h-5 rounded-full bg-slate-200" />
                  )}
                  {file.status === 'uploading' && (
                    <Loader size={20} className="text-blue-600 animate-spin" />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle size={20} className="text-green-600" />
                  )}
                  {file.status === 'error' && (
                    <AlertCircle size={20} className="text-red-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {file.file.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(file.file.size / (1024 * 1024)).toFixed(2)} MB
                        {(file as any).jsonFile && (
                          <span className="ml-2 text-green-600">+ JSON sidecar</span>
                        )}
                      </p>
                    </div>

                    {file.status === 'pending' && !uploading && (
                      <button
                        onClick={() => removeFile(file.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  {file.status === 'uploading' && (
                    <div className="mt-2">
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{file.progress}%</p>
                    </div>
                  )}

                  {file.status === 'success' && (
                    <div className="mt-1 space-y-1">
                      {file.audioPath && (
                        <p className="text-xs text-green-600">Audio uploaded to: {file.audioPath}</p>
                      )}
                      {file.jsonPath && (
                        <p className="text-xs text-green-600">JSON uploaded to: {file.jsonPath}</p>
                      )}
                    </div>
                  )}

                  {file.status === 'error' && (
                    <p className="text-xs text-red-600 mt-1">{file.error}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
        <h4 className="text-sm font-semibold text-amber-900 mb-2">Upload Instructions</h4>
        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
          <li>Select MP3 files first, then select matching JSON sidecar files</li>
          <li>JSON files should have the same name as MP3 files (e.g., track.mp3 and track.json)</li>
          <li>Files are uploaded to the audio-files bucket in Supabase Storage</li>
          <li>Large files are supported, but may take time to upload</li>
          <li>You can upload multiple batches sequentially</li>
        </ul>
      </div>
    </div>
  );
}
