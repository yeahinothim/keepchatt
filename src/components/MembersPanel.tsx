import React from 'react';
import { X, MessageSquare, Shield, UserPlus } from 'lucide-react';
import type { User, Role } from '../types.ts';
import { getHighestRole } from '../types.ts';

interface MembersPanelProps {
  currentUser: User | null;
  users: User[];
  onlineUserIds: Set<string>;
  roles?: Role[];
  onClose: () => void;
  onStartDm: (targetUser: User) => void;
  onUserClick?: (user: User) => void;
  onInviteMembers?: () => void;
}

export const MembersPanel: React.FC<MembersPanelProps> = ({
  currentUser,
  users,
  onlineUserIds,
  roles = [],
  onClose,
  onStartDm,
  onUserClick,
  onInviteMembers,
}) => {
  // Sort roles by position (0 is highest priority)
  const sortedRoles = [...roles].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  // Map each user to their highest role
  const userHighestRoleMap = new Map<string, Role | null>();
  users.forEach((u) => {
    userHighestRoleMap.set(u.id, getHighestRole(u, sortedRoles));
  });

  // Group users by role if role has hoist enabled (hoist !== false) AND member is online
  const roleGroups: { role: Role; members: User[] }[] = [];
  const assignedUserIds = new Set<string>();

  sortedRoles.forEach((role) => {
    if (role.hoist === false) return; // Skip non-hoisted roles from creating a separate header

    const membersWithRole = users.filter((u) => {
      const highest = userHighestRoleMap.get(u.id);
      return highest?.id === role.id && onlineUserIds.has(u.id);
    });

    if (membersWithRole.length > 0) {
      membersWithRole.sort((a, b) =>
        (a.displayName || a.username).localeCompare(b.displayName || b.username)
      );

      roleGroups.push({ role, members: membersWithRole });
      membersWithRole.forEach((u) => assignedUserIds.add(u.id));
    }
  });

  // Unassigned online & offline users
  const unassignedUsers = users.filter((u) => !assignedUserIds.has(u.id));
  const unassignedOnline = unassignedUsers.filter((u) => onlineUserIds.has(u.id));
  const unassignedOffline = unassignedUsers.filter((u) => !onlineUserIds.has(u.id));

  const renderUserItem = (u: User, role?: Role | null) => {
    const isSelf = currentUser?.id === u.id;
    const isOnline = onlineUserIds.has(u.id);
    const highestRole = role || userHighestRoleMap.get(u.id);

    return (
      <div
        key={u.id}
        className={`group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-neutral-900 transition ${
          !isOnline ? 'opacity-70 hover:opacity-100' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onUserClick?.(u)}
            className="relative shrink-0 cursor-pointer focus:outline-none"
            title={`View ${u.displayName || u.username}'s profile`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] overflow-hidden bg-neutral-800 border shrink-0 ${
                isOnline ? 'text-white border-neutral-700' : 'text-neutral-400 border-neutral-800 grayscale'
              }`}
              style={{ backgroundColor: u.avatarColor || '#3b82f6' }}
            >
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                (u.displayName || u.username).slice(0, 2).toUpperCase()
              )}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-neutral-950 ${
                isOnline ? 'bg-emerald-500' : 'bg-neutral-600'
              }`}
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => onUserClick?.(u)}
                className="text-xs font-semibold truncate text-left hover:underline"
                style={{ color: highestRole?.color || '#ffffff' }}
              >
                {u.displayName || u.username}
              </button>
              {isSelf && (
                <span className="text-[10px] text-neutral-500 font-normal hover:no-underline">
                  (you)
                </span>
              )}
              {highestRole?.iconUrl && (
                <img
                  src={highestRole.iconUrl}
                  alt={highestRole.name}
                  className="w-3.5 h-3.5 object-contain shrink-0 inline-block"
                  title={`Role Icon: ${highestRole.name}`}
                />
              )}
              {highestRole && (
                <span
                  className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded tracking-wider shrink-0"
                  style={{
                    backgroundColor: `${highestRole.color}20`,
                    color: highestRole.color,
                    border: `1px solid ${highestRole.color}40`,
                  }}
                  title={`Role: ${highestRole.name}`}
                >
                  {highestRole.name}
                </span>
              )}
            </div>
            {u.statusText ? (
              <div className="text-[10px] text-neutral-400 truncate">{u.statusText}</div>
            ) : (
              <div className="text-[10px] text-neutral-500 truncate">@{u.username}</div>
            )}
          </div>
        </div>

        {!isSelf && currentUser && (
          <button
            onClick={() => onStartDm(u)}
            title={`Message @${u.username}`}
            className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition shrink-0 ml-1"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside
      id="members-panel"
      className="w-60 h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shrink-0 select-none animate-in slide-in-from-right duration-200"
    >
      <div className="h-14 border-b border-neutral-800 px-4 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          Members ({users.length})
        </h2>
        <div className="flex items-center gap-1">
          {onInviteMembers && (
            <button
              type="button"
              onClick={onInviteMembers}
              title="Invite Members to Server"
              className="p-1 text-emerald-400 hover:text-emerald-300 rounded-md hover:bg-emerald-950/40 transition flex items-center gap-1 text-xs font-semibold"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Role groups */}
        {roleGroups.map(({ role, members }) => (
          <div key={role.id}>
            <div className="flex items-center gap-1.5 px-2 mb-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: role.color }}
              />
              {role.iconUrl && (
                <img src={role.iconUrl} alt={role.name} className="w-3.5 h-3.5 object-contain shrink-0" />
              )}
              <span
                className="text-[11px] font-bold uppercase tracking-wider truncate"
                style={{ color: role.color }}
              >
                {role.name} — {members.length}
              </span>
            </div>
            <div className="space-y-0.5">
              {members.map((u) => renderUserItem(u, role))}
            </div>
          </div>
        ))}

        {/* Unassigned Online Members */}
        {unassignedOnline.length > 0 && (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-2 block mb-1">
              Online — {unassignedOnline.length}
            </span>
            <div className="space-y-0.5">
              {unassignedOnline.map((u) => renderUserItem(u, null))}
            </div>
          </div>
        )}

        {/* Unassigned Offline Members */}
        {unassignedOffline.length > 0 && (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 px-2 block mb-1">
              Offline — {unassignedOffline.length}
            </span>
            <div className="space-y-0.5">
              {unassignedOffline.map((u) => renderUserItem(u, null))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
