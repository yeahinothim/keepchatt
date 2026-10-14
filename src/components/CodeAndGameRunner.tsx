import React, { useState, useMemo } from 'react';
import { Play, Code, Copy, Check, RotateCcw, Maximize2, Minimize2, Sparkles } from 'lucide-react';

interface CodeAndGameRunnerProps {
  code: string;
  language?: string;
  isAiMessage?: boolean;
}

export const CodeAndGameRunner: React.FC<CodeAndGameRunnerProps> = ({
  code,
  language = 'plaintext',
  isAiMessage = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const cleanLang = (language || '').toLowerCase().trim();
  const trimmedCode = code.trim();

  // Detect if code is HTML or contains HTML/JS/CSS game/app elements
  const isRunnableHtml = useMemo(() => {
    if (cleanLang === 'html' || cleanLang === 'htm') return true;
    if (
      trimmedCode.includes('<html') ||
      trimmedCode.includes('<!DOCTYPE') ||
      trimmedCode.includes('<canvas') ||
      trimmedCode.includes('<script') ||
      trimmedCode.includes('<style') ||
      trimmedCode.includes('<button')
    ) {
      return true;
    }
    return false;
  }, [cleanLang, trimmedCode]);

  // Construct self-contained HTML document
  const srcDoc = useMemo(() => {
    if (!isRunnableHtml) return '';
    let doc = trimmedCode;

    // If only snippet without <html> tag, wrap with default dark-theme canvas wrapper
    if (!doc.toLowerCase().includes('<html')) {
      doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
      user-select: none;
    }
  </style>
</head>
<body>
  ${doc}
</body>
</html>`;
    }
    return doc;
  }, [isRunnableHtml, trimmedCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(trimmedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isRunnableHtml) {
    return (
      <div className="my-2 rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden shadow-md">
        <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
          <span className="font-semibold uppercase text-emerald-400">{cleanLang || 'code'}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-white transition px-2 py-0.5 rounded hover:bg-neutral-800"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-3 text-xs font-mono text-neutral-200 overflow-x-auto selection:bg-neutral-800 leading-relaxed">
          <code>{trimmedCode}</code>
        </pre>
      </div>
    );
  }

  return (
    <div
      className={`my-2 rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden shadow-lg transition ${
        isFullscreen ? 'fixed inset-4 z-50 flex flex-col bg-neutral-950 border-neutral-700 shadow-2xl' : ''
      }`}
    >
      {/* Top Header Bar with Mode Toggle & Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/90 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                viewMode === 'preview'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play Game</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition ${
                viewMode === 'code'
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>HTML/JS Code</span>
            </button>
          </div>

          {isAiMessage && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-purple-300 font-semibold bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
              AI Game Sandbox
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          {viewMode === 'preview' && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              title="Restart / Reload Game"
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Restart</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy Source Code"
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[11px] hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Game Fullscreen'}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'preview' ? (
        <div className={`relative bg-neutral-950 ${isFullscreen ? 'flex-1' : 'h-[360px] sm:h-[420px]'}`}>
          <iframe
            key={reloadKey}
            title="Interactive HTML/JS Game Preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock allow-same-origin"
            className="w-full h-full border-0 bg-neutral-950"
          />
        </div>
      ) : (
        <pre className={`p-3 text-xs font-mono text-neutral-200 overflow-x-auto selection:bg-neutral-800 leading-relaxed ${
          isFullscreen ? 'flex-1 overflow-y-auto' : 'max-h-[380px] overflow-y-auto'
        }`}>
          <code>{trimmedCode}</code>
        </pre>
      )}
    </div>
  );
};
