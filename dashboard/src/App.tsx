import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Setup from './pages/Setup';
import Repositories from './pages/Repositories';
import Explorer from './pages/Explorer';
import Search from './pages/Search';
import McpSetup from './pages/McpSetup';
import Metrics from './pages/Metrics';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-surface">
        <Navigation />
        <Routes>
          <Route path="/" element={<Repositories />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/search" element={<Search />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/mcp-setup" element={<McpSetup />} />
          <Route path="/metrics" element={<Metrics />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
