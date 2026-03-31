import { useState, useEffect } from 'react';
import './McpSetup.css';

interface IdeConfig {
  ide: string;
  config: object;
  configPath: string;
  instructions: string;
  error?: string;
}

const IDE_METADATA: Record<string, { name: string; icon: string; iconColor: string; iconBg: string }> = {
  cursor: {
    name: 'Cursor',
    icon: 'target',
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
  },
  vscode: {
    name: 'VS Code',
    icon: 'code',
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    icon: 'smart_toy',
    iconColor: 'text-white',
    iconBg: 'bg-on-surface',
  },
  'claude-code': {
    name: 'Claude Code',
    icon: 'terminal',
    iconColor: 'text-white',
    iconBg: 'bg-slate-900',
  },
};

export default function McpSetup() {
  const [copiedIde, setCopiedIde] = useState<string | null>(null);
  const [configs, setConfigs] = useState<IdeConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch configs from API
    fetch('/api/mcp-config')
      .then(res => res.json())
      .then(data => {
        setConfigs(data.configs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load MCP configs:', err);
        setLoading(false);
      });
  }, []);

  const handleCopy = async (ide: string, config: object) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopiedIde(ide);
      setTimeout(() => setCopiedIde(null), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = JSON.stringify(config, null, 2);
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedIde(ide);
        setTimeout(() => setCopiedIde(null), 2000);
      } catch {
        console.error('Failed to copy to clipboard');
      }
      document.body.removeChild(textarea);
    }
  };

  if (loading) {
    return (
      <div className="pt-24 pb-16 px-8 max-w-7xl mx-auto">
        <div className="text-center py-12">Loading configurations...</div>
      </div>
    );
  }

  const vscodeConfig = configs.find(c => c.ide === 'vscode');
  const claudeDesktopConfig = configs.find(c => c.ide === 'claude-desktop');
  const cursorConfig = configs.find(c => c.ide === 'cursor');
  const claudeCodeConfig = configs.find(c => c.ide === 'claude-code');

  return (
    <div className="pt-24 pb-16 px-8 max-w-7xl mx-auto">
      {/* Header Section */}
      <section className="mb-12">
        <div className="flex flex-col gap-2">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-tertiary">
            Environment Configuration
          </span>
          <h1 className="text-[2.5rem] md:text-[3.5rem] font-bold tracking-tight text-on-surface leading-tight">
            MCP IDE Setup
          </h1>
          <p className="text-on-surface-variant max-w-2xl text-[1rem]">
            Configure your development environment to leverage Model Context Protocol (MCP) servers
            across your favorite editors and tools.
          </p>
        </div>
      </section>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* VS Code Setup (Primary Focus) */}
        {vscodeConfig && (
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/20 shadow-sm config-card">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl ${IDE_METADATA.vscode.iconBg} flex items-center justify-center shadow-sm`}>
                  <span className={`material-symbols-outlined text-2xl ${IDE_METADATA.vscode.iconColor}`}>
                    {IDE_METADATA.vscode.icon}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">{IDE_METADATA.vscode.name}</h2>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Extension Configuration
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleCopy('vscode', vscodeConfig.config)}
                className="px-4 py-2.5 rounded-lg text-[0.875rem] font-semibold active:scale-[0.98] transition-all flex items-center gap-2 shadow-md copy-button"
                style={{ backgroundColor: '#0048e2', color: 'white' }}
              >
                <span className="material-symbols-outlined text-lg">
                  {copiedIde === 'vscode' ? 'check' : 'content_copy'}
                </span>
                {copiedIde === 'vscode' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[0.875rem] text-on-surface-variant mb-4">{vscodeConfig.instructions}</p>
                <div className="bg-surface-container rounded-xl p-5 font-mono text-[0.8125rem] border border-outline-variant/20 overflow-x-auto">
                  <pre className="text-on-surface code-snippet">
                    {JSON.stringify(vscodeConfig.config, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Claude Desktop (Secondary Focus) */}
        {claudeDesktopConfig && (
          <div className="lg:col-span-5 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/20 flex flex-col config-card shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl ${IDE_METADATA['claude-desktop'].iconBg} flex items-center justify-center shadow-sm`}>
                  <span className={`material-symbols-outlined text-2xl ${IDE_METADATA['claude-desktop'].iconColor}`}>
                    {IDE_METADATA['claude-desktop'].icon}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">{IDE_METADATA['claude-desktop'].name}</h2>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Native Integration
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[0.875rem] text-on-surface-variant mb-4">
              Edit your{' '}
              <code className="bg-surface-container px-2 py-1 rounded text-xs font-mono text-on-surface border border-outline-variant/20">
                {claudeDesktopConfig.configPath}
              </code>
              :
            </p>
            <div className="bg-surface-container rounded-xl p-5 font-mono text-[0.8125rem] border border-outline-variant/20 flex-grow overflow-x-auto">
              <pre className="text-on-surface leading-relaxed code-snippet">
                {JSON.stringify(claudeDesktopConfig.config, null, 2)}
              </pre>
            </div>
            <button
              onClick={() => handleCopy('claude-desktop', claudeDesktopConfig.config)}
              className="mt-6 w-full py-3 rounded-lg font-semibold text-[0.875rem] flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all copy-button"
              style={{ backgroundColor: '#0048e2', color: 'white' }}
            >
              <span className="material-symbols-outlined text-lg">
                {copiedIde === 'claude-desktop' ? 'check' : 'content_copy'}
              </span>
              {copiedIde === 'claude-desktop' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {/* Cursor Setup */}
        {cursorConfig && (
          <div className="lg:col-span-6 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/20 shadow-sm config-card">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl ${IDE_METADATA.cursor.iconBg} flex items-center justify-center shadow-sm`}>
                  <span className={`material-symbols-outlined text-2xl ${IDE_METADATA.cursor.iconColor}`}>
                    {IDE_METADATA.cursor.icon}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">{IDE_METADATA.cursor.name}</h2>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    AI IDE Integration
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleCopy('cursor', cursorConfig.config)}
                className="px-4 py-2.5 rounded-lg text-[0.875rem] font-semibold active:scale-[0.98] transition-all flex items-center gap-2 shadow-md shrink-0 copy-button"
                style={{ backgroundColor: '#0048e2', color: 'white' }}
              >
                <span className="material-symbols-outlined text-lg">
                  {copiedIde === 'cursor' ? 'check' : 'content_copy'}
                </span>
                Copy
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-[0.875rem] text-on-surface-variant">{cursorConfig.instructions}</p>
              <div className="bg-surface-container rounded-xl p-5 font-mono text-[0.8125rem] border border-outline-variant/20 overflow-x-auto">
                <pre className="text-on-surface code-snippet">
                  {JSON.stringify(cursorConfig.config, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Claude Code (CLI) */}
        {claudeCodeConfig && (
          <div className="lg:col-span-6 bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/20 shadow-sm config-card">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl ${IDE_METADATA['claude-code'].iconBg} flex items-center justify-center shadow-sm`}>
                  <span className={`material-symbols-outlined text-2xl ${IDE_METADATA['claude-code'].iconColor}`}>
                    {IDE_METADATA['claude-code'].icon}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">{IDE_METADATA['claude-code'].name}</h2>
                  <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-on-surface-variant">
                    CLI Tooling
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleCopy('claude-code', claudeCodeConfig.config)}
                className="px-4 py-2.5 rounded-lg text-[0.875rem] font-semibold active:scale-[0.98] transition-all flex items-center gap-2 shadow-md shrink-0 copy-button"
                style={{ backgroundColor: '#0048e2', color: 'white' }}
              >
                <span className="material-symbols-outlined text-lg">
                  {copiedIde === 'claude-code' ? 'check' : 'content_copy'}
                </span>
                Copy
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-[0.875rem] text-on-surface-variant">{claudeCodeConfig.instructions}</p>
              <div className="bg-surface-container rounded-xl p-5 font-mono text-[0.8125rem] border border-outline-variant/20 overflow-x-auto">
                <pre className="text-on-surface code-snippet">
                  {JSON.stringify(claudeCodeConfig.config, null, 2)}
                </pre>
              </div>
              <div className="mt-4 p-4 rounded-xl bg-tertiary/10 border border-tertiary/20">
                <p className="text-[0.75rem] text-tertiary font-bold uppercase tracking-wider mb-1">PRO TIP</p>
                <p className="text-[0.8125rem] text-on-surface">
                  Ensure your environment variables are set in your{' '}
                  <code className="font-mono text-[0.75rem] bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/20">.zshrc</code> or{' '}
                  <code className="font-mono text-[0.75rem] bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/20">.bashrc</code> for persistent CLI access.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Support Section */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 bg-surface-container-low rounded-xl support-card">
          <span className="material-symbols-outlined text-tertiary mb-3 block">auto_awesome</span>
          <h3 className="text-sm font-bold mb-2">Auto-Discovery</h3>
          <p className="text-[0.8125rem] text-on-surface-variant">
            Most MCP-enabled tools will auto-discover servers listed in standard config paths.
          </p>
        </div>
        <div className="p-6 bg-surface-container-low rounded-xl support-card">
          <span className="material-symbols-outlined text-tertiary mb-3 block">security</span>
          <h3 className="text-sm font-bold mb-2">Security Headers</h3>
          <p className="text-[0.8125rem] text-on-surface-variant">
            Never commit your JSON config files with raw API keys to public repositories.
          </p>
        </div>
        <div className="p-6 bg-surface-container-low rounded-xl support-card">
          <span className="material-symbols-outlined text-tertiary mb-3 block">help</span>
          <h3 className="text-sm font-bold mb-2">Need Help?</h3>
          <p className="text-[0.8125rem] text-on-surface-variant">
            Join our developer discord or check the comprehensive MCP documentation.
          </p>
        </div>
      </section>
    </div>
  );
}
