import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Setup from './pages/Setup';
import Repositories from './pages/Repositories';
import Explorer from './pages/Explorer';
import Search from './pages/Search';
import McpSetup from './pages/McpSetup';
import Metrics from './pages/Metrics';
import { Database, Search as SearchIcon, Network, Settings, Activity } from 'lucide-react';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <nav className="border-b border-border bg-card">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Context-Simplo</h1>
              </div>
              <div className="flex items-center space-x-6">
                <Link to="/" className="flex items-center space-x-2 text-sm hover:text-primary">
                  <Database className="h-4 w-4" />
                  <span>Repositories</span>
                </Link>
                <Link to="/search" className="flex items-center space-x-2 text-sm hover:text-primary">
                  <SearchIcon className="h-4 w-4" />
                  <span>Search</span>
                </Link>
                <Link to="/explorer" className="flex items-center space-x-2 text-sm hover:text-primary">
                  <Network className="h-4 w-4" />
                  <span>Explorer</span>
                </Link>
                <Link to="/mcp-setup" className="flex items-center space-x-2 text-sm hover:text-primary">
                  <Settings className="h-4 w-4" />
                  <span>MCP Setup</span>
                </Link>
                <Link to="/metrics" className="flex items-center space-x-2 text-sm hover:text-primary">
                  <Activity className="h-4 w-4" />
                  <span>Metrics</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Repositories />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/search" element={<Search />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/mcp-setup" element={<McpSetup />} />
            <Route path="/metrics" element={<Metrics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
