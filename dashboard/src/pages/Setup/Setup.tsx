import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Setup.css';

const PROVIDERS = [
  {
    id: 'none',
    name: 'None',
    description: 'Structural tools only, no embeddings',
    icon: 'block',
    requiresApiKey: false,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local LLM with privacy',
    icon: 'computer',
    requiresApiKey: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models with embeddings',
    icon: 'psychology',
    requiresApiKey: true,
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'Enterprise OpenAI deployment',
    icon: 'cloud',
    requiresApiKey: true,
  },
];

export default function Setup() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<string>('ollama');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('http://host.docker.internal:11434');
  const [model, setModel] = useState<string>('nomic-embed-text');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        const cfg = data.config || {};
        if (cfg.llmProvider) setProvider(cfg.llmProvider);
        if (cfg.llmBaseUrl) setBaseUrl(cfg.llmBaseUrl);
        if (cfg.llmEmbeddingModel) setModel(cfg.llmEmbeddingModel);
      })
      .catch((err) => console.error('Failed to load config:', err));
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/config/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      });

      if (response.ok) {
        setTestResult('success');
      } else {
        const error = await response.text();
        setTestResult(`error: ${error}`);
      }
    } catch (error) {
      setTestResult(`error: ${(error as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llmProvider: provider,
          llmApiKey: apiKey || undefined,
          llmBaseUrl: baseUrl || undefined,
          llmEmbeddingModel: model || undefined,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Save failed' }));
        console.error('Failed to save config:', errData);
      }
      navigate('/');
    } catch (error) {
      console.error('Failed to save config:', error);
    } finally {
      setSaving(false);
    }
  };

  const selectedProvider = PROVIDERS.find(p => p.id === provider);

  return (
    <div className="pt-24 pb-12 px-8 max-w-[1200px] mx-auto">
      {/* Header Section */}
      <header className="mb-12">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-tertiary mb-2 block">
          System Configuration
        </span>
        <h1 className="text-4xl font-bold text-on-surface tracking-tight mb-4">
          LLM Provider Setup
        </h1>
        <p className="text-on-surface-variant text-[1rem] max-w-2xl">
          Configure your embedding provider for semantic search and code intelligence features.
          Choose a provider that fits your privacy and performance requirements.
        </p>
      </header>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Provider Selection */}
        <div className="lg:col-span-12">
          <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-4">
            Select Provider
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                onClick={() => setProvider(p.id)}
                className={`provider-card p-6 rounded-xl border-2 transition-all ${
                  provider === p.id
                    ? 'selected'
                    : 'border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/40'
                }`}
              >
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`provider-icon w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                      provider === p.id ? '' : 'bg-surface-container'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-2xl ${
                        provider === p.id ? '' : 'text-on-surface'
                      }`}
                    >
                      {p.icon}
                    </span>
                  </div>
                  <h3 className="provider-name font-bold text-lg mb-1">{p.name}</h3>
                  <p
                    className={`provider-description text-[0.8125rem] ${
                      provider === p.id ? '' : 'text-on-surface-variant'
                    }`}
                  >
                    {p.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Configuration Form */}
        {provider !== 'none' && (
          <>
            <div className="lg:col-span-8 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6">
                Connection Settings
              </h2>
              <div className="space-y-6">
                {selectedProvider?.requiresApiKey && (
                  <div>
                    <label className="block text-sm font-semibold text-on-surface mb-2">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="config-input w-full px-4 py-3 border-2 border-outline-variant/20 rounded-lg bg-surface focus:outline-none"
                    />
                    <p className="text-[0.75rem] text-on-surface-variant mt-1">
                      Your API key is stored securely and never shared
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://host.docker.internal:11434"
                    className="config-input w-full px-4 py-3 border-2 border-outline-variant/20 rounded-lg bg-surface focus:outline-none"
                  />
                  <p className="text-[0.75rem] text-on-surface-variant mt-1">
                    The endpoint URL for your {selectedProvider?.name} instance
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface mb-2">
                    Embedding Model
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="nomic-embed-text"
                    className="config-input w-full px-4 py-3 border-2 border-outline-variant/20 rounded-lg bg-surface focus:outline-none"
                  />
                  <p className="text-[0.75rem] text-on-surface-variant mt-1">
                    The model to use for generating embeddings
                  </p>
                </div>

                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="test-button w-full px-6 py-3 bg-surface-container-high text-on-surface text-[0.875rem] font-semibold rounded-lg hover:bg-surface-container-highest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {testing ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">refresh</span>
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">cable</span>
                      Test Connection
                    </>
                  )}
                </button>

                {testResult && (
                  <div
                    className={`status-indicator p-4 rounded-lg border-l-4 ${
                      testResult === 'success'
                        ? 'bg-green-50 border-green-500'
                        : 'bg-error/10 border-error'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`material-symbols-outlined ${
                          testResult === 'success' ? 'text-green-600' : 'text-error'
                        }`}
                      >
                        {testResult === 'success' ? 'check_circle' : 'error'}
                      </span>
                      <div>
                        <p
                          className={`font-semibold text-sm ${
                            testResult === 'success' ? 'text-green-900' : 'text-error'
                          }`}
                        >
                          {testResult === 'success'
                            ? 'Connection Successful'
                            : 'Connection Failed'}
                        </p>
                        {testResult !== 'success' && (
                          <p className="text-[0.8125rem] text-error/80 mt-1">
                            {testResult.replace('error: ', '')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Status Card */}
            <div className="lg:col-span-4 bg-surface-container-low p-8 rounded-xl flex flex-col">
              <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6">
                Current Status
              </h2>
              <div className="flex-grow flex flex-col justify-center gap-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      testResult === 'success' ? 'bg-green-500 pulse-ring' : 'bg-outline-variant'
                    }`}
                  ></div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      {testResult === 'success' ? 'Connected' : 'Not Connected'}
                    </p>
                    <p className="text-[0.75rem] text-on-surface-variant">
                      {selectedProvider?.name}
                    </p>
                  </div>
                </div>
                {testResult === 'success' && (
                  <div className="p-4 bg-surface-container-lowest rounded-lg">
                    <p className="text-[0.75rem] text-on-surface-variant mb-2">Model</p>
                    <p className="text-sm font-mono font-semibold text-on-surface">{model}</p>
                  </div>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full mt-6 px-6 py-3 primary-gradient text-white text-[0.875rem] font-semibold rounded-lg hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">refresh</span>
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">save</span>
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {provider === 'none' && (
          <div className="lg:col-span-12 bg-surface-container-low p-8 rounded-xl text-center">
            <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">
              info
            </span>
            <h3 className="text-xl font-bold text-on-surface mb-2">
              No Provider Selected
            </h3>
            <p className="text-on-surface-variant mb-6 max-w-xl mx-auto">
              Without an LLM provider, you'll have access to structural code analysis tools but
              semantic search and embeddings will be disabled.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-surface-container-highest text-on-surface text-[0.875rem] font-semibold rounded-lg hover:bg-surface-container-high transition-all"
            >
              Continue Without Provider
            </button>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-tertiary/5 border-l-4 border-tertiary p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-tertiary">lightbulb</span>
          <div>
            <p className="text-sm font-semibold text-on-surface mb-1">Pro Tip</p>
            <p className="text-[0.8125rem] text-on-surface-variant">
              For the best privacy and performance, we recommend using Ollama locally. It's free,
              runs entirely on your machine, and provides excellent embedding quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
