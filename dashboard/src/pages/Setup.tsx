import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Setup() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<string>('ollama');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('http://host.docker.internal:11434');
  const [model, setModel] = useState<string>('nomic-embed-text');
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      });

      if (response.ok) {
        setTestResult('Connection successful!');
      } else {
        const error = await response.text();
        setTestResult(`Connection failed: ${error}`);
      }
    } catch (error) {
      setTestResult(`Connection failed: ${(error as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, baseUrl, model }),
      });
      navigate('/');
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Setup LLM Provider</h1>

      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
          >
            <option value="none">None (structural tools only)</option>
            <option value="ollama">Ollama (local)</option>
            <option value="openai">OpenAI</option>
            <option value="azure">Azure OpenAI</option>
          </select>
        </div>

        {provider !== 'none' && (
          <>
            {(provider === 'openai' || provider === 'azure') && (
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-input rounded-md bg-background"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://host.docker.internal:11434"
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Embedding Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="nomic-embed-text"
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              />
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            {testResult && (
              <div
                className={`p-3 rounded-md ${
                  testResult.includes('successful')
                    ? 'bg-green-100 text-green-900'
                    : 'bg-red-100 text-red-900'
                }`}
              >
                {testResult}
              </div>
            )}
          </>
        )}

        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
}
