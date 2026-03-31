import { useState } from 'react';
import './Search.css';

interface SearchResult {
  nodeId: string;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  language: string;
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'exact' | 'semantic' | 'hybrid'>('exact');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [activeLanguageFilter, setActiveLanguageFilter] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode: searchType }),
      });

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const getKindColor = (kind: string) => {
    const colors: Record<string, string> = {
      function: 'bg-primary-container text-on-primary-container',
      class: 'bg-secondary-container text-on-secondary-container',
      interface: 'bg-tertiary/10 text-tertiary',
      variable: 'bg-surface-container text-on-surface',
      deprecated: 'bg-error/10 text-error',
    };
    return colors[kind.toLowerCase()] || 'bg-surface-container text-on-surface';
  };

  return (
    <div className="pt-24 pb-12 px-8 max-w-7xl mx-auto">
      {/* Hero Search Section */}
      <header className="mb-16">
        <h1 className="text-on-surface font-headline font-bold text-5xl md:text-[3.5rem] leading-none tracking-tight mb-8">
          Search codebase
        </h1>

        {/* Search Container */}
        <div className="relative group">
          <div className={`search-hero-glow ${focused ? 'focused' : ''}`}></div>
          <div className="relative bg-surface-container-lowest rounded-xl p-2 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="flex-1 flex items-center px-4 gap-3">
              <span className="material-symbols-outlined text-outline-variant">search</span>
              <input
                className="w-full bg-transparent border-none focus:ring-0 text-on-surface placeholder:text-outline-variant font-body text-lg py-3 outline-none"
                placeholder="symbols, functions, classes..."
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-surface-container-low rounded-lg">
              {(['exact', 'semantic', 'hybrid'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setSearchType(type)}
                  className={`px-4 py-2 rounded-md text-[0.6875rem] font-semibold uppercase tracking-wider transition-all ${
                    searchType === type
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-highest'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="primary-gradient px-8 py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-tertiary/20 active:scale-95 transition-all duration-200 disabled:opacity-50"
              style={{ color: 'white' }}
            >
              {searching ? 'Searching...' : 'Query'}
            </button>
          </div>
        </div>
      </header>

      {/* Bento Grid Results */}
      <div className="grid grid-cols-12 gap-6">
        {/* Filter Sidebar */}
        <aside className="col-span-12 lg:col-span-3 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline">
                File Types
              </h3>
              {activeLanguageFilter && (
                <button
                  onClick={() => setActiveLanguageFilter(null)}
                  className="text-[0.625rem] text-tertiary font-semibold uppercase tracking-wider hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-1">
              {results.length > 0 && (
                <>
                  {Array.from(new Set(results.map(r => r.language))).map((lang) => (
                    <div
                      key={lang}
                      onClick={() => setActiveLanguageFilter(activeLanguageFilter === lang ? null : lang)}
                      className={`filter-item flex items-center justify-between p-2 rounded-lg cursor-pointer group transition-colors ${
                        activeLanguageFilter === lang
                          ? 'bg-tertiary/10 border border-tertiary/20'
                          : 'hover:bg-surface-container'
                      }`}
                    >
                      <span className="text-sm font-medium text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-tertiary">code</span>
                        {lang}
                      </span>
                      <span className="text-[0.6875rem] text-outline-variant group-hover:text-outline">
                        {results.filter(r => r.language === lang).length}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline mb-4">
              Project Context
            </h3>
            <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
              <p className="text-[0.875rem] text-on-surface-variant leading-relaxed">
                {activeLanguageFilter
                  ? `Showing ${activeLanguageFilter} results only. Click "Clear" to reset.`
                  : 'Searching across all indexed repositories. Click a language to filter.'}
              </p>
            </div>
          </section>
        </aside>

        {/* Results Canvas */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {results.length === 0 && query && !searching && (
            <div className="text-center py-12 text-on-surface-variant">
              No results found for "{query}"
            </div>
          )}

          {results.length === 0 && !query && (
            <div className="text-center py-12 text-on-surface-variant">
              Enter a search query to find symbols, functions, and classes in your codebase
            </div>
          )}

          {results
            .filter(r => !activeLanguageFilter || r.language === activeLanguageFilter)
            .map((result) => (
            <div
              key={result.nodeId}
              className="search-result-card bg-surface-container-lowest rounded-xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[0.6875rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${getKindColor(result.kind)}`}>
                        {result.kind}
                      </span>
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-outline-variant">
                        {result.filePath}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-on-surface">{result.name}</h2>
                    {result.qualifiedName !== result.name && (
                      <p className="text-sm text-on-surface-variant">{result.qualifiedName}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setBookmarked(prev => {
                        const next = new Set(prev);
                        if (next.has(result.nodeId)) {
                          next.delete(result.nodeId);
                        } else {
                          next.add(result.nodeId);
                        }
                        return next;
                      });
                    }}
                    className="p-1 rounded hover:bg-surface-container transition-colors"
                    title={bookmarked.has(result.nodeId) ? 'Remove bookmark' : 'Bookmark result'}
                  >
                    <span className={`material-symbols-outlined ${
                      bookmarked.has(result.nodeId) ? 'text-tertiary' : 'text-outline-variant hover:text-tertiary'
                    }`}>
                      {bookmarked.has(result.nodeId) ? 'bookmark_added' : 'bookmark'}
                    </span>
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 bg-surface-container-low/50 flex items-center justify-between border-t border-outline-variant/5">
                <span className="text-xs text-outline-variant">
                  Match Confidence: {(result.score * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-outline-variant">
                  Lines {result.lineStart}-{result.lineEnd}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
