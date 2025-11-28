import { FileArchive, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface DownloadResultsModalProps {
  successCount: number;
  errorCount: number;
  errors: string[];
  onClose: () => void;
}

export function DownloadResultsModal({
  successCount,
  errorCount,
  errors,
  onClose
}: DownloadResultsModalProps) {
  const totalCount = successCount + errorCount;
  const hasErrors = errorCount > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              hasErrors ? 'bg-orange-100' : 'bg-green-100'
            }`}>
              {hasErrors ? (
                <AlertTriangle className="text-orange-600" size={24} />
              ) : (
                <CheckCircle className="text-green-600" size={24} />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {hasErrors ? 'Download Completed with Errors' : 'Download Complete'}
              </h2>
              <p className="text-sm text-slate-600">
                Processed {totalCount} track{totalCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="text-green-600" size={18} />
                <span className="text-sm font-medium text-green-900">Successful</span>
              </div>
              <p className="text-2xl font-bold text-green-900">{successCount}</p>
            </div>

            {hasErrors && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="text-red-600" size={18} />
                  <span className="text-sm font-medium text-red-900">Failed</span>
                </div>
                <p className="text-2xl font-bold text-red-900">{errorCount}</p>
              </div>
            )}
          </div>

          {hasErrors && errors.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Error Details:</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {errors.slice(0, 20).map((error, index) => (
                  <div key={index} className="text-xs font-mono text-slate-700 bg-white p-2 rounded border border-slate-200">
                    {error}
                  </div>
                ))}
                {errors.length > 20 && (
                  <p className="text-xs text-slate-500 italic">
                    ... and {errors.length - 20} more error{errors.length - 20 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          {!hasErrors && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileArchive className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    ZIP file downloaded successfully
                  </p>
                  <p className="text-xs text-blue-700">
                    All files have been packaged and saved to your downloads folder.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
