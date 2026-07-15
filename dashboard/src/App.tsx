import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Login from './components/Login';
import Setup from './pages/Setup';
import Repositories from './pages/Repositories';
import Explorer from './pages/Explorer';
import Search from './pages/Search';
import McpSetup from './pages/McpSetup';
import Metrics from './pages/Metrics';
import Memory from './pages/Memory/Memory';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthService } from './lib/auth';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(AuthService.isAuthenticated());

  useEffect(() => {
    // Subscribe to auth changes
    const unsubscribe = AuthService.subscribe(() => {
      setIsAuthenticated(AuthService.isAuthenticated());
    });
    return unsubscribe;
  }, []);

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-surface">
          <Navigation />
          <Routes>
            <Route path="/" element={<Repositories />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/search" element={<Search />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/mcp-setup" element={<McpSetup />} />
            <Route path="/metrics" element={<Metrics />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
