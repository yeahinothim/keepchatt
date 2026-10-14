import React, { useState, useMemo } from 'react';
import {
  Users,
  MessageSquare,
  Search,
  UserPlus,
  MoreVertical,
  Check,
  UserMinus,
  Ban,
  Phone,
  Shield,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import type { User } from '../types.ts';

interface FriendsViewProps {
  currentUser: User;
  allUsers: User[];
  onOpenDm: (recipientId: string) => void;
  onToggleFriend: (userId: string) => Promise<void>;
  onBlockUser: (userId: string) => Promise<void>;
  onUnblockUser: (userId: string) => Promise<void>;
}

type TabType = 'online' | 'all' | 'pending' | 'blocked' | 'add_friend';

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUser,
  allUsers,
  onOpenDm,
  onToggleFriend,
  onBlockUser,
  onUnblockUser,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [addFriendInput, setAddFriendInput] = useState('');
  const [addFeedback, setAddFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);

  const friends = useMemo(() => {
    const friendIdSet = new Set(currentUser.friendIds || []);
    return allUsers.filter((u) => u.id !== currentUser.id && friendIdSet.has(u.id));
  }, [allUsers, currentUser.friendIds, currentUser.id]);

  const onlineFriends = useMemo(() => {
    return friends.filter((u) => u.status && u.status !== 'offline');
  }, [friends]);

  const blockedUsers = useMemo(() => {
    const blockedSet = new Set(currentUser.blockedUserIds || []);
    return allUsers.filter((u) => blockedSet.has(u.id));
  }, [allUsers, currentUser.blockedUserIds]);

  // Suggested users to add as friends (users on the site not already friends or blocked)
  const suggestedUsers = useMemo(() => {
    const friendIdSet = new Set(currentUser.friendIds || []);
    const blockedSet = new Set(currentUser.blockedUserIds || []);
    return allUsers
      .filter((u) => u.id !== currentUser.id && !friendIdSet.has(u.id) && !blockedSet.has(u.id))
      .slice(0, 8);
  }, [allUsers, currentUser.friendIds, currentUser.blockedUserIds, currentUser.id]);

  const filteredList = useMemo(() => {
    let baseList = friends;
    if (activeTab === 'online') {
      baseList = onlineFriends;
    } else if (activeTab === 'blocked') {
      baseList = blockedUsers;
    }

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase().trim();
    return baseList.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        (u.statusText && u.statusText.toLowerCase().includes(q))
    );
  }, [activeTab, friends, onlineFriends, blockedUsers, searchQuery]);

  const handleAddFriend = async (targetUsernameOrId?: string) => {
    setAddFeedback(null);
    const query = (targetUsernameOrId || addFriendInput).trim();
    if (!query) return;

    const target = allUsers.find(
      (u) =>
        u.id.toLowerCase() === query.toLowerCase() ||
        u.username.toLowerCase() === query.toLowerCase().replace(/^@/, '') ||
        u.displayName.toLowerCase() === query.toLowerCase()
    );

    if (!target) {
      setAddFeedback({
        type: 'error',
        message: `Hm, didn't work. Double check that the username is spelled correctly.`,
      });
      return;
    }

    if (target.id === currentUser.id) {
      setAddFeedback({
        type: 'error',
        message: `You cannot add yourself as a friend!`,
      });
      return;
    }

    try {
      await onToggleFriend(target.id);
      setAddFeedback({
        type: 'success',
        message: `Success! Added ${target.displayName} (@${target.username}) as a friend!`,
      });
      setAddFriendInput('');
    } catch (err: any) {
      setAddFeedback({
        type: 'error',
        message: err.message || 'Failed to add friend.',
      });
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500';
      case 'away':
        return 'bg-amber-500';
      case 'busy':
        return 'bg-rose-500';
      default:
        return 'bg-neutral-500';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'away':
        return 'Idle';
      case 'busy':
        return 'Do Not Disturb';
      default:
        return 'Offline';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#313338] text-neutral-200 overflow-hidden select-none">
      {/* Top Header Bar */}
      <header className="h-12 border-b border-neutral-800/80 px-4 flex items-center justify-between shrink-0 shadow-sm bg-[#313338]">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-neutral-200 font-semibold pr-4 border-r border-neutral-700/60">
            <Users className="w-5 h-5 text-neutral-400" />
            <span className="text-sm font-semibold tracking-wide">Friends</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-2 text-sm font-medium">
            <button
              onClick={() => setActiveTab('online')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'online'
                  ? 'bg-neutral-700/60 text-white'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              Online
              {onlineFriends.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-300">
                  {onlineFriends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'all'
                  ? 'bg-neutral-700/60 text-white'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              All
              {friends.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-xs font-semibold rounded-full bg-neutral-800 text-neutral-300">
                  {friends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'pending'
                  ? 'bg-neutral-700/60 text-white'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              Pending
            </button>

            <button
              onClick={() => setActiveTab('blocked')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'blocked'
                  ? 'bg-neutral-700/60 text-white'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
              }`}
            >
              Blocked
              {blockedUsers.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 text-xs font-semibold rounded-full bg-rose-900/60 text-rose-300">
                  {blockedUsers.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('add_friend')}
              className={`ml-2 px-3 py-1 rounded-md font-semibold text-xs tracking-wide transition-all ${
                activeTab === 'add_friend'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-600/90 text-white hover:bg-emerald-500'
              }`}
            >
              Add Friend
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-3 text-xs text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {onlineFriends.length} Friends Online
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Friends / Add Friend Column */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          {activeTab === 'add_friend' ? (
            /* Add Friend Tab */
            <div className="max-w-2xl">
              <h2 className="text-base font-bold text-white uppercase tracking-wider mb-2">ADD FRIEND</h2>
              <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                You can add friends with their KeepChat username or display name. It's case-insensitive!
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddFriend();
                }}
                className="relative flex items-center mb-6"
              >
                <input
                  type="text"
                  placeholder="You can add friends with their username..."
                  value={addFriendInput}
                  onChange={(e) => setAddFriendInput(e.target.value)}
                  className="w-full bg-[#1e1f22] border border-neutral-900 focus:border-[#5865f2] rounded-lg px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={!addFriendInput.trim()}
                  className="absolute right-2 px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-50 disabled:hover:bg-[#5865f2] text-white text-xs font-semibold rounded-md transition-all shadow-sm"
                >
                  Send Friend Request
                </button>
              </form>

              {addFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium mb-6 ${
                    addFeedback.type === 'success'
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                      : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                  }`}
                >
                  {addFeedback.message}
                </div>
              )}

              {/* Recommended / Users in KeepChat */}
              <div className="mt-8 border-t border-neutral-800 pt-6">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">
                  PEOPLE YOU MAY KNOW ON KEEPCHAT
                </h3>
                {suggestedUsers.length === 0 ? (
                  <p className="text-xs text-neutral-500">No other users found right now.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {suggestedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] border border-neutral-800/40 transition-colors"
                      >
                        <div className="flex items-center space-x-3 truncate">
                          <div className="relative shrink-0">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.displayName}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                                style={{ backgroundColor: user.avatarColor || '#5865f2' }}
                              >
                                {user.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#2b2d31] ${getStatusColor(
                                user.status
                              )}`}
                            />
                          </div>
                          <div className="truncate">
                            <div className="text-sm font-semibold text-white truncate">{user.displayName}</div>
                            <div className="text-xs text-neutral-400 truncate">@{user.username}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleAddFriend(user.username)}
                            className="p-2 rounded-full bg-[#5865f2]/20 hover:bg-[#5865f2] text-[#5865f2] hover:text-white transition-colors"
                            title="Add Friend"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onOpenDm(user.id)}
                            className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                            title="Send Direct Message"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Online, All, Pending, Blocked Tabs */
            <div>
              {/* Search Bar */}
              <div className="relative mb-5">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1e1f22] rounded-md pl-9 pr-4 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none"
                />
              </div>

              {/* Section Header */}
              <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
                {activeTab === 'online' && `ONLINE — ${filteredList.length}`}
                {activeTab === 'all' && `ALL FRIENDS — ${filteredList.length}`}
                {activeTab === 'pending' && `PENDING REQUESTS — 0`}
                {activeTab === 'blocked' && `BLOCKED USERS — ${filteredList.length}`}
              </h3>

              {/* Friends / Blocked List */}
              {filteredList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-24 h-24 rounded-full bg-[#2b2d31] flex items-center justify-center mb-4">
                    <Users className="w-10 h-10 text-neutral-500" />
                  </div>
                  <h4 className="text-sm font-semibold text-neutral-300 mb-1">
                    {activeTab === 'online' && 'No one is online right now.'}
                    {activeTab === 'all' && 'You have not added any friends yet.'}
                    {activeTab === 'pending' && 'There are no pending friend requests.'}
                    {activeTab === 'blocked' && 'You have not blocked any users.'}
                  </h4>
                  <p className="text-xs text-neutral-500 max-w-sm">
                    {activeTab === 'online' &&
                      'When your friends come online, they will appear right here with their live status.'}
                    {activeTab === 'all' &&
                      'Add friends by clicking the "Add Friend" tab above to start chatting in direct messages!'}
                  </p>
                  {activeTab !== 'add_friend' && (
                    <button
                      onClick={() => setActiveTab('add_friend')}
                      className="mt-4 px-4 py-2 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Find Friends
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-neutral-800/60 border-t border-neutral-800/60">
                  {filteredList.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between py-3 px-2.5 rounded-lg hover:bg-[#35373c]/50 group transition-colors cursor-pointer"
                      onClick={() => onOpenDm(user.id)}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <div className="relative shrink-0">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.displayName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                              style={{ backgroundColor: user.avatarColor || '#5865f2' }}
                            >
                              {user.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#313338] ${getStatusColor(
                              user.status
                            )}`}
                          />
                        </div>

                        <div className="truncate">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-sm font-semibold text-white group-hover:underline">
                              {user.displayName}
                            </span>
                            <span className="text-xs text-neutral-400">@{user.username}</span>
                          </div>
                          <div className="text-xs text-neutral-400 truncate">
                            {user.statusText || getStatusLabel(user.status)}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div
                        className="flex items-center space-x-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeTab === 'blocked' ? (
                          <button
                            onClick={() => onUnblockUser(user.id)}
                            className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-md transition-colors"
                          >
                            Unblock
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => onOpenDm(user.id)}
                              className="w-9 h-9 rounded-full bg-[#2b2d31] hover:bg-[#1e1f22] text-neutral-300 hover:text-white flex items-center justify-center transition-colors"
                              title="Message"
                            >
                              <MessageSquare className="w-5 h-5" />
                            </button>

                            <div className="relative">
                              <button
                                onClick={() =>
                                  setOpenMenuUserId(openMenuUserId === user.id ? null : user.id)
                                }
                                className="w-9 h-9 rounded-full bg-[#2b2d31] hover:bg-[#1e1f22] text-neutral-300 hover:text-white flex items-center justify-center transition-colors"
                                title="More"
                              >
                                <MoreVertical className="w-5 h-5" />
                              </button>

                              {openMenuUserId === user.id && (
                                <div
                                  className="absolute right-0 top-10 w-44 bg-[#111214] border border-neutral-800 rounded-md shadow-xl py-1 z-50 text-xs"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setOpenMenuUserId(null);
                                      onOpenDm(user.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-neutral-200 hover:bg-[#5865f2] hover:text-white flex items-center space-x-2"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>Direct Message</span>
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setOpenMenuUserId(null);
                                      await onToggleFriend(user.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center space-x-2"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                    <span>Remove Friend</span>
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setOpenMenuUserId(null);
                                      await onBlockUser(user.id);
                                    }}
                                    className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-600 hover:text-white flex items-center space-x-2"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    <span>Block</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Active Now Sidebar (Discord-style) */}
        <aside className="w-80 border-l border-neutral-800/80 p-5 hidden lg:flex flex-col bg-[#313338] shrink-0">
          <h3 className="text-sm font-bold text-white tracking-wide mb-4">Active Now</h3>
          {onlineFriends.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-[#2b2d31] flex items-center justify-center mb-3">
                <Sparkles className="w-8 h-8 text-neutral-500" />
              </div>
              <h5 className="text-sm font-semibold text-neutral-300 mb-1">It's quiet for now...</h5>
              <p className="text-xs text-neutral-500">
                When a friend starts listening to music, streaming, or chatting, you'll see it here!
              </p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto">
              {onlineFriends.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => onOpenDm(friend.id)}
                  className="p-3 rounded-lg bg-[#2b2d31] hover:bg-[#35373c] border border-neutral-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="relative shrink-0">
                      {friend.avatarUrl ? (
                        <img
                          src={friend.avatarUrl}
                          alt={friend.displayName}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white"
                          style={{ backgroundColor: friend.avatarColor || '#5865f2' }}
                        >
                          {friend.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#2b2d31] ${getStatusColor(
                          friend.status
                        )}`}
                      />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-white truncate">{friend.displayName}</div>
                      <div className="text-[11px] text-neutral-400 capitalize">{friend.status}</div>
                    </div>
                  </div>
                  {friend.statusText && (
                    <div className="text-xs text-neutral-300 bg-[#1e1f22] p-2 rounded border border-neutral-800/40 italic truncate">
                      "{friend.statusText}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
