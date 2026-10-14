import React, { useState } from 'react';
import { Shield, Plus, Trash2, Edit2, X, Check, Users, Loader2, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { api } from '../lib/api.ts';
import type { Role, User } from '../types.ts';

interface RolesModalProps {
  roles: Role[];
  allUsers: User[];
  currentUser: User;
  onClose: () => void;
  onRefresh: () => void;
}

const PRESET_COLORS = [
  '#dc2626', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#94a3b8', // Slate
];

export const RolesModal: React.FC<RolesModalProps> = ({
  roles,
  allUsers,
  currentUser,
  onClose,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'roles' | 'members'>('roles');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#3b82f6');
  const [newRoleIconUrl, setNewRoleIconUrl] = useState('');
  const [newRoleHoist, setNewRoleHoist] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIconUrl, setEditIconUrl] = useState('');
  const [editHoist, setEditHoist] = useState(true);
  const [selectedUser, setSelectedUser] = useState(allUsers[0]?.id || '');
  const [selectedRole, setSelectedRole] = useState(roles[0]?.id || '');
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createRole({
        name: newRoleName.trim(),
        color: newRoleColor,
        iconUrl: newRoleIconUrl.trim() || undefined,
        hoist: newRoleHoist,
        permissions: {
          canEditChannels: true,
          canManageMessages: true,
          canMute: true,
        },
      });
      setNewRoleName('');
      setNewRoleIconUrl('');
      setNewRoleHoist(true);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to create role');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateRole = async (roleId: string) => {
    if (!editName.trim()) return;
    setError(null);
    try {
      await api.updateRole(roleId, {
        name: editName.trim(),
        color: editColor,
        iconUrl: editIconUrl.trim() || undefined,
        hoist: editHoist,
      });
      setEditingRoleId(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    const confirmed = await (window as any).customConfirm('Are you sure you want to delete this role?');
    if (!confirmed) return;
    setError(null);
    try {
      await api.deleteRole(roleId);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) return;
    setLoadingAction(true);
    setError(null);
    try {
      await api.assignRole(selectedUser, selectedRole);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to assign role');
    } finally {
      setLoadingAction(false);
    }
  };

  const [draggedRoleId, setDraggedRoleId] = useState<string | null>(null);
  const [dragOverRoleId, setDragOverRoleId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const handleMoveRole = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= roles.length) return;

    const newRoleIds = roles.map((r) => r.id);
    const [moved] = newRoleIds.splice(index, 1);
    newRoleIds.splice(targetIndex, 0, moved);

    setReordering(true);
    setError(null);
    try {
      await api.reorderRoles(newRoleIds);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to reorder roles');
    } finally {
      setReordering(false);
    }
  };

  const handleDropRole = async (targetRoleId: string) => {
    if (!draggedRoleId || draggedRoleId === targetRoleId) return;
    const currentIds = roles.map((r) => r.id);
    const fromIndex = currentIds.indexOf(draggedRoleId);
    const toIndex = currentIds.indexOf(targetRoleId);
    if (fromIndex === -1 || toIndex === -1) return;

    const newIds = [...currentIds];
    newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, draggedRoleId);

    setReordering(true);
    setError(null);
    try {
      await api.reorderRoles(newIds);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to reorder roles');
    } finally {
      setReordering(false);
      setDraggedRoleId(null);
      setDragOverRoleId(null);
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    setError(null);
    try {
      await api.removeRole(userId, roleId);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to remove role');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-neutral-800 rounded-xl text-neutral-300">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Server Roles & Permissions</h2>
              <p className="text-xs text-neutral-400">Manage hierarchical roles and member assignments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-950/40 px-4 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'roles'
                ? 'border-emerald-500 text-white font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Roles ({roles.length})
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'border-emerald-500 text-white font-bold'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Member Assignments
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {activeTab === 'roles' ? (
            <>
              {/* Create Role Form */}
              <form onSubmit={handleCreateRole} className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <span className="text-xs font-bold text-neutral-200 block uppercase tracking-wider">
                  Create New Role
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Role name (e.g. Moderator, VIP)..."
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                  />
                  <button
                    type="submit"
                    disabled={creating || !newRoleName.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create
                  </button>
                </div>

                {/* Role Icon & Hoist Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 font-semibold block">Role Icon Image (URL or Upload)</label>
                    <div className="flex items-center gap-2">
                      {newRoleIconUrl && (
                        <img src={newRoleIconUrl} alt="Icon preview" className="w-5 h-5 object-contain rounded shrink-0" />
                      )}
                      <input
                        type="text"
                        placeholder="Image URL..."
                        value={newRoleIconUrl}
                        onChange={(e) => setNewRoleIconUrl(e.target.value)}
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none"
                      />
                      <label className="cursor-pointer px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] text-white border border-neutral-700 shrink-0">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const res = await api.uploadAttachment(file);
                              if (res?.url) setNewRoleIconUrl(res.url);
                            } catch (err) {
                              setError('Failed to upload role icon.');
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="newRoleHoist"
                      checked={newRoleHoist}
                      onChange={(e) => setNewRoleHoist(e.target.checked)}
                      className="w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="newRoleHoist" className="text-xs text-neutral-300 font-medium cursor-pointer">
                      Display separately in online member list
                    </label>
                  </div>
                </div>

                {/* Preset Color Picker */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-neutral-400">Color:</span>
                  <div className="flex items-center gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewRoleColor(c)}
                        className={`w-5 h-5 rounded-full transition ${
                          newRoleColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </form>

              {/* Roles List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    Role Hierarchy ({roles.length})
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    Highest priority at the top (affects color & members list)
                  </span>
                </div>
                <div className="divide-y divide-neutral-800 bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                  {roles.map((role, idx) => (
                    <div
                      key={role.id}
                      draggable={!editingRoleId}
                      onDragStart={(e) => {
                        setDraggedRoleId(role.id);
                        e.dataTransfer.setData('text/plain', role.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverRoleId !== role.id) setDragOverRoleId(role.id);
                      }}
                      onDragLeave={() => {
                        if (dragOverRoleId === role.id) setDragOverRoleId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropRole(role.id);
                      }}
                      className={`p-3 flex items-center justify-between transition-colors ${
                        dragOverRoleId === role.id ? 'bg-neutral-800/80 border-t-2 border-emerald-500' : ''
                      } ${draggedRoleId === role.id ? 'opacity-50' : ''}`}
                    >
                      {editingRoleId === role.id ? (
                        <div className="flex flex-col gap-2 flex-1 mr-2 p-2 bg-neutral-900 rounded-lg border border-neutral-800">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white flex-1"
                            />
                            <input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateRole(role.id)}
                              className="p-1 text-emerald-400 hover:text-emerald-300"
                              title="Save Changes"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRoleId(null)}
                              className="p-1 text-neutral-400 hover:text-white"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Role Icon URL..."
                              value={editIconUrl}
                              onChange={(e) => setEditIconUrl(e.target.value)}
                              className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white flex-1"
                            />
                            <label className="cursor-pointer px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] text-white border border-neutral-700 shrink-0">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  try {
                                    const res = await api.uploadAttachment(file);
                                    if (res?.url) setEditIconUrl(res.url);
                                  } catch (err) {
                                    setError('Failed to upload role icon.');
                                  }
                                }}
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer ml-1 shrink-0">
                              <input
                                type="checkbox"
                                checked={editHoist}
                                onChange={(e) => setEditHoist(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-neutral-950 border-neutral-700 text-emerald-600 focus:ring-0"
                              />
                              <span>Hoist</span>
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center justify-center mr-0.5">
                            <button
                              type="button"
                              disabled={idx === 0 || reordering}
                              onClick={() => handleMoveRole(idx, 'up')}
                              title="Move Up (Higher Priority)"
                              className="p-0.5 text-neutral-500 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-500 transition rounded"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === roles.length - 1 || reordering}
                              onClick={() => handleMoveRole(idx, 'down')}
                              title="Move Down (Lower Priority)"
                              className="p-0.5 text-neutral-500 hover:text-white disabled:opacity-20 disabled:hover:text-neutral-500 transition rounded"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: role.color }}
                          />
                          {role.iconUrl && (
                            <img src={role.iconUrl} alt="Role Icon" className="w-4 h-4 object-contain rounded shrink-0" />
                          )}
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs" style={{ color: role.color }}>
                              @{role.name}
                            </span>
                            {role.hoist !== false && (
                              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-neutral-800 text-neutral-400" title="Hoisted in Member List">
                                Hoisted
                              </span>
                            )}
                            {idx === 0 && (
                              <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                                Highest
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-500 font-mono">
                              #{idx + 1}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        {editingRoleId !== role.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoleId(role.id);
                              setEditName(role.name);
                              setEditColor(role.color);
                              setEditIconUrl(role.iconUrl || '');
                              setEditHoist(role.hoist ?? true);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition"
                            title="Edit Role"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-900 transition"
                          title="Delete Role"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Member Assignment Section */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
                <span className="text-xs font-bold text-neutral-200 block uppercase tracking-wider">
                  Assign Role to Member
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} (@{u.username})
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        @{r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAssignRole}
                  disabled={loadingAction}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  {loadingAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Assign Role
                </button>
              </div>

              {/* Members with Custom Roles */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-400 block uppercase tracking-wider">
                  Users & Assigned Roles
                </span>
                <div className="divide-y divide-neutral-800 bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                  {allUsers.map((u) => {
                    const userRoleObjects = (u.assignedRoleIds || [])
                      .map((id) => roles.find((r) => r.id === id))
                      .filter(Boolean) as Role[];

                    return (
                      <div key={u.id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-white text-[10px]"
                            style={{ backgroundColor: u.avatarColor }}
                          >
                            {u.displayName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">{u.displayName}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">@{u.username}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {userRoleObjects.length === 0 ? (
                            <span className="text-[11px] text-neutral-500 italic">No custom roles</span>
                          ) : (
                            userRoleObjects.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                                style={{
                                  backgroundColor: `${r.color}20`,
                                  borderColor: `${r.color}60`,
                                  color: r.color,
                                }}
                              >
                                @{r.name}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRole(u.id, r.id)}
                                  className="hover:opacity-80"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
