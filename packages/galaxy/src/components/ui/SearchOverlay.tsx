/**
 * SearchOverlay Component
 * 
 * Search interface for finding tables, fields, and entry points.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

import { useGalaxyStore } from '../../store/index.js';

// ============================================================================
// Component
// ============================================================================

export function SearchOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  
  const { galaxyData, selectTable, selectEntryPoint, focusOnNode } = useGalaxyStore();
  
  // Search results
  const results = useMemo(() => {
    if (!galaxyData || !query.trim()) {return { tables: [], entryPoints: [], fields: [] };}
    
    const q = query.toLowerCase();
    
    const tables = galaxyData.tables
      .filter(t => t.name.toLowerCase().includes(q))
      .slice(0, 5);
    
    const entryPoints = galaxyData.entryPoints
      .filter(e => e.path.toLowerCase().includes(q))
      .slice(0, 5);
    
    const fields = galaxyData.tables
      .flatMap(t => t.fields.map(f => ({ ...f, tableName: t.name })))
      .filter(f => f.name.toLowerCase().includes(q))
      .slice(0, 5);
    
    return { tables, entryPoints, fields };
  }, [galaxyData, query]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, []);
  
  const handleSelect = useCallback((type: 'table' | 'entryPoint', id: string) => {
    if (type === 'table') {
      selectTable(id);
    } else {
      selectEntryPoint(id);
    }
    focusOnNode(id);
    setIsOpen(false);
    setQuery('');
  }, [selectTable, selectEntryPoint, focusOnNode]);
  
  const hasResults = results.tables.length > 0 || results.entryPoints.length > 0 || results.fields.length > 0;
  
  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => { setIsOpen(true); }}
        className="absolute left-4 top-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Search...
        <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-xs">⌘K</kbd>
      </button>

      {/* Search modal */}
      {isOpen && (
        <div className="absolute inset-0 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm z-50">
          <div className="w-full max-w-lg bg-slate-900 rounded-lg border border-slate-700 shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-700">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                placeholder="Search tables, fields, endpoints..."
                className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none"
                autoFocus
              />
              <button onClick={() => { setIsOpen(false); setQuery(''); }} className="text-slate-400 hover:text-white">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-xs">ESC</kbd>
              </button>
            </div>
            
            {/* Results */}
            {query && (
              <div className="max-h-80 overflow-y-auto">
                {!hasResults && (
                  <p className="p-4 text-slate-400 text-center">No results found</p>
                )}
                
                {results.tables.length > 0 && (
                  <ResultSection title="Tables">
                    {results.tables.map(t => (
                      <ResultItem key={t.id} icon="🪐" label={t.name} sublabel={`${t.fields.length} fields`}
                        onClick={() => { handleSelect('table', t.id); }} />
                    ))}
                  </ResultSection>
                )}
                
                {results.entryPoints.length > 0 && (
                  <ResultSection title="Entry Points">
                    {results.entryPoints.map(e => (
                      <ResultItem key={e.id} icon="🛸" label={e.path} sublabel={`${e.method} • ${e.framework}`}
                        onClick={() => { handleSelect('entryPoint', e.id); }} />
                    ))}
                  </ResultSection>
                )}
                
                {results.fields.length > 0 && (
                  <ResultSection title="Fields">
                    {results.fields.map(f => (
                      <ResultItem key={f.id} icon="🌙" label={f.name} sublabel={`${(f as any).tableName} • ${f.dataType}`}
                        onClick={() => { handleSelect('table', f.tableId); }} />
                    ))}
                  </ResultSection>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-800 last:border-0">
      <p className="px-4 py-2 text-xs text-slate-500 uppercase">{title}</p>
      {children}
    </div>
  );
}

function ResultItem({ icon, label, sublabel, onClick }: { icon: string; label: string; sublabel: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-800 text-left transition-colors">
      <span>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white truncate">{label}</p>
        <p className="text-slate-500 text-sm truncate">{sublabel}</p>
      </div>
    </button>
  );
}
