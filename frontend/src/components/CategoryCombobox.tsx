import React, { useState, useMemo } from 'react';

interface CategoryComboboxProps {
  value: string;
  onChange: (val: string) => void;
  onAskAi?: () => void;
  aiLoading?: boolean;
  categories: string[];
}

export const CategoryCombobox: React.FC<CategoryComboboxProps> = ({
  value,
  onChange,
  onAskAi,
  aiLoading = false,
  categories
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setSearch(value);
  }, [value]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch(value);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return categories;
    return categories.filter(c => c.toLowerCase().includes(term));
  }, [search, categories]);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch(val);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const trimmed = search.trim();
      if (trimmed) {
        handleSelect(trimmed);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[200px]" onClick={e => e.stopPropagation()}>
      <div className={`flex items-center gap-1.5 bg-white border rounded-xl px-2.5 py-1.5 transition ${value === 'Uncategorized' ? 'border-rose-400 hover:border-rose-500' : 'border-slate-200 hover:border-slate-300'}`}>
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={`text-[11px] font-extrabold focus:outline-none min-w-0 flex-grow bg-transparent placeholder-slate-400 ${value === 'Uncategorized' ? 'text-rose-500' : 'text-slate-800'}`}
          placeholder="Type or select..."
        />
        {search.trim() !== '' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSearch('');
            }}
            title="Clear category"
            className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-slate-500 hover:text-slate-700 transition flex-shrink-0"
          >
            <span className="material-icons text-[9px] leading-none">close</span>
          </button>
        )}
        {onAskAi && (
          aiLoading ? (
            <span className="material-icons text-slate-400 text-[10px] animate-spin">sync</span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAskAi();
              }}
              title="Ask AI to categorize"
              className="text-slate-400 hover:text-emerald-600 transition flex items-center cursor-pointer"
            >
              <span className="material-icons text-xs">auto_awesome</span>
            </button>
          )
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-2xl py-1.5 max-h-48 overflow-y-auto z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          {filtered.map(cat => (
            <button
              key={cat}
              onClick={() => handleSelect(cat)}
              className={`w-full text-left px-3.5 py-1.5 text-xs font-semibold transition hover:bg-slate-50 ${cat === value ? 'text-slate-900 font-black bg-slate-50' : 'text-slate-600'
                }`}
            >
              {cat}
            </button>
          ))}

          {search.trim() && !categories.some(c => c.toLowerCase() === search.toLowerCase().trim()) && (
            <button
              onClick={() => handleSelect(search.trim())}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-400 hover:bg-slate-50 border-t border-slate-100 italic flex items-center gap-1"
            >
              <span className="material-icons text-[11px]">add</span>
              <span>Use Custom: "{search.trim()}"</span>
            </button>
          )}

          {/* Ask AI to classify option - positioned at the end of the list */}
          {onAskAi && (
            <button
              onClick={() => {
                onAskAi();
                setIsOpen(false);
              }}
              disabled={aiLoading}
              className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-1.5 border-t border-slate-100"
            >
              <span className="material-icons text-[11px] animate-pulse">auto_awesome</span>
              <span>Ask AI to classify this...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
