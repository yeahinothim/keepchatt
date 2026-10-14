import React, { useEffect, useRef } from 'react';
import {
  Settings,
  UserPlus,
  PlusCircle,
  FolderPlus,
  Copy,
  LogOut,
  Trash2,
  Share2,
  Check,
} from 'lucide-react';
import type { Server, User } from '../types.ts';

interface ServerContextMenuProps {
  server: Server;
  currentUser: User | null;
  x: number;
  y: number;
  onClose: () => void;
  onOpenSettings: (server: Server) => void;
  onOpenInvite: (server: Server) => void;
  onCreateChannel: (server: Server) => void;
  onCreateCategory: (server: Server) => void;
  onExportDiscord: (server: Server) => void;
  onLeaveServer: (server: Server) => void;
  onDeleteServer: (server: Server) => void;
}

export const ServerContextMenu: React.FC<ServerContextMenuProps> = ({
  server,
  currentUser,
  x,
  y,
  onClose,
  onOpenSettings,
  onOpenInvite,
  onCreateChannel,
  onCreateCategory,
  onExportDiscord,
  onLeaveServer,
  onDeleteServer,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  const isDefaultServer = server.id === 's-default';
  const isOwner =
    currentUser &&
    (currentUser.id === server.ownerId ||
      currentUser.username.toLowerCase() === 'kep' ||
      currentUser.username.toLowerCase() === 'keps' ||
      currentUser.role === 'owner');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('contextmenu', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust menu position to keep within viewport
  const adjustedX = Math.min(Math.max(10, x), window.innerWidth - 240);
  const adjustedY = Math.min(Math.max(10, y), window.innerHeight - 340);

  const handleCopyCode = () => {
    const invite = server.inviteCode || `srv-${server.id}`;
    navigator.clipboard.writeText(invite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Click-off dismiss backdrop */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      <div
        ref={menuRef}
        style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
        className="fixed z-50 w-56 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-xl shadow-2xl p-1.5 text-neutral-200 animate-in fade-in zoom-in-95 duration-100 select-none"
      >
      {/* Header Info */}
      <div className="px-3 py-2 border-b border-neutral-800/80 mb-1 flex items-center justify-between">
        <div className="truncate">
          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
            <span>{server.icon || '🌐'}</span>
            <span>{server.name}</span>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono">
            {isOwner ? '👑 Owner' : 'Member'}
          </div>
        </div>
      </div>

      {/* Main Options */}
      <div className="space-y-0.5">
        <button
          onClick={() => {
            onOpenInvite(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 flex items-center justify-between transition"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite Members</span>
          </div>
          <span className="text-[9px] bg-emerald-950 border border-emerald-800/60 text-emerald-400 px-1.5 py-0.2 rounded font-mono">
            +Add
          </span>
        </button>

        <button
          onClick={() => {
            onOpenSettings(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center gap-2 transition"
        >
          <Settings className="w-3.5 h-3.5 text-neutral-400" />
          <span>Server Settings</span>
        </button>

        <button
          onClick={() => {
            onCreateChannel(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center gap-2 transition"
        >
          <PlusCircle className="w-3.5 h-3.5 text-neutral-400" />
          <span>Create Channel</span>
        </button>

        <button
          onClick={() => {
            onCreateCategory(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center gap-2 transition"
        >
          <FolderPlus className="w-3.5 h-3.5 text-neutral-400" />
          <span>Create Category</span>
        </button>

        <button
          onClick={handleCopyCode}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-neutral-800 text-neutral-300 hover:text-white flex items-center justify-between transition"
        >
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-neutral-400" />
            <span>Copy Invite Code</span>
          </div>
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : null}
        </button>

        <button
          onClick={() => {
            onExportDiscord(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 flex items-center gap-2 transition"
        >
          <Share2 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Export to Discord</span>
        </button>
      </div>

      {/* Danger options */}
      {(!isDefaultServer || isOwner) && <div className="my-1 border-t border-neutral-800" />}

      {!isDefaultServer && !isOwner && (
        <button
          onClick={() => {
            onLeaveServer(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-950/40 text-amber-400 hover:text-amber-300 flex items-center gap-2 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Leave Server</span>
        </button>
      )}

      {!isDefaultServer && isOwner && (
        <button
          onClick={() => {
            onDeleteServer(server);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-950/60 text-rose-400 hover:text-rose-300 flex items-center gap-2 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Server</span>
        </button>
      )}
    </div>
    </>
  );
};
