import { useState, FormEvent } from 'react';
import { AuthService } from '../lib/auth';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter a token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Test the token by calling the health endpoint
      const response = await fetch('/api/health', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      });

      if (response.ok) {
        // Token is valid
        AuthService.setToken(token.trim());
        onLogin();
      } else if (response.status === 401) {
        setError('Invalid token. Please check and try again.');
      } else {
        setError(`Authentication failed: ${response.statusText}`);
      }
    } catch (err) {
      setError('Network error. Unable to reach the server.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-2xl border border-outline-variant/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 primary-gradient rounded-2xl flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-white text-[32px]">
                lock
              </span>
            </div>
            <h1 className="text-2xl font-bold text-on-surface mb-2">
              Context-Simplo Dashboard
            </h1>
            <p className="text-sm text-on-surface-variant">
              Enter your authentication token to continue
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="token" className="block text-sm font-semibold text-on-surface mb-2">
                Authentication Token
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-[18px] text-outline absolute left-3 top-1/2 -translate-y-1/2">
                  key
                </span>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your AUTH_TOKEN"
                  className="w-full pl-10 pr-4 py-3 text-sm text-on-surface bg-surface-container border border-outline-variant/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-tertiary/40 focus:border-tertiary transition-all font-mono"
                  autoFocus
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/20 rounded-xl p-3 flex gap-2">
                <span className="material-symbols-outlined text-error text-[18px] shrink-0">
                  error
                </span>
                <p className="text-xs text-error font-medium">
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full px-6 py-3 primary-gradient font-semibold text-sm rounded-xl shadow-lg shadow-tertiary/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
              style={{ color: 'white' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Info Section */}
          <div className="mt-6 bg-surface-container rounded-xl p-4">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-[18px] text-tertiary shrink-0">
                info
              </span>
              <div className="text-xs text-on-surface-variant leading-relaxed">
                <p className="mb-2">
                  <strong className="text-on-surface">Where to find your token:</strong>
                </p>
                <p className="mb-1">
                  Check the <code className="px-1 py-0.5 bg-surface-container-high rounded text-on-surface font-mono">AUTH_TOKEN</code> environment variable used to start the server.
                </p>
                <p>
                  If running via Docker: <code className="px-1 py-0.5 bg-surface-container-high rounded text-on-surface font-mono">docker run -e AUTH_TOKEN=your-token-here ...</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
