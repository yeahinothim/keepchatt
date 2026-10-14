import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Search,
  Music2,
  X,
  Minimize2,
  Maximize2,
  Share2,
  ListMusic,
  Sparkles,
  Radio,
  Clock,
  Loader2,
  Flame,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import type { MusicTrack } from '../types.ts';

interface MusicPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onShareTrack?: (track: MusicTrack) => void;
}

const GENRE_CHIPS = [
  { label: 'Lo-Fi Chill', query: 'lofi chill beats' },
  { label: 'Synthwave', query: 'synthwave 80s electronic' },
  { label: 'Top Hits', query: 'top billboard hits' },
  { label: 'Coding & Focus', query: 'deep focus electronic ambient' },
  { label: 'Gaming & Anime', query: 'gaming soundtrack ost' },
  { label: 'Classic Rock', query: 'classic rock legends' },
  { label: 'Hip-Hop', query: 'hip hop beats rap' },
];

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  isOpen,
  onClose,
  onShareTrack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<MusicTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'browse' | 'search' | 'queue'>('browse');

  // Player state
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Load trending / recommended tracks on mount
  useEffect(() => {
    let mounted = true;
    api.getTrendingMusic()
      .then(({ tracks }) => {
        if (mounted && tracks.length > 0) {
          setTrendingTracks(tracks);
          if (!currentTrack) {
            setCurrentTrack(tracks[0]);
            setQueue(tracks.slice(1));
          }
        }
      })
      .catch((err) => console.warn('Trending music load error:', err));

    return () => {
      mounted = false;
    };
  }, []);

  // Handle Search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const { tracks } = await api.searchMusic(query.trim());
        setSearchResults(tracks);
      } catch (err) {
        console.error('Failed to search tracks:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }, []);

  // Play track helper
  const playTrack = useCallback((track: MusicTrack, newQueue?: MusicTrack[]) => {
    setCurrentTrack(track);
    if (newQueue) {
      setQueue(newQueue.filter((t) => t.id !== track.id));
    }
    setIsPlaying(true);
  }, []);

  // Audio setup and synchronization
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || currentTrack?.duration || 0);
    };

    const handleEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }

      if (queue.length > 0) {
        let nextTrack = queue[0];
        let remaining = queue.slice(1);
        if (isShuffle) {
          const randomIndex = Math.floor(Math.random() * queue.length);
          nextTrack = queue[randomIndex];
          remaining = queue.filter((_, i) => i !== randomIndex);
        }
        playTrack(nextTrack, remaining);
      } else if (repeatMode === 'all' && trendingTracks.length > 0) {
        playTrack(trendingTracks[0], trendingTracks.slice(1));
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const handleError = () => {
      console.warn('Audio playback error on track:', currentTrack?.title);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [currentTrack, queue, repeatMode, isShuffle, playTrack, trendingTracks]);

  // Handle audio source updates
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;
    if (audio.src !== currentTrack.streamUrl) {
      audio.src = currentTrack.streamUrl;
      audio.currentTime = 0;
      if (isPlaying) {
        audio.play().catch((err) => {
          console.warn('Playback play request failed:', err);
          setIsPlaying(false);
        });
      }
    }
  }, [currentTrack]);

  // Handle Play/Pause
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.play().catch((err) => {
        console.warn('Audio play request blocked or failed:', err);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  // Handle volume changes
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  // Skip forward / Next track
  const handleNext = () => {
    if (queue.length > 0) {
      const next = queue[0];
      playTrack(next, queue.slice(1));
    } else if (trendingTracks.length > 0) {
      playTrack(trendingTracks[0], trendingTracks.slice(1));
    }
  };

  // Skip back / Previous track
  const handlePrevious = () => {
    if (!audioRef.current) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
    } else if (trendingTracks.length > 0) {
      playTrack(trendingTracks[0]);
    }
  };

  // Seek bar scrub
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!isOpen) return null;

  // Minimized Bottom Player Bar (like Spotify's persistent footer bar)
  if (isMinimized) {
    return (
      <div
        id="minimized-music-player"
        className="fixed bottom-3 right-4 z-50 flex items-center gap-3 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-2xl px-4 py-2.5 shadow-2xl transition-all duration-200 animate-in fade-in slide-in-from-bottom-4"
        style={{ width: 'min(440px, calc(100vw - 32px))' }}
      >
        {/* Album art */}
        <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-neutral-800 border border-neutral-700">
          {currentTrack?.artworkUrl ? (
            <img
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className={`w-full h-full object-cover ${isPlaying ? 'scale-105' : ''} transition-transform duration-500`}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-emerald-400">
              <Music2 className="w-5 h-5" />
            </div>
          )}
          {isPlaying && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-0.5">
              <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-semibold text-white truncate">
              {currentTrack ? currentTrack.title : 'No Track Playing'}
            </h4>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium shrink-0">
              Spotify Style
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 truncate">
            {currentTrack?.artist || 'Search or pick a song'}
          </p>
          {/* Micro Progress Bar */}
          <div className="w-full bg-neutral-800 h-1 rounded-full mt-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-150"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg transition active:scale-95"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={handleNext}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
            title="Expand Player"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition"
            title="Close Player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Full Spotify-like Music Modal
  return (
    <div
      id="full-music-player-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6"
    >
      <div
        className="w-full max-w-2xl bg-gradient-to-b from-neutral-900 to-[#121212] border border-neutral-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800/80 bg-neutral-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm">
              <Music2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  KeepMusic
                </h3>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Spotify Engine
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">Search & stream any song with chat sharing</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
              title="Minimize to dock"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs & Search Input */}
        <div className="px-5 pt-3 pb-2 border-b border-neutral-800 shrink-0 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              id="music-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setActiveTab('search');
                handleSearch(e.target.value);
              }}
              placeholder="Search tracks, artists, albums (e.g. Blinding Lights, Queen, Lofi, Daft Punk)..."
              className="w-full bg-neutral-800/80 border border-neutral-700/80 rounded-xl py-2 pl-10 pr-10 text-xs sm:text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition"
            />
            {isSearching ? (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 animate-spin" />
            ) : searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setActiveTab('browse');
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Quick Genre Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {GENRE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => {
                  setActiveTab('search');
                  handleSearch(chip.query);
                }}
                className="px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white whitespace-nowrap text-[11px] font-medium transition border border-neutral-700/60 shrink-0"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 text-xs font-semibold pt-1">
            <button
              onClick={() => setActiveTab('browse')}
              className={`pb-1.5 px-1 border-b-2 transition ${
                activeTab === 'browse'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                Featured & Hits
              </span>
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`pb-1.5 px-1 border-b-2 transition ${
                activeTab === 'search'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Search Results ({searchResults.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`pb-1.5 px-1 border-b-2 transition ${
                activeTab === 'queue'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <ListMusic className="w-3.5 h-3.5" />
                Play Queue ({queue.length})
              </span>
            </button>
          </div>
        </div>

        {/* Main Content Area (Scrollable Tracks) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {activeTab === 'search' && (
            <>
              {isSearching ? (
                <div className="py-12 text-center text-neutral-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                  <p className="text-xs">Searching global music catalog...</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-12 text-center text-neutral-400">
                  <Radio className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No tracks found. Try searching for an artist or song name above.</p>
                </div>
              ) : (
                searchResults.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`group flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : 'bg-neutral-800/40 border-neutral-800/80 hover:bg-neutral-800/80 hover:border-neutral-700 text-neutral-300'
                      }`}
                      onClick={() => playTrack(track, searchResults)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 shrink-0 border border-neutral-700/60">
                          {track.artworkUrl ? (
                            <img
                              src={track.artworkUrl}
                              alt={track.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                              <Music2 className="w-4 h-4" />
                            </div>
                          )}
                          <div
                            className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                              isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isCurrent && isPlaying ? (
                              <Pause className="w-4 h-4 text-emerald-400 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4 className={`text-xs font-semibold truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {track.artist} {track.album ? `• ${track.album}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {formatTime(track.duration)}
                        </span>
                        {onShareTrack && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onShareTrack(track);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded-lg hover:bg-neutral-700/60 transition"
                            title="Share to chat channel"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === 'browse' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Trending Tracks & Radio
                </h4>
                <span className="text-[11px] text-neutral-400">Click any track to stream</span>
              </div>

              <div className="space-y-1.5">
                {trendingTracks.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`group flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                        isCurrent
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                          : 'bg-neutral-800/40 border-neutral-800/80 hover:bg-neutral-800/80 hover:border-neutral-700 text-neutral-300'
                      }`}
                      onClick={() => playTrack(track, trendingTracks)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 shrink-0 border border-neutral-700/60">
                          {track.artworkUrl ? (
                            <img
                              src={track.artworkUrl}
                              alt={track.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                              <Music2 className="w-4 h-4" />
                            </div>
                          )}
                          <div
                            className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                              isCurrent && isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            {isCurrent && isPlaying ? (
                              <Pause className="w-4 h-4 text-emerald-400 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <h4 className={`text-xs font-semibold truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {track.artist} {track.album ? `• ${track.album}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {formatTime(track.duration)}
                        </span>
                        {onShareTrack && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onShareTrack(track);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded-lg hover:bg-neutral-700/60 transition"
                            title="Share to channel"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Up Next ({queue.length})
                </h4>
                {queue.length > 0 && (
                  <button
                    onClick={() => setQueue([])}
                    className="text-[11px] text-neutral-400 hover:text-red-400 transition"
                  >
                    Clear Queue
                  </button>
                )}
              </div>

              {queue.length === 0 ? (
                <div className="py-12 text-center text-neutral-400">
                  <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Queue is empty. Pick a song to queue up!</p>
                </div>
              ) : (
                queue.map((track, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/40 border border-neutral-800/80 hover:bg-neutral-800/80 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-neutral-400 w-4 text-center">
                        {idx + 1}
                      </span>
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                        {track.artworkUrl ? (
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <Music2 className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate">
                          {track.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {track.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => playTrack(track, queue.filter((_, i) => i !== idx))}
                        className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded-lg hover:bg-neutral-700/60 transition"
                        title="Play now"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setQueue((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-700/60 transition"
                        title="Remove from queue"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Persistent Playback Deck (Spotify Console) */}
        <div className="p-4 bg-neutral-950 border-t border-neutral-800/80 shrink-0">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            {/* Current Track Thumb & Info */}
            <div className="flex items-center gap-3 w-full sm:w-1/3 min-w-0">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-neutral-800 shrink-0 border border-neutral-700/80 shadow-md">
                {currentTrack?.artworkUrl ? (
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-400">
                    <Music2 className="w-5 h-5" />
                  </div>
                )}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/20 flex items-end justify-center pb-1 gap-0.5">
                    <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-4 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                  {currentTrack ? currentTrack.title : 'No Track Selected'}
                </h4>
                <p className="text-[11px] text-neutral-400 truncate">
                  {currentTrack?.artist || 'Pick a song to start'}
                </p>
              </div>

              {currentTrack && onShareTrack && (
                <button
                  onClick={() => onShareTrack(currentTrack)}
                  className="p-1.5 text-neutral-400 hover:text-emerald-400 rounded-lg hover:bg-neutral-800 transition shrink-0"
                  title="Share current track into chat"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Core Playback Controls & Scrubber */}
            <div className="flex-1 w-full flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`p-1.5 rounded-lg transition ${
                    isShuffle ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="Shuffle"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handlePrevious}
                  className="p-1.5 text-neutral-300 hover:text-white transition active:scale-95"
                  title="Previous"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg transition active:scale-95"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={handleNext}
                  className="p-1.5 text-neutral-300 hover:text-white transition active:scale-95"
                  title="Next"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    if (repeatMode === 'off') setRepeatMode('all');
                    else if (repeatMode === 'all') setRepeatMode('one');
                    else setRepeatMode('off');
                  }}
                  className={`p-1.5 rounded-lg transition ${
                    repeatMode !== 'off' ? 'text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title={`Repeat: ${repeatMode}`}
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Progress Scrubber */}
              <div className="w-full flex items-center gap-2 text-[10px] font-mono text-neutral-400">
                <span className="w-7 text-right">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.5}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition"
                />
                <span className="w-7">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center justify-end gap-2 w-1/4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1 text-neutral-400 hover:text-white transition"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  setIsMuted(false);
                }}
                className="w-20 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
