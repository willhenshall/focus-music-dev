import { memo, useState, useCallback } from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

export const SearchInput = memo(({ onSearch, placeholder = "Search..." }: SearchInputProps) => {
  const [value, setValue] = useState('');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const handleSubmit = useCallback(() => {
    onSearch(value);
  }, [value, onSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="flex items-center gap-3 flex-1">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={handleSubmit}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap shadow-sm"
      >
        <Search size={18} />
        Search
      </button>
    </div>
  );
});

SearchInput.displayName = 'SearchInput';
