import { useState } from 'react';
import { X, Plus, Trash2, Search } from 'lucide-react';

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'is_null'
  | 'is_not_null';

export type FilterField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date';
  category: 'core' | 'metadata' | 'analytics';
};

export type SearchFilter = {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string;
};

const FILTER_FIELDS: FilterField[] = [
  { key: 'global_search', label: '🔍 Global Text Search (All Fields)', type: 'text', category: 'core' },
  { key: 'track_id', label: 'Track ID', type: 'text', category: 'core' },
  { key: 'energy_level', label: 'Energy Level', type: 'text', category: 'core' },
  { key: 'created_at', label: 'Created Date', type: 'date', category: 'core' },
  { key: 'speed', label: 'Speed', type: 'number', category: 'core' },
  { key: 'intensity', label: 'Intensity', type: 'number', category: 'core' },
  { key: 'brightness', label: 'Brightness', type: 'number', category: 'core' },
  { key: 'complexity', label: 'Complexity', type: 'number', category: 'core' },
  { key: 'valence', label: 'Valence', type: 'number', category: 'core' },
  { key: 'arousal', label: 'Arousal', type: 'number', category: 'core' },
  { key: 'tempo', label: 'Tempo (BPM)', type: 'number', category: 'core' },
  { key: 'music_key_value', label: 'Key', type: 'number', category: 'core' },
  { key: 'catalog', label: 'Catalog', type: 'text', category: 'core' },
  { key: 'duration', label: 'Duration (seconds)', type: 'number', category: 'core' },
  { key: 'energy_set', label: 'Energy Set', type: 'number', category: 'core' },
  { key: 'energy_low', label: 'Energy Metadata: Low', type: 'text', category: 'core' },
  { key: 'energy_medium', label: 'Energy Metadata: Medium', type: 'text', category: 'core' },
  { key: 'energy_high', label: 'Energy Metadata: High', type: 'text', category: 'core' },
  { key: 'locked', label: 'Locked', type: 'text', category: 'core' },
  { key: 'is_preview', label: 'Is Preview', type: 'text', category: 'core' },
  { key: 'track_name', label: 'Track Name', type: 'text', category: 'metadata' },
  { key: 'artist_name', label: 'Artist Name', type: 'text', category: 'metadata' },
  { key: 'album_name', label: 'Album Name', type: 'text', category: 'metadata' },
  { key: 'album', label: 'Album', type: 'text', category: 'metadata' },
  { key: 'genre', label: 'Genre', type: 'text', category: 'metadata' },
  { key: 'genre_category', label: 'Genre Category', type: 'text', category: 'metadata' },
  { key: 'version', label: 'Version', type: 'text', category: 'metadata' },
  { key: 'bpm', label: 'BPM (metadata)', type: 'text', category: 'metadata' },
  { key: 'energy', label: 'Energy (metadata)', type: 'text', category: 'metadata' },
  { key: 'rating', label: 'Rating', type: 'text', category: 'metadata' },
  { key: 'spotify_uri', label: 'Spotify URI', type: 'text', category: 'metadata' },
  { key: 'file_name', label: 'File Name', type: 'text', category: 'metadata' },
  { key: 'file_format', label: 'File Format', type: 'text', category: 'metadata' },
  { key: 'file_size', label: 'File Size', type: 'text', category: 'metadata' },
  { key: 'channels', label: 'Channels (array)', type: 'text', category: 'metadata' },
  { key: 'channel_ids', label: 'Channel IDs (array)', type: 'text', category: 'metadata' },
  { key: 'genre_is_labs', label: 'Genre Is Labs', type: 'text', category: 'metadata' },
  { key: 'source', label: 'Source', type: 'text', category: 'metadata' },
  { key: 'file_id', label: 'File ID', type: 'text', category: 'metadata' },
  { key: 'track_number', label: 'Track Number', type: 'text', category: 'metadata' },
  { key: 'year', label: 'Year', type: 'text', category: 'metadata' },
  { key: 'comment', label: 'Comment', type: 'text', category: 'metadata' },
  { key: 'isrc', label: 'ISRC', type: 'text', category: 'metadata' },
  { key: 'upc', label: 'UPC', type: 'text', category: 'metadata' },
  { key: 'label', label: 'Label', type: 'text', category: 'metadata' },
  { key: 'publisher', label: 'Publisher', type: 'text', category: 'metadata' },
  { key: 'composer', label: 'Composer', type: 'text', category: 'metadata' },
  { key: 'total_plays', label: 'Total Plays', type: 'number', category: 'analytics' },
  { key: 'total_skips', label: 'Total Skips', type: 'number', category: 'analytics' },
  { key: 'plays_last_7_days', label: 'Plays (Last 7 Days)', type: 'number', category: 'analytics' },
  { key: 'plays_last_30_days', label: 'Plays (Last 30 Days)', type: 'number', category: 'analytics' },
  { key: 'skips_last_7_days', label: 'Skips (Last 7 Days)', type: 'number', category: 'analytics' },
  { key: 'skips_last_30_days', label: 'Skips (Last 30 Days)', type: 'number', category: 'analytics' },
  { key: 'unique_listeners', label: 'Unique Listeners', type: 'number', category: 'analytics' },
  { key: 'average_completion_rate', label: 'Avg Completion Rate (%)', type: 'number', category: 'analytics' },
  { key: 'last_played_at', label: 'Last Played', type: 'date', category: 'analytics' },
];

const TEXT_OPERATORS: FilterOperator[] = ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null'];
const NUMBER_OPERATORS: FilterOperator[] = ['equals', 'not_equals', 'greater_than', 'less_than', 'between', 'is_null', 'is_not_null'];
const DATE_OPERATORS: FilterOperator[] = ['equals', 'not_equals', 'greater_than', 'less_than', 'between'];

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  not_contains: 'Does Not Contain',
  starts_with: 'Starts With',
  ends_with: 'Ends With',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
  between: 'Between',
  is_null: 'Is Empty',
  is_not_null: 'Is Not Empty',
};

const PRESET_VALUES: Record<string, string[]> = {
  energy_level: ['low', 'medium', 'high'],
  energy_low: ['true', 'false'],
  energy_medium: ['true', 'false'],
  energy_high: ['true', 'false'],
  locked: ['true', 'false'],
  is_preview: ['true', 'false'],
  genre_category: ['A.D.D.J.', 'Acoustical Plus', 'ADHD Type 1', 'Alpha Chill', 'Ambient', 'Baroque Piano', 'Cafe Creative', 'Cafe Focus', 'Cinematic', 'Classical Piano', 'Classical Plus', 'Deep Space', 'Disco', 'Drum Zone', 'Drum Zone Turbo', 'Drums & Hums', 'Drums & Hums Turbo', 'Electro Bach', 'Focus Spa', 'Hand Drums & Hums', 'Hand Drums & Hums Turbo', 'Jungle', 'Kora', 'Lofi', 'Naturebeat', 'Noise', 'Propeller Drone', 'Trance', 'Uptempo', 'Water', 'Zen Piano'],
  file_format: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'],
  source: ['google_drive_external'],
};

interface AdvancedSearchModalProps {
  onClose: () => void;
  onSearch: (filters: SearchFilter[]) => void;
  initialFilters?: SearchFilter[];
}

export function AdvancedSearchModal({ onClose, onSearch, initialFilters = [] }: AdvancedSearchModalProps) {
  const [filters, setFilters] = useState<SearchFilter[]>(
    initialFilters.length > 0 ? initialFilters : [createEmptyFilter()]
  );

  function createEmptyFilter(): SearchFilter {
    return {
      id: Math.random().toString(36).substring(7),
      field: 'global_search',
      operator: 'contains',
      value: '',
    };
  }

  const addFilter = () => {
    setFilters([...filters, createEmptyFilter()]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<SearchFilter>) => {
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleFieldChange = (id: string, field: string) => {
    const fieldDef = FILTER_FIELDS.find(f => f.key === field);
    if (!fieldDef) return;

    const defaultOperator = fieldDef.type === 'text' ? 'contains' : 'equals';
    updateFilter(id, { field, operator: defaultOperator, value: '', value2: undefined });
  };

  const getOperatorsForField = (field: string): FilterOperator[] => {
    const fieldDef = FILTER_FIELDS.find(f => f.key === field);
    if (!fieldDef) return TEXT_OPERATORS;

    switch (fieldDef.type) {
      case 'number':
        return NUMBER_OPERATORS;
      case 'date':
        return DATE_OPERATORS;
      default:
        return TEXT_OPERATORS;
    }
  };

  const getFieldType = (field: string): 'text' | 'number' | 'date' => {
    return FILTER_FIELDS.find(f => f.key === field)?.type || 'text';
  };

  const hasPresetValues = (field: string): boolean => {
    return field in PRESET_VALUES;
  };

  const getPresetValues = (field: string): string[] => {
    return PRESET_VALUES[field] || [];
  };

  const needsValue = (operator: FilterOperator) => {
    return operator !== 'is_null' && operator !== 'is_not_null';
  };

  const needsSecondValue = (operator: FilterOperator) => {
    return operator === 'between';
  };

  const handleSearch = () => {
    const validFilters = filters.filter(f => {
      if (f.operator === 'is_null' || f.operator === 'is_not_null') return true;
      if (f.operator === 'between') return f.value && f.value2;
      return f.value;
    });

    onSearch(validFilters);
  };

  const handleClear = () => {
    setFilters([createEmptyFilter()]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[calc(90vh-6rem)] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Advanced Search</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-900 font-medium mb-1">💡 Quick Tip: Global Text Search</p>
            <p className="text-sm text-slate-600">
              Use "Global Text Search" to search across all metadata fields at once (track name, artist, album, genre, catalog, etc.). Or build specific filters for precise results.
            </p>
          </div>
          <div className="text-sm text-slate-600 mb-4">
            Build complex queries by combining multiple filters. All filters must match (AND logic).
          </div>

          {filters.map((filter, index) => (
            <div key={filter.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Filter {index + 1}</span>
                {filters.length > 1 && (
                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg p-1.5 transition-colors"
                    title="Remove filter"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Field
                  </label>
                  <select
                    value={filter.field}
                    onChange={(e) => handleFieldChange(filter.id, e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <optgroup label="Core Fields">
                      {FILTER_FIELDS.filter(f => f.category === 'core').map(field => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Metadata Fields">
                      {FILTER_FIELDS.filter(f => f.category === 'metadata').map(field => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Analytics">
                      {FILTER_FIELDS.filter(f => f.category === 'analytics').map(field => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Operator
                  </label>
                  <select
                    value={filter.operator}
                    onChange={(e) => updateFilter(filter.id, { operator: e.target.value as FilterOperator })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {getOperatorsForField(filter.field).map(op => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  {needsValue(filter.operator) && (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Value
                      </label>
                      {hasPresetValues(filter.field) && (filter.operator === 'equals' || filter.operator === 'not_equals') ? (
                        <select
                          value={filter.value}
                          onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select value...</option>
                          {getPresetValues(filter.field).map(val => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={getFieldType(filter.field) === 'date' ? 'datetime-local' : getFieldType(filter.field)}
                          value={filter.value}
                          onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSearch();
                            }
                          }}
                          placeholder={filter.field === 'global_search' ? 'Search across all metadata fields...' : 'Enter value...'}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              {needsSecondValue(filter.operator) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-start-3">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      To
                    </label>
                    <input
                      type={getFieldType(filter.field) === 'date' ? 'datetime-local' : getFieldType(filter.field)}
                      value={filter.value2 || ''}
                      onChange={(e) => updateFilter(filter.id, { value2: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSearch();
                        }
                      }}
                      placeholder="Enter end value..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={addFilter}
            className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-300"
          >
            <Plus className="w-4 h-4" />
            Add Filter
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Clear All
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
