import React, { useState, useEffect, useCallback } from 'react';
import { 
  Globe, ArrowLeft, ArrowRight, RotateCw, Home, Plus, X, 
  Bookmark, ShieldCheck, ExternalLink, Search, Lock, Star,
  Trash2, Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';
import { api, getStoredToken } from '../lib/api.ts';

interface Tab {
  id: string;
  url: string;
  title: string;
}

interface BrowserState {
  currentUrl: string;
  history: string[];
  bookmarks: string[];
  tabs: Tab[];
  activeTabId: string;
}

export function BrowserView() {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [browserState, setBrowserState] = useState<BrowserState>({
    currentUrl: 'https://en.wikipedia.org/wiki/Main_Page',
    history: ['https://en.wikipedia.org/wiki/Main_Page'],
    bookmarks: ['https://en.wikipedia.org/wiki/Main_Page', 'https://news.ycombinator.com', 'https://lite.cnn.com', 'https://html.duckduckgo.com'],
    tabs: [{ id: 't-1', url: 'https://en.wikipedia.org/wiki/Main_Page', title: 'Wikipedia (Oceania Proxy 🇦🇺)' }],
    activeTabId: 't-1',
  });

  const [inputUrl, setInputUrl] = useState('https://en.wikipedia.org/wiki/Main_Page');
  const [isLoading, setIsLoading] = useState(false);
  const [proxyHtml, setProxyHtml] = useState<string>('');
  const [proxyError, setProxyError] = useState<string | null>(null);

  // Load browser state from server
  const loadBrowserState = useCallback(async () => {
    try {
      const res = await api.request<{ success: boolean; state: BrowserState }>('/api/browser/state');
      if (res?.success && res.state && res.state.tabs && res.state.tabs.length > 0) {
        setBrowserState(res.state);
        const activeTab = res.state.tabs.find((t) => t.id === res.state.activeTabId) || res.state.tabs[0];
        if (activeTab) {
          setInputUrl(activeTab.url);
          fetchUrlViaProxy(activeTab.url);
          return;
        }
      }
      // Initial fetch if state was empty
      fetchUrlViaProxy('https://en.wikipedia.org/wiki/Main_Page');
    } catch (err) {
      console.error('Failed to load browser state:', err);
      fetchUrlViaProxy('https://en.wikipedia.org/wiki/Main_Page');
    }
  }, []);

  useEffect(() => {
    loadBrowserState();
  }, [loadBrowserState]);

  const saveBrowserState = async (newState: BrowserState) => {
    try {
      await api.request('/api/browser/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newState),
      });
    } catch (err) {
      console.error('Failed to save browser state:', err);
    }
  };

  const fetchUrlViaProxy = async (targetUrl: string) => {
    setIsLoading(true);
    setProxyError(null);
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['X-Session-Token'] = token;
        headers['X-Chat-Token'] = token;
      }
      const res = await fetch(`/api/browser/proxy?url=${encodeURIComponent(targetUrl)}`, {
        headers,
        credentials: 'include',
      });
      const html = await res.text();
      if (html) {
        setProxyHtml(html);
      } else {
        throw new Error(`Empty response from proxy gateway (${res.status})`);
      }
    } catch (err: any) {
      setProxyError(err.message || 'Failed to load page through Oceania proxy.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchOrNavigate = (urlToNav: string) => {
    let finalUrl = urlToNav.trim();
    if (!finalUrl) return;

    // Check if it's a URL
    const isUrl = finalUrl.match(/^https?:\/\//) || finalUrl.match(/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/);
    
    if (!isUrl) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
    } else if (!finalUrl.match(/^https?:\/\//)) {
      finalUrl = `https://${finalUrl}`;
    }

    setInputUrl(finalUrl);
    fetchUrlViaProxy(finalUrl);

    const updatedTabs = browserState.tabs.map((t) => {
      if (t.id === browserState.activeTabId) {
        return { ...t, url: finalUrl, title: finalUrl };
      }
      return t;
    });

    const newHistory = [finalUrl, ...browserState.history.filter((u) => u !== finalUrl)].slice(0, 50);
    const newState: BrowserState = {
      ...browserState,
      currentUrl: finalUrl,
      history: newHistory,
      tabs: updatedTabs,
    };
    setBrowserState(newState);
    saveBrowserState(newState);
  };

  const searchOrNavigateRef = React.useRef(handleSearchOrNavigate);
  useEffect(() => {
    searchOrNavigateRef.current = handleSearchOrNavigate;
  }, [handleSearchOrNavigate]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'proxy-navigate') {
        searchOrNavigateRef.current(event.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleNavigate = (urlToNav: string) => {
    let finalUrl = urlToNav.trim();
    if (!finalUrl) return;

    setInputUrl(finalUrl);
    fetchUrlViaProxy(finalUrl);

    const updatedTabs = browserState.tabs.map((t) => {
      if (t.id === browserState.activeTabId) {
        return { ...t, url: finalUrl, title: finalUrl };
      }
      return t;
    });

    const newHistory = [finalUrl, ...browserState.history.filter((u) => u !== finalUrl)].slice(0, 50);
    const newState: BrowserState = {
      ...browserState,
      currentUrl: finalUrl,
      history: newHistory,
      tabs: updatedTabs,
    };

    setBrowserState(newState);
    saveBrowserState(newState);
  };

  const handleAddTab = () => {
    const newId = `t-${Date.now()}`;
    const newTab: Tab = { id: newId, url: 'https://www.google.com', title: 'Google (Oceania Proxy 🇦🇺)' };
    const newState: BrowserState = {
      ...browserState,
      tabs: [...browserState.tabs, newTab],
      activeTabId: newId,
      currentUrl: newTab.url,
    };
    setBrowserState(newState);
    setInputUrl(newTab.url);
    fetchUrlViaProxy(newTab.url);
    saveBrowserState(newState);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (browserState.tabs.length <= 1) return; // Keep at least one tab
    const filteredTabs = browserState.tabs.filter((t) => t.id !== tabId);
    const nextActive = filteredTabs[filteredTabs.length - 1];
    const newState: BrowserState = {
      ...browserState,
      tabs: filteredTabs,
      activeTabId: nextActive.id,
      currentUrl: nextActive.url,
    };
    setBrowserState(newState);
    setInputUrl(nextActive.url);
    fetchUrlViaProxy(nextActive.url);
    saveBrowserState(newState);
  };

  const handleSwitchTab = (tabId: string) => {
    const tab = browserState.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const newState: BrowserState = {
      ...browserState,
      activeTabId: tabId,
      currentUrl: tab.url,
    };
    setBrowserState(newState);
    setInputUrl(tab.url);
    fetchUrlViaProxy(tab.url);
    saveBrowserState(newState);
  };

  const handleToggleBookmark = () => {
    const isBookmarked = browserState.bookmarks.includes(browserState.currentUrl);
    const newBookmarks = isBookmarked
      ? browserState.bookmarks.filter((b) => b !== browserState.currentUrl)
      : [...browserState.bookmarks, browserState.currentUrl];
    const newState = { ...browserState, bookmarks: newBookmarks };
    setBrowserState(newState);
    saveBrowserState(newState);
  };

  const activeTab = browserState.tabs.find((t) => t.id === browserState.activeTabId) || browserState.tabs[0];

  return (
    <div className={`flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none ${isFullScreen ? 'fixed inset-0 z-[100] w-screen h-screen' : ''}`}>
      {/* Browser Header / Tabs bar */}
      <div className="flex items-center bg-slate-900 border-b border-slate-800 px-3 pt-2 gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 pb-2">
          {browserState.tabs.map((tab) => {
            const isActive = tab.id === browserState.activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer transition-all max-w-[180px] truncate ${
                  isActive
                    ? 'bg-slate-950 text-sky-400 border-t-2 border-sky-500 shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                <span className="truncate">{tab.url.replace(/^https?:\/\//, '')}</span>
                {browserState.tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={handleAddTab}
            title="New Browser Tab"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors ml-1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Oceania Proxy Badge */}
        <div className="ml-auto flex items-center gap-2 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[11px] text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Oceania Proxy Active 🇦🇺🇳🇿</span>
        </div>
      </div>

      {/* Navigation Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleNavigate('https://news.ycombinator.com')}
            title="Back / Home"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => fetchUrlViaProxy(browserState.currentUrl)}
            title="Reload"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
          <button
            onClick={() => handleNavigate('https://news.ycombinator.com')}
            title="Home"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* URL Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearchOrNavigate(inputUrl);
          }}
          className="flex-1 flex items-center gap-2 bg-slate-950 border border-slate-700/60 rounded-lg px-3 py-1.5 focus-within:border-sky-500 transition-colors shadow-inner"
        >
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Search web or enter URL (e.g. google.com, wikipedia.org)..."
            className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={handleToggleBookmark}
            title={browserState.bookmarks.includes(browserState.currentUrl) ? 'Remove Bookmark' : 'Bookmark Page'}
            className={`p-1 rounded transition-colors ${
              browserState.bookmarks.includes(browserState.currentUrl)
                ? 'text-amber-400 hover:bg-amber-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Star className="w-3.5 h-3.5 fill-current" />
          </button>
        </form>

        <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isFullScreen ? <X className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
          </button>
      </div>

      {/* Bookmarks Quick Bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 border-b border-slate-800/60 overflow-x-auto text-xs">
        <span className="text-slate-500 text-[11px] font-medium shrink-0">Bookmarks:</span>
        {browserState.bookmarks.map((bm, idx) => (
          <button
            key={idx}
            onClick={() => handleNavigate(bm)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white truncate max-w-[150px] transition-colors text-[11px]"
          >
            <Globe className="w-3 h-3 text-sky-400 shrink-0" />
            <span className="truncate">{bm.replace(/^https?:\/\//, '')}</span>
          </button>
        ))}
      </div>

      {/* Browser Viewport Area */}
      <div className="flex-1 relative bg-white overflow-hidden flex flex-col">
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-sky-400 font-medium">Routing securely via Oceania Proxy (AU/NZ)...</p>
          </div>
        )}

        {proxyError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 text-slate-200 text-center">
            <Globe className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
            <h3 className="text-base font-bold mb-1">Proxy Connection Error</h3>
            <p className="text-xs text-slate-400 max-w-md mb-4">{proxyError}</p>
            <button
              onClick={() => handleNavigate('https://news.ycombinator.com')}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg"
            >
              Return to Hacker News
            </button>
          </div>
        ) : (
          <div className="flex-1 w-full h-full relative">
            <iframe
              srcDoc={proxyHtml}
              title="Oceania Browser Viewport"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        )}
      </div>

      {/* Browser Footer status */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Oceania Proxy Node: Sydney / Auckland (Connected)</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Tabs: {browserState.tabs.length}</span>
          <span>Secure TLS 1.3</span>
        </div>
      </div>
    </div>
  );
}
