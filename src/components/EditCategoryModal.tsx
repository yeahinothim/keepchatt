import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Shield,
  Check,
  Lock,
  Unlock,
  Eye,
  MessageSquare,
  Users,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type { ChannelCategory, Role } from '../types.ts';

interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: ChannelCategory | null;
  availableRoles: Role[];
  onUpdated: (category: ChannelCategory) => void;
}

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  onClose,
  category,
  availableRoles = [],
  onUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'permissions'>('general');
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [syncChannels, setSyncChannels] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<{
    canView: string[];
    canType: string[];
  }>({
    canView: ['*'],
    canType: ['*'],
  });

  useEffect(() => {
    if (category) {
      setName(category.name);
      setIsPrivate(category.isPrivate || false);
      setPermissions({
        canView: category.permissions?.canView || ['*'],
        canType: category.permissions?.canType || ['*'],
      });
      setSyncChannels(false);
      setActiveTab('general');
      setError(null);
    }
  }, [category]);

  if (!isOpen || !category) return null;

  const handleTogglePrivate = (checked: boolean) => {
    setIsPrivate(checked);
    if (checked) {
      setPermissions((prev) => ({
        ...prev,
        canView: prev.canView.filter((id) => id !== '*'),
      }));
    } else {
      setPermissions((prev) => ({
        ...prev,
        canView: Array.from(new Set([...prev.canView, '*'])),
      }));
    }
  };

  const togglePermission = (permKey: 'canView' | 'canType', roleId: string) => {
    setPermissions((prev) => {
      const currentList = prev[permKey];
      const has = currentList.includes(roleId);
      return {
        ...prev,
        [permKey]: has ? currentList.filter((id) => id !== roleId) : [...currentList, roleId],
      };
    });
  };

  const setAllRoles = (permKey: 'canView' | 'canType', allow: boolean) => {
    setPermissions((prev) => {
      if (!allow) {
        return { ...prev, [permKey]: [] };
      }
      return {
        ...prev,
        [permKey]: ['*', ...availableRoles.map((r) => r.id)],
      };
    });
  };

  const setEveryoneOnly = (permKey: 'canView' | 'canType') => {
    setPermissions((prev) => ({
      ...prev,
      [permKey]: ['*'],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const res = await api.editCategory(category.id, name.trim(), {
        permissions,
        isPrivate,
        syncChannels,
      });
      onUpdated(res.category);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to edit category');
    } finally {
      setLoading(false);
    }
  };

  const PERM_ROWS = [
    {
      key: 'canView' as const,
      label: 'View Category & Channels',
      desc: 'Controls who can see this category heading and any nested channels in the sidebar.',
      icon: Eye,
      iconColor: 'text-sky-400',
    },
    {
      key: 'canType' as const,
      label: 'Send Messages',
      desc: 'Controls who can type / post messages inside the channels grouped under this category.',
      icon: MessageSquare,
      iconColor: 'text-violet-400',
    },
  ];

  return (
    <div
      id="edit-category-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        id="edit-category-modal-card"
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-neutral-800 rounded-xl">
              <Settings className="w-5 h-5 text-emerald-400 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Category Settings</h3>
              <p className="text-xs text-neutral-400">Configure name, private status, and role access permissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Row */}
        <div className="flex border-b border-neutral-800 bg-neutral-900/40 px-5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'general'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            General Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'permissions'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Roles & Permissions
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl text-xs text-red-300">
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Category Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Category Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CUSTOMER CHANNELS"
                  required
                  autoFocus
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-neutral-600 transition uppercase tracking-wide"
                />
              </div>

              {/* Private Category Setting */}
              <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-xl space-y-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-amber-500 shrink-0">
                      {isPrivate ? <Lock className="w-5 h-5 animate-pulse" /> : <Unlock className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">Private Category</h4>
                      <p className="text-[11px] text-neutral-400 leading-normal mt-0.5">
                        Restricts reading and viewing of all channels grouped under this category to designated roles only.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => handleTogglePrivate(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 peer-checked:after:bg-emerald-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-950/40 peer-checked:border-emerald-500 border border-neutral-700"></div>
                  </label>
                </div>

                {isPrivate && (
                  <div className="p-2.5 bg-amber-950/20 border border-amber-900/40 rounded-lg text-[10.5px] text-amber-300 leading-normal">
                    💡 <strong>Notice:</strong> This category is private. Make sure to select which roles can view this category in the <strong>Roles & Permissions</strong> tab, otherwise it will be administrator-only.
                  </div>
                )}
              </div>

              {/* Sync Options */}
              <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-xl flex items-start gap-3.5">
                <div className="p-2 bg-neutral-900 border border-neutral-800 rounded-lg text-emerald-400 shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wide">Sync Permissions to Channels</h4>
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-normal">
                        Overwrite permissions on all channels inside this category to match these settings immediately.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={syncChannels}
                        onChange={(e) => setSyncChannels(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 peer-checked:after:bg-emerald-400 after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-950/40 peer-checked:border-emerald-500 border border-neutral-700"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    Category Role Access Override
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Designate access permissions for roles in this category. Click to toggle.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 shrink-0">
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{availableRoles.length + 1} Role(s)</span>
                </div>
              </div>

              <div className="space-y-4">
                {PERM_ROWS.map((row) => {
                  const IconComp = row.icon;
                  const currentPermissions = permissions[row.key] || [];
                  const selectedCount = currentPermissions.length;
                  const isEveryone = currentPermissions.includes('*');

                  return (
                    <div
                      key={row.key}
                      className="p-4 bg-neutral-950/90 border border-neutral-800 hover:border-neutral-750 rounded-xl transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className={`p-2 rounded-lg bg-neutral-900 border border-neutral-850 ${row.iconColor}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-white">{row.label}</h4>
                              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400">
                                {isEveryone ? 'Everyone' : `${selectedCount} Role(s)`}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-normal mt-0.5">{row.desc}</p>
                          </div>
                        </div>

                        {/* Presets */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEveryoneOnly(row.key)}
                            className="px-2 py-1 text-[10px] font-semibold text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-md transition"
                          >
                            @everyone
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllRoles(row.key, true)}
                            className="px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-350 bg-neutral-900 border border-neutral-800 hover:bg-emerald-950/30 rounded-md transition"
                          >
                            Allow All
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllRoles(row.key, false)}
                            className="px-2 py-1 text-[10px] font-semibold text-neutral-500 hover:text-red-400 bg-neutral-900 border border-neutral-800 hover:bg-red-950/30 rounded-md transition"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Selector badges */}
                      <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-neutral-900">
                        {/* @everyone selection */}
                        <button
                          type="button"
                          onClick={() => togglePermission(row.key, '*')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition ${
                            currentPermissions.includes('*')
                              ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300 shadow-sm'
                              : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-white hover:bg-neutral-800'
                          }`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              currentPermissions.includes('*') ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                            }`}
                          />
                          <span>@everyone</span>
                          {currentPermissions.includes('*') && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>

                        {/* Available Roles selection */}
                        {availableRoles.map((r) => {
                          const active = currentPermissions.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => togglePermission(row.key, r.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition ${
                                active
                                  ? 'bg-neutral-900 text-white shadow-sm'
                                  : 'bg-neutral-900/60 border-neutral-850 text-neutral-400 hover:text-white hover:bg-neutral-800'
                              }`}
                              style={{ borderColor: active ? r.color || '#3b82f6' : undefined }}
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: r.color || '#3b82f6' }}
                              />
                              <span style={{ color: active ? r.color || '#ffffff' : undefined }}>{r.name}</span>
                              {active && <Check className="w-3.5 h-3.5" style={{ color: r.color || '#3b82f6' }} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
