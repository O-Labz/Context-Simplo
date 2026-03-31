import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<string>('none');

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        const cfg = data.config || {};
        setCurrentProvider(cfg.llmProvider || 'none');
      })
      .catch(() => setCurrentProvider('none'));
  }, []);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: '/', label: 'Repositories' },
    { path: '/search', label: 'Search' },
    { path: '/explorer', label: 'Explorer' },
    { path: '/mcp-setup', label: 'MCP Setup' },
    { path: '/metrics', label: 'Metrics' },
  ];

  return (
    <nav className="bg-surface fixed top-0 z-50 w-full px-8 h-16 flex justify-between items-center border-b border-outline-variant/20 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-on-surface">Context-Simplo</span>
        </Link>
        <div className="hidden md:flex gap-6 items-center">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`font-label text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors ${
                isActive(item.path)
                  ? 'text-tertiary border-b-2 border-tertiary pb-1'
                  : 'text-on-surface-variant hover:text-tertiary'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* Mobile hamburger */}
        <button
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="md:hidden p-2 rounded-lg hover:bg-surface-container transition-all duration-200 active:scale-95"
        >
          <span className="material-symbols-outlined text-on-surface-variant">
            {showMobileMenu ? 'close' : 'menu'}
          </span>
        </button>

        <div className="relative">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-surface-container transition-all duration-200 active:scale-95"
          >
            <span className="material-symbols-outlined text-on-surface-variant">settings</span>
          </button>
          
          {showSettings && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSettings(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/20 py-2 z-50">
                <div className="px-4 py-2 border-b border-outline-variant/20">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    LLM Provider
                  </p>
                </div>
                <div className="px-2 py-2">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container">
                    <span className="text-sm text-on-surface font-medium">
                      {currentProvider === 'none' ? 'Not configured' : currentProvider}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${
                      currentProvider === 'none' ? 'bg-outline-variant' : 'bg-green-500'
                    }`} />
                  </div>
                  <Link
                    to="/setup"
                    className="block px-3 py-2 text-sm text-tertiary font-medium hover:bg-surface-container rounded-lg mt-1 transition-colors"
                    onClick={() => setShowSettings(false)}
                  >
                    Configure Provider
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="p-2 rounded-lg hover:bg-surface-container transition-all duration-200 active:scale-95"
          title="Account & Setup"
        >
          <span className="material-symbols-outlined text-on-surface-variant">account_circle</span>
        </button>
      </div>

      {/* Mobile menu overlay */}
      {showMobileMenu && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setShowMobileMenu(false)} />
          <div className="fixed top-16 left-0 right-0 bg-surface border-b border-outline-variant/20 shadow-lg z-50 md:hidden">
            <div className="flex flex-col py-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-8 py-3 text-sm font-semibold uppercase tracking-wider transition-colors ${
                    isActive(item.path)
                      ? 'text-tertiary bg-tertiary/5'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
