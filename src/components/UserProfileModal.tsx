import React, { useState, useEffect } from 'react';
import { X, Check, Cookie, LogOut, Upload, Download, Bell, BellOff, Volume2, VolumeX, Sparkles, User as UserIcon, Type, Users, PlusCircle, Trash2, ArrowRightLeft, Lock } from 'lucide-react';
import { api, getSavedAccounts, removeSavedAccount, switchSavedAccount, type SavedAccount } from '../lib/api.ts';
import { type User, AVAILABLE_FONTS } from '../types.ts';


interface UserProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedUser: User) => void;
  onLogout: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onSwitchAccount?: (switchedUser: User, token: string) => void;
  onOpenAuth?: () => void;
}

const COLOR_OPTIONS = [
  '#2563eb', // blue
  '#0d9488', // teal
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#db2777', // pink
  '#475569', // slate
  '#4f46e5', // indigo
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onUpdate,
  onLogout,
  soundEnabled = true,
  onToggleSound,
  onSwitchAccount,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'accounts' | 'security'>('profile');
  const [displayName, setDisplayName] = useState(user.displayName || user.username);
  const [bio, setBio] = useState(user.bio || '');
  const [statusText, setStatusText] = useState(user.statusText || '');
  const [status, setStatus] = useState<User['status']>(user.status || 'online');
  const [avatarColor, setAvatarColor] = useState(user.avatarColor || '#2563eb');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl || '');
  const [fontFamily, setFontFamily] = useState(user.fontFamily || '');
  const [selectedFontCategory, setSelectedFontCategory] = useState<string>('All');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Password reset/change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    setPasswordError(null);

    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changePassword({
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPasswordMsg('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };


  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      const backup = await api.exportBackup();
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `keepchat-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg(`Exported backup with ${backup.accounts?.length || backup.users?.length || 0} accounts & ${backup.messages?.length || 0} messages!`);
    } catch (err: any) {
      setMsg(`Failed to export backup: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await api.importBackup(parsed);
      setMsg(`Imported backup: ${res.usersAdded || 0} users added, ${res.usersUpdated || 0} updated, ${res.messagesCount || 0} messages preserved!`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setMsg(`Failed to import backup: ${err?.message || 'Invalid JSON format'}`);
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  // Sync state whenever user or modal opens
  useEffect(() => {
    if (isOpen) {
      setDisplayName(user.displayName || user.username);
      setBio(user.bio || '');
      setStatusText(user.statusText || '');
      setStatus(user.status || 'online');
      setAvatarColor(user.avatarColor || '#2563eb');
      setAvatarUrl(user.avatarUrl || '');
      setBannerUrl(user.bannerUrl || '');
      setFontFamily(user.fontFamily || '');
      setMsg(null);
      setSavedAccounts(getSavedAccounts());
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleSwitchAccount = async (account: SavedAccount) => {
    if (account.user.id === user.id) return;
    try {
      setSaving(true);
      const switched = switchSavedAccount(account.user.id);
      if (switched) {
        if (onSwitchAccount) {
          onSwitchAccount(switched.user, switched.token);
        } else {
          onUpdate(switched.user);
        }
        setMsg(`Switched account to @${account.user.username}`);
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err: any) {
      setMsg(err?.message || 'Failed to switch account.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAccount = (accUserId: string) => {
    removeSavedAccount(accUserId);
    setSavedAccounts(getSavedAccounts());
  };

  if (!isOpen) return null;

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    if (isGif) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setBannerUrl(ev.target.result as string);
          setMsg('GIF banner loaded! Click "Save Changes" to apply.');
        }
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const optimized = canvas.toDataURL('image/jpeg', 0.85);
            setBannerUrl(optimized);
            setMsg('Banner loaded! Click "Save Changes" to apply.');
          } else {
            setBannerUrl(dataUrl);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an animated GIF
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

    if (isGif) {
      // Keep GIF completely intact as DataURL so animation is preserved
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setAvatarUrl(ev.target.result as string);
          setMsg('GIF avatar loaded! Click "Save Changes" to apply.');
        }
      };
      reader.readAsDataURL(file);
    } else {
      // For PNG / JPEG / WebP, scale to max 384x384 so it saves instantly and doesn't lag
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 384;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const optimized = canvas.toDataURL('image/jpeg', 0.88);
            setAvatarUrl(optimized);
            setMsg('Photo loaded and optimized! Click "Save Changes" to apply.');
          } else {
            setAvatarUrl(dataUrl);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await api.updateProfile({
        displayName,
        bio,
        statusText,
        status,
        avatarColor,
        avatarUrl,
        bannerUrl,
        fontFamily,
      });
      onUpdate(res.user);
      setMsg('Profile updated successfully!');
      setTimeout(() => {
        onClose();
      }, 650);
    } catch (err: any) {
      setMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="profile-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        id="profile-modal-card"
        className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-6 relative overflow-hidden"
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Settings & Identity</h3>
            <p className="text-xs text-neutral-400">Manage profile, avatar, banner, status, and sounds</p>
          </div>
          <button
            id="profile-close-btn"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 pt-3 border-b border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'profile'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            Profile & Avatar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'notifications'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Notifications & Sounds
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'accounts'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Saved Accounts {savedAccounts.length > 0 && `(${savedAccounts.length})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'security'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Security & Password
          </button>
        </div>


        <form onSubmit={handleSave} className="space-y-4 py-4 max-h-[75vh] overflow-y-auto pr-1">
          {activeTab === 'profile' ? (
            <>
              {/* Profile Banner Preview & Upload */}
              <div className="space-y-2 p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-neutral-400">
                    Profile Banner (Link, Image, or Animated GIF)
                  </span>
                  {bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setBannerUrl('')}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      Remove Banner
                    </button>
                  )}
                </div>

                {/* Banner display */}
                <div
                  className="h-24 w-full rounded-lg overflow-hidden border border-neutral-800 relative bg-neutral-800 flex items-center justify-center shadow-inner"
                  style={{ backgroundColor: !bannerUrl ? avatarColor : undefined }}
                >
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt="Banner Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-neutral-500 text-xs font-mono select-none">
                      Default Gradient Banner
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={bannerUrl.startsWith('data:') ? 'Custom file uploaded' : bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    placeholder="https://... or click Upload Banner"
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-neutral-500 transition min-w-0"
                  />
                  <label className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg cursor-pointer transition text-xs font-semibold border border-neutral-700">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Banner</span>
                    <input
                      type="file"
                      accept="image/*,.gif"
                      className="hidden"
                      onChange={handleBannerUpload}
                    />
                  </label>
                </div>
              </div>

              {/* Avatar Preview & Color Choice */}
              <div className="flex items-center gap-4 p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0 shadow-inner overflow-hidden border-2 border-neutral-700 bg-neutral-800"
                  style={{ backgroundColor: avatarColor }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    (displayName || user.username).slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="block text-xs font-semibold uppercase text-neutral-400">
                      Avatar Preview & Background
                    </span>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-[11px] text-red-400 hover:underline"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarColor(c)}
                        className="w-5 h-5 rounded-full border border-black/40 flex items-center justify-center transition hover:scale-110"
                        style={{ backgroundColor: c }}
                      >
                        {avatarColor === c && <Check className="w-3 h-3 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Upload File / GIF or URL */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Profile Picture (File, Photo, or Animated GIF)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={avatarUrl.startsWith('data:') ? 'Custom file uploaded' : avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://... or click Upload File"
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition min-w-0"
                  />
                  <label className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg cursor-pointer transition text-xs font-semibold border border-neutral-700">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept="image/*,.gif"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Supports animated GIFs, PNG, JPG, WebP. Animated GIFs loop continuously!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Display Name
                  </label>
                  <input
                    id="profile-input-displayname"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your friendly name"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                    Status
                  </label>
                  <select
                    id="profile-select-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  >
                    <option value="online">Online</option>
                    <option value="away">Away</option>
                    <option value="busy">Do Not Disturb (Mute Pings)</option>
                  </select>
                </div>
              </div>

              {/* Typography & Stylistic Display Fonts */}
              <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Type className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                      Chat & Profile Typography
                    </span>
                  </div>
                  {fontFamily && (
                    <button
                      type="button"
                      onClick={() => setFontFamily('')}
                      className="text-[11px] text-neutral-400 hover:text-white transition"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>

                {/* Font Category Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
                  {['All', 'Cartoon', 'Blocky', 'Sci-Fi', 'Display', 'Clean'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedFontCategory(cat)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition shrink-0 ${
                        selectedFontCategory === cat
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Font Selection Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {AVAILABLE_FONTS.filter((f) => selectedFontCategory === 'All' || f.category === selectedFontCategory).map((font) => {
                    const isSelected = fontFamily === font.family || (font.id === 'default' && !fontFamily);
                    return (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setFontFamily(font.id === 'default' ? '' : font.family)}
                        className={`p-2 rounded-xl text-left border transition relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                            : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:bg-neutral-900'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                            {font.category}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <div
                          className="text-xs sm:text-sm font-medium truncate py-0.5"
                          style={{ fontFamily: font.family }}
                        >
                          {font.name.split(' (')[0]}
                        </div>
                        <p
                          className="text-[10px] text-neutral-400 truncate opacity-80"
                          style={{ fontFamily: font.family }}
                        >
                          Abc 123 • Keepchat
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Font Input Fallback */}
                <div className="pt-1">
                  <input
                    type="text"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    placeholder="Or type custom font-family name..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-neutral-600 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Status Message
                </label>
                <input
                  id="profile-input-statustext"
                  type="text"
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="What's happening?"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                  Bio / About Me
                </label>
                <textarea
                  id="profile-input-bio"
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A few words about you..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition resize-none"
                />
              </div>
            </>
          ) : activeTab === 'notifications' ? (
            /* Notification Settings Tab */
            <div className="space-y-4">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-neutral-400" />}
                    Chat Sound Effects
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Plays sound chimes when receiving channel messages and @mentions.
                  </p>
                </div>
                {onToggleSound && (
                  <button
                    type="button"
                    onClick={onToggleSound}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      soundEnabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    {soundEnabled ? 'Enabled' : 'Muted'}
                  </button>
                )}
              </div>

              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {status === 'busy' ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4 text-emerald-400" />}
                    Do Not Disturb Mode (DND)
                  </h4>
                  <p className="text-xs text-neutral-400">
                    When active, you will NEVER receive audio pings or sound interruptions even if mentioned.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus((prev) => (prev === 'busy' ? 'online' : 'busy'))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    status === 'busy'
                      ? 'bg-amber-600 text-white hover:bg-amber-500'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {status === 'busy' ? 'DND Active' : 'Normal'}
                </button>
              </div>

              <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg text-xs text-neutral-400 space-y-1">
                <span className="font-semibold text-neutral-300 block">About Presence & Notifications:</span>
                <p>• Online/offline status changes never play sound alerts to avoid sound spam.</p>
                <p>• Only channel messages and direct @mentions play sound effects when enabled.</p>
              </div>
            </div>
          ) : (
            /* Saved Accounts Tab */
            <div className="space-y-4">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-400" />
                      Saved Accounts on this Device
                    </h4>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Switch instantly between multiple profiles without re-entering credentials.
                    </p>
                  </div>
                  {onOpenAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAuth();
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-1.5 transition"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                      Add Account
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {savedAccounts.length === 0 ? (
                    <div className="text-xs text-neutral-500 text-center py-4">
                      No saved accounts recorded on this device yet.
                    </div>
                  ) : (
                    savedAccounts.map((acc) => {
                      const isCurrent = acc.user.id === user.id;
                      return (
                        <div
                          key={acc.user.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                            isCurrent
                              ? 'bg-neutral-900 border-emerald-500/40 ring-1 ring-emerald-500/20'
                              : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 overflow-hidden"
                              style={{ backgroundColor: acc.user.avatarColor || '#3b82f6' }}
                            >
                              {acc.user.avatarUrl ? (
                                <img src={acc.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                (acc.user.displayName || acc.user.username).slice(0, 1).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-white truncate">
                                  {acc.user.displayName || acc.user.username}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400 font-mono truncate">
                                @{acc.user.username} • <span className="capitalize">{acc.user.role || 'member'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isCurrent ? (
                              <button
                                type="button"
                                onClick={() => handleSwitchAccount(acc)}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-100 hover:bg-white text-neutral-900 rounded-md flex items-center gap-1 transition"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                Switch
                              </button>
                            ) : null}
                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAccount(acc.user.id)}
                                title="Remove saved account"
                                className="p-1.5 text-neutral-500 hover:text-red-400 rounded-md hover:bg-neutral-800 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-xl text-xs text-neutral-400 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200">Workspace Backup & Data Persistence</span>
                  <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/50">
                    /export & /import
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  All accounts, login credentials, profiles, chat channels, and message histories are preserved across updates. You can also export or restore JSON backups anytime.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    disabled={isExporting}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExporting ? 'Exporting...' : 'Export Backup JSON'}
                  </button>

                  <label className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 font-medium rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition shadow-sm">
                    <Upload className="w-3.5 h-3.5 text-neutral-400" />
                    {isImporting ? 'Importing...' : 'Import Backup JSON'}
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleImportFile}
                      disabled={isImporting}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  Change Password
                </h4>
                <p className="text-xs text-neutral-400">
                  Update your password to keep your account secure.
                </p>

                {passwordMsg && (
                  <div className="p-2.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-lg text-xs">
                    {passwordMsg}
                  </div>
                )}
                {passwordError && (
                  <div className="p-2.5 bg-red-950/40 text-red-400 border border-red-900/50 rounded-lg text-xs">
                    {passwordError}
                  </div>
                )}

                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-400 mb-1">
                      Current Password <span className="text-neutral-500 font-normal">(optional, verify identity)</span>
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-800 focus:border-neutral-600 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-400 mb-1">
                      New Password (min 4 chars)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-800 focus:border-neutral-600 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-neutral-400 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-neutral-900 border border-neutral-800 focus:border-neutral-600 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none transition"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={passwordLoading}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Session verification info */}
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex items-start gap-2.5 text-xs text-neutral-400">
            <Cookie className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-neutral-300">Continuous Session Cookie</span>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Logged in as <span className="font-mono text-neutral-300">@{user.username}</span>. Your cookie is configured with long-term retention.
              </p>
            </div>
          </div>

          {msg && (
            <p className="text-xs text-center text-emerald-400 bg-emerald-950/40 p-2 rounded-md border border-emerald-900/50">
              {msg}
            </p>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              id="profile-logout-btn"
              type="button"
              onClick={onLogout}
              className="px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/40 rounded-lg flex items-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
              >
                Cancel
              </button>
              {activeTab !== 'security' && (
                <button
                  id="profile-save-btn"
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-white text-neutral-900 rounded-lg hover:bg-neutral-100 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
