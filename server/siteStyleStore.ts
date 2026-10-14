import fs from 'node:fs';
import path from 'node:path';
import type { SiteStyleRevision } from '../src/types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const SITE_STYLE_FILE = path.join(DATA_DIR, 'site-style.json');

const INITIAL_REVISION: SiteStyleRevision = {
  revision: 0,
  prompt: 'Default Initial Published Site Style',
  author: 'system',
  timestamp: Date.now(),
  css: '/* Default Initial Workspace Style */',
  themeConfig: {
    primaryColor: '#3b82f6',
    backgroundColor: '#0a0a0a',
    textColor: '#f5f5f5',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
};

interface StoredSiteStyleData {
  history: SiteStyleRevision[];
  currentIndex: number;
}

class SiteStyleStore {
  private history: SiteStyleRevision[] = [INITIAL_REVISION];
  private currentIndex = 0;

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(SITE_STYLE_FILE)) {
        const raw = fs.readFileSync(SITE_STYLE_FILE, 'utf-8');
        const data: StoredSiteStyleData = JSON.parse(raw);
        if (Array.isArray(data.history) && data.history.length > 0) {
          this.history = data.history;
          this.currentIndex =
            typeof data.currentIndex === 'number' &&
            data.currentIndex >= 0 &&
            data.currentIndex < data.history.length
              ? data.currentIndex
              : data.history.length - 1;
        }
      }
    } catch (err) {
      console.warn('Failed to load site-style.json:', err);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data: StoredSiteStyleData = {
        history: this.history,
        currentIndex: this.currentIndex,
      };
      fs.writeFileSync(SITE_STYLE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save site-style.json:', err);
    }
  }

  public getCurrentStyle(): SiteStyleRevision {
    return this.history[this.currentIndex] || INITIAL_REVISION;
  }

  public addRevision(prompt: string, author: string, css: string, themeConfig?: any): SiteStyleRevision {
    const nextRevisionNum = this.history.length;
    const newRev: SiteStyleRevision = {
      revision: nextRevisionNum,
      prompt,
      author,
      timestamp: Date.now(),
      css,
      themeConfig,
    };
    this.history.push(newRev);
    this.currentIndex = this.history.length - 1;
    this.save();
    return newRev;
  }

  public revertLast(): { success: boolean; revision: SiteStyleRevision; message: string } {
    if (this.currentIndex <= 0) {
      return {
        success: false,
        revision: this.history[0],
        message: 'Already at the initial site style (start revision #0).',
      };
    }

    this.currentIndex--;
    this.save();
    return {
      success: true,
      revision: this.history[this.currentIndex],
      message: `Reverted site style to previous revision (#${this.history[this.currentIndex].revision}).`,
    };
  }

  public revertToStart(): { success: boolean; revision: SiteStyleRevision; message: string } {
    this.currentIndex = 0;
    this.save();
    return {
      success: true,
      revision: this.history[0],
      message: 'Reverted site style back to initial default start state (#0).',
    };
  }

  public getHistorySummary(): {
    currentIndex: number;
    history: Array<{ revision: number; prompt: string; author: string; timestamp: number }>;
  } {
    return {
      currentIndex: this.currentIndex,
      history: this.history.map((h) => ({
        revision: h.revision,
        prompt: h.prompt,
        author: h.author,
        timestamp: h.timestamp,
      })),
    };
  }
}

export const siteStyleStore = new SiteStyleStore();
