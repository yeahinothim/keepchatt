import React, { useState } from 'react';
import { X, UserPlus, UserMinus, ShieldAlert, BadgeInfo, MessageSquare, Edit3, Key, Sparkles, Tag } from 'lucide-react';
import { api } from '../lib/api.ts';
import type { User, Role } from '../types.ts';
import { getHighestRole } from '../types.ts';

interface PublicProfileModalProps {
  user: User;
  currentUser: User | null;
  isOpen?: boolean;
  roles?: Role[];
  onClose: () => void;
  onToggleFriend?: (targetUser: User) => void;
  onRefreshUser?: () => void;
  onStartDm?: (targetUser: User) => void;
  onEditProfile?: () => void;
  onImpersonateSuccess?: (user: User, token: string) => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  user,
  currentUser,
  isOpen,
  roles = [],
  onClose,
  onToggleFriend,
  onRefreshUser,
  onStartDm,
  onEditProfile,
  onImpersonateSuccess,
}) => {
  if (isOpen !== undefined && !isOpen) return null;

  const [impersonating, setImpersonating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastClick, setLastClick] = useState(0);

  const handleAvatarClick = () => {
    const now = Date.now();
    if (now - lastClick < 1000) {
      handleTestLogin();
    }
    setLastClick(now);
  };

  const handleModeration = async (action: 'kick' | 'ban' | 'mute') => {
    if (!isKep) return;
    try {
      await api.executeDiscordBotCommand({ command: action, target: user.username, reason: 'Moderation from Web Profile', duration: 10 });
      alert(`${action} successful`);
    } catch (err: any) {
      alert(`Moderation failed: ${err.message}`);
    }
  };

  const isSelf = currentUser?.id === user.id;
  const isFriend = currentUser?.friendIds?.includes(user.id);
  const isKep =
    currentUser?.username?.toLowerCase() === 'kep' ||
    currentUser?.username?.toLowerCase() === 'keps' ||
    currentUser?.username?.toLowerCase() === 'oliverg' ||
    currentUser?.role === 'owner' ||
    currentUser?.role === 'co-owner';

  // Find roles assigned to this user
  const userRoleIds = user.assignedRoleIds || user.roleIds || [];
  const assignedRoles = roles.filter((r) => userRoleIds.includes(r.id));

  const handleTestLogin = async () => {
    if (!isKep) return;
    setImpersonating(true);
    setErrorMsg(null);
    try {
      const res = await api.impersonate(user.username);
      if (res.token && res.user) {
        localStorage.setItem('chat_token', res.token);
        if (onImpersonateSuccess) {
          onImpersonateSuccess(res.user, res.token);
        } else {
          window.location.reload();
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to switch user.');
      setImpersonating(false);
    }
  };

  const statusColorClass =
    user.status === 'online'
      ? 'bg-emerald-500'
      : user.status === 'busy'
      ? 'bg-red-500'
      : user.status === 'away'
      ? 'bg-amber-500'
      : 'bg-neutral-500';

  const statusLabel =
    user.status === 'online'
      ? 'Online'
      : user.status === 'busy'
      ? 'Do Not Disturb'
      : user.status === 'away'
      ? 'Away'
      : 'Offline';

  return (
    <div
      id="public-profile-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="public-profile-card"
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner (Image, GIF, or custom gradient) */}
        <div className="h-36 w-full relative bg-neutral-950 overflow-hidden">
          {user.bannerUrl ? (
            <img
              src={user.bannerUrl}
              alt={`${user.username}'s banner`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${user.avatarColor || '#3b82f6'}55 0%, #171717 100%)`,
              }}
            />
          )}

          {/* Close Button */}
          <button
            id="public-profile-close-btn"
            onClick={onClose}
            className="absolute top-3 right-3 bg-black/50 hover:bg-black/80 text-white p-1.5 rounded-full transition backdrop-blur-md z-10"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-6 relative">
          {/* Avatar and Badges */}
          <div className="flex items-end justify-between -mt-12 mb-3">
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-2xl ring-4 ring-neutral-900 overflow-hidden bg-neutral-800 cursor-pointer"
                style={{ backgroundColor: user.avatarColor || '#3b82f6' }}
                onClick={handleAvatarClick}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (user.displayName || user.username).slice(0, 2).toUpperCase()
                )}
              </div>
              <span
                className={`absolute bottom-1 right-1 w-5 h-5 rounded-full ring-4 ring-neutral-900 ${statusColorClass}`}
                title={statusLabel}
              />
            </div>

            {/* Quick Actions Header */}
            <div className="flex items-center gap-2">
              {isSelf ? (
                <button
                  onClick={() => {
                    onClose();
                    onEditProfile?.();
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 flex items-center gap-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Profile
                </button>
              ) : (
                <>
                  {currentUser && onStartDm && (
                    <button
                      onClick={() => {
                        onClose();
                        onStartDm(user);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-1.5 transition"
                      title={`Message @${user.username}`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-neutral-300" />
                      Message
                    </button>
                  )}

                  {currentUser && onToggleFriend && (
                    <button
                      onClick={() => onToggleFriend(user)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                        isFriend
                          ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {isFriend ? (
                        <>
                          <UserMinus className="w-3.5 h-3.5" />
                          Remove Friend
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Add Friend
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* User Display Info */}
          <div>
            {(() => {
              const highestRole = getHighestRole(user, roles);
              return (
                <h3
                  className="text-xl font-bold tracking-tight flex items-center gap-2 flex-wrap"
                  style={{
                    fontFamily: user.fontFamily || undefined,
                    color: highestRole?.color || '#ffffff',
                  }}
                >
                  <span>{user.displayName || user.username}</span>
                  {highestRole?.iconUrl && (
                    <img
                      src={highestRole.iconUrl}
                      alt={highestRole.name}
                      className="w-4 h-4 object-contain shrink-0 inline-block"
                      title={highestRole.name}
                    />
                  )}
                  {highestRole && (
                    <span
                      className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${highestRole.color}20`,
                        color: highestRole.color,
                        border: `1px solid ${highestRole.color}50`,
                      }}
                    >
                      {highestRole.name}
                    </span>
                  )}
                  {user.role && user.role !== 'member' && !highestRole && (
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {user.role}
                    </span>
                  )}
                </h3>
              );
            })()}
            <p className="text-sm text-neutral-400 font-mono">@{user.username}</p>
          </div>

          {/* Moderation Actions for Kep */}
          {isKep && !isSelf && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => handleModeration('kick')} className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-lg transition">Kick</button>
              <button onClick={() => handleModeration('ban')} className="flex-1 py-1 bg-red-800 hover:bg-red-700 text-white font-semibold text-xs rounded-lg transition">Ban</button>
              <button onClick={() => handleModeration('mute')} className="flex-1 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg transition">Mute</button>
            </div>
          )}

          {errorMsg && (
            <div className="mt-2 text-xs text-red-400 bg-red-950/40 p-2 rounded-lg border border-red-800/40">
              {errorMsg}
            </div>
          )}

          {/* Custom Status Quote */}
          {user.statusText && (
            <div className="mt-3 bg-neutral-950/70 p-3 rounded-xl border border-neutral-800/70 flex items-center gap-2">
              <BadgeInfo className="w-4 h-4 text-neutral-400 shrink-0" />
              <span className="text-xs text-neutral-300 italic truncate">"{user.statusText}"</span>
            </div>
          )}

          {/* Assigned Roles */}
          {assignedRoles.length > 0 && (
            <div className="mt-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Roles ({assignedRoles.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {assignedRoles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: `${role.color}55`,
                      backgroundColor: `${role.color}1a`,
                      color: role.color,
                    }}
                  >
                    {role.iconUrl ? (
                      <img src={role.iconUrl} alt={role.name} className="w-3.5 h-3.5 object-contain shrink-0" />
                    ) : (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                    )}
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bio / About Me */}
          {user.bio ? (
            <div className="mt-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                About Me
              </h4>
              <div className="bg-neutral-950/40 p-3 rounded-xl border border-neutral-800/40">
                <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed">
                  {user.bio}
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-neutral-500 italic">
              No bio written yet.
            </div>
          )}

          {/* Footer Metadata */}
          <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Member since {new Date(user.createdAt || Date.now()).toLocaleDateString()}</span>
            </div>
            <span className="capitalize">{statusLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
