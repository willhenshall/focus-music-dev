import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Settings } from 'lucide-react';

type ColumnDefinition = {
  key: string;
  label: string;
  category: 'core' | 'metadata';
  description?: string;
};

type ColumnSelectorModalProps = {
  availableColumns: ColumnDefinition[];
  visibleColumns: string[];
  onSave: (visibleColumns: string[]) => void;
  onClose: () => void;
};

export function ColumnSelectorModal({
  availableColumns,
  visibleColumns,
  onSave,
  onClose,
}: ColumnSelectorModalProps) {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(visibleColumns);

  const toggleColumn = (columnKey: string) => {
    if (selectedColumns.includes(columnKey)) {
      setSelectedColumns(selectedColumns.filter(k => k !== columnKey));
    } else {
      setSelectedColumns([...selectedColumns, columnKey]);
    }
  };

  const handleSave = () => {
    onSave(selectedColumns);
    onClose();
  };

  const handleSelectAll = () => {
    setSelectedColumns(availableColumns.map(col => col.key));
  };

  const handleDeselectAll = () => {
    setSelectedColumns([]);
  };

  const coreColumns = availableColumns.filter(col => col.category === 'core');
  const metadataColumns = availableColumns.filter(col => col.category === 'metadata');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 pb-24"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[calc(80vh-6rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Settings className="text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Customize Columns</h2>
              <p className="text-sm text-slate-600 mt-0.5">Select which columns to display in the music library</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              {selectedColumns.length} of {availableColumns.length} columns selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={handleDeselectAll}
                className="text-sm text-slate-600 hover:text-slate-700 font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                Core Columns
                <span className="text-xs font-normal text-slate-500">({coreColumns.length})</span>
              </h3>
              <div className="space-y-2">
                {coreColumns.map((column) => {
                  const isSelected = selectedColumns.includes(column.key);
                  return (
                    <label
                      key={column.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleColumn(column.key)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {isSelected ? (
                            <Eye size={16} className="text-blue-600" />
                          ) : (
                            <EyeOff size={16} className="text-slate-400" />
                          )}
                          <span className="font-medium text-slate-900">{column.label}</span>
                        </div>
                        {column.description && (
                          <p className="text-xs text-slate-500 mt-1">{column.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {metadataColumns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  Metadata Columns
                  <span className="text-xs font-normal text-slate-500">({metadataColumns.length})</span>
                </h3>
                <div className="space-y-2">
                  {metadataColumns.map((column) => {
                    const isSelected = selectedColumns.includes(column.key);
                    return (
                      <label
                        key={column.key}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleColumn(column.key)}
                          className="mt-0.5 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <Eye size={16} className="text-blue-600" />
                            ) : (
                              <EyeOff size={16} className="text-slate-400" />
                            )}
                            <span className="font-medium text-slate-900">{column.label}</span>
                          </div>
                          {column.description && (
                            <p className="text-xs text-slate-500 mt-1">{column.description}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
          >
            Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
