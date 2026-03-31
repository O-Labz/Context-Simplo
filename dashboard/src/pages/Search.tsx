import { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';

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
  const [searchType, setSearchType] = useState<'exact' | 'semantic' | 'hybrid'>('hybrid');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, type: searchType }),
      });

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Search</h1>

      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex space-x-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for symbols, functions, classes..."
              className="w-full px-4 py-2 border border-input rounded-md bg-background"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center space-x-2"
          >
            <SearchIcon className="h-4 w-4" />
            <span>{searching ? 'Searching...' : 'Search'}</span>
          </button>
        </div>

        <div className="flex space-x-4">
          {(['exact', 'semantic', 'hybrid'] as const).map((type) => (
            <label key={type} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                value={type}
                checked={searchType === type}
                onChange={(e) => setSearchType(e.target.value as typeof searchType)}
                className="text-primary"
              />
              <span className="text-sm capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {results.map((result) => (
          <div key={result.nodeId} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold">{result.name}</h3>
                <p className="text-sm text-muted-foreground">{result.qualifiedName}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded">
                  {result.kind}
                </span>
                <span className="px-2 py-1 text-xs bg-accent text-accent-foreground rounded">
                  {result.language}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {result.filePath}:{result.lineStart}-{result.lineEnd}
            </div>
            <div className="mt-2 text-sm">
              Score: {(result.score * 100).toFixed(1)}%
            </div>
          </div>
        ))}

        {results.length === 0 && query && !searching && (
          <div className="text-center py-12 text-muted-foreground">
            No results found for "{query}"
          </div>
        )}
      </div>
    </div>
  );
}
