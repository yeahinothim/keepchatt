import React from 'react';
import { Sparkles, CheckCircle2, History, X, Tag } from 'lucide-react';

interface UpdatesModalProps {
  onClose: () => void;
}

interface VersionRelease {
  version: string;
  date: string;
  isLatest?: boolean;
  highlights: string[];
}

const VERSION_LOGS: VersionRelease[] = [
  {
    version: '1.5v',
    date: 'Current Release',
    isLatest: true,
    highlights: [
      'Channel categories creation and collapsible channel groups',
      'Role hierarchy reordering with drag-and-drop & priority controls',
      'Highest role badge & role color styling on usernames and members list',
      'Members list grouped by role hierarchy',
      'Channel drag-and-drop reordering with persistent cloud sync',
      'Built-in modern UI modal alerts & confirms replacing browser popups',
      'High-performance proxy browser with full navigation and error handling',
      'New moderation commands: /clearhistory, /purge, /mute, /ban',
    ],
  },
  {
    version: '1.1v',
    date: 'Previous Release',
    isLatest: false,
    highlights: [
      'Added Tenor & GIF picker with favorite star button in top-left to save & send in chat',
      'Added chat "+" button with "Choose file" and "Ping mod" actions',
      'High-performance voice & video calling with screen share, studio EQ, Krisp voice filter, and fullscreen video expand',
      'Direct file paste in chat box and streaming 200MB+ large file support',
      'Automated video downloader for TikTok, YouTube, and media links with speed slider and 10s seek controls',
      'Full workspace /export and /import backup commands and chat persistence across versions',
      'Full moderation suite: /mute, /unmute, /ipban, /ban, /kick, /vcmute, /vcunmute with optional why:',
      'All administrative actions, voice channel joins/leaves, and IP logs routed to #reports channel',
      'Role management commands & UI: /createrole, /newrole, /renamerole, /deleterole, /give, /remove',
      'Interactive AutoMod panel: word filter list, slowmode selector (1s, 3s, 5s, 10s, 15s), and auto actions',
      'Channel settings modal: right-click / edit channel name, slowmode, and permissions (view, type, react, embed, ping)',
    ],
  },
  {
    version: '1.1v',
    date: 'Previous Release',
    highlights: [
      'Pinned messages panel with instant scroll-to-message jump',
      'User reporting flow routing flagged content to #reports',
      'Moderator approve / disapprove message action commands',
      'Voice rooms with participant indicators and real-time WebRTC audio signalling',
      'Markdown and code block syntax highlighting in chat',
    ],
  },
  {
    version: '1.0v',
    date: 'Initial Launch',
    highlights: [
      'Direct messaging and real-time channel chat',
      'Live typing indicators and presence tracking (online/away/busy/offline)',
      'Emoji reactions system with instant tally sync',
      'Persistent authentication and user profiles with custom avatars',
    ],
  },
];

export const UpdatesModal: React.FC<UpdatesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Changelog & Updates Log</h2>
              <p className="text-xs text-neutral-400">Track all platform updates and version history</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Versions List */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-6">
          {VERSION_LOGS.map((rel) => (
            <div
              key={rel.version}
              className={`p-4 rounded-xl border ${
                rel.isLatest
                  ? 'bg-neutral-950 border-emerald-500/40 shadow-md'
                  : 'bg-neutral-950/50 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-white px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700">
                    {rel.version}
                  </span>
                  {rel.isLatest && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Latest
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500 font-medium">{rel.date}</span>
              </div>

              <ul className="space-y-2">
                {rel.highlights.map((h, i) => (
                  <li key={i} className="text-xs text-neutral-300 flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-neutral-800 flex justify-end bg-neutral-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
