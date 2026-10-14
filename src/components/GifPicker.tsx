import React, { useState, useEffect } from 'react';
import { Search, Star, Sparkles, Upload, X, Film, Music, Paperclip } from 'lucide-react';
import type { MessageAttachment } from '../types.ts';

interface GifPickerProps {
  onSelectGif: (attachment: MessageAttachment) => void;
  onClose: () => void;
}

export interface FavoriteItem {
  id: string;
  url: string;
  title: string;
  type?: 'gif' | 'image' | 'video' | 'audio' | 'file';
  size?: number;
}

const DEFAULT_POPULAR_GIFS: FavoriteItem[] = [
  { id: 'g1', url: 'https://media.tenor.com/2roX3uxz_68AAAAM/cat-dance.gif', title: 'Cat Dance', type: 'gif' },
  { id: 'g2', url: 'https://media.tenor.com/y2JXkY1pXkwAAAAM/cat-vibing.gif', title: 'Vibing Cat', type: 'gif' },
  { id: 'g3', url: 'https://media.tenor.com/pU4tM6sB7kAAAAAM/pop-cat.gif', title: 'Pop Cat', type: 'gif' },
  { id: 'g4', url: 'https://media.tenor.com/gOq7v9q7-3wAAAAM/dancing-duck.gif', title: 'Dancing Duck', type: 'gif' },
  { id: 'g5', url: 'https://media.tenor.com/849J_Xp9pXIAAAAM/mind-blown.gif', title: 'Mind Blown', type: 'gif' },
  { id: 'g6', url: 'https://media.tenor.com/12s3kF9x-bEAAAAM/thumbs-up.gif', title: 'Thumbs Up', type: 'gif' },
  { id: 'g7', url: 'https://media.tenor.com/o1bW8nZ7Z7oAAAAM/laughing.gif', title: 'Laughing', type: 'gif' },
  { id: 'g8', url: 'https://media.tenor.com/GfPXom_-caIAAAAM/cheers.gif', title: 'Cheers', type: 'gif' },
  { id: 'g9', url: 'https://media.tenor.com/X4sF7m4j2wUAAAAM/fire-elmo.gif', title: 'Elmo Fire', type: 'gif' },
  { id: 'g10', url: 'https://media.tenor.com/9n9s57p-08UAAAAM/sus-cat.gif', title: 'Sus Cat', type: 'gif' },
  { id: 'g11', url: 'https://media.tenor.com/u_4qJ8t02kUAAAAM/celebrate.gif', title: 'Celebrate', type: 'gif' },
  { id: 'g12', url: 'https://media.tenor.com/o5X4r2jK7oMAAAAM/shrug.gif', title: 'Shrug', type: 'gif' },
];

export const FAVORITES_STORAGE_KEY = 'chat_favorite_gifs';

export const GifPicker: React.FC<GifPickerProps> = ({ onSelectGif, onClose }) => {
  const [activeTab, setActiveTab] = useState<'trending' | 'favorites' | 'custom'>('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [favoriteGifs, setFavoriteGifs] = useState<FavoriteItem[]>([]);

  const loadFavorites = () => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (saved) {
        setFavoriteGifs(JSON.parse(saved));
      } else {
        setFavoriteGifs([]);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadFavorites();
    const handleUpdate = () => loadFavorites();
    window.addEventListener('favorites-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('favorites-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const saveFavorites = (newFavs: FavoriteItem[]) => {
    setFavoriteGifs(newFavs);
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavs));
      window.dispatchEvent(new CustomEvent('favorites-updated'));
    } catch {
      // Ignore
    }
  };

  const toggleFavorite = (gif: FavoriteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const exists = favoriteGifs.some((f) => f.url === gif.url);
    if (exists) {
      saveFavorites(favoriteGifs.filter((f) => f.url !== gif.url));
    } else {
      saveFavorites([...favoriteGifs, gif]);
    }
  };

  const isFavorited = (url: string) => favoriteGifs.some((f) => f.url === url);

  const displayedGifs = activeTab === 'favorites'
    ? favoriteGifs.filter((g) => (g.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : DEFAULT_POPULAR_GIFS.filter((g) => (g.title || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    const url = customUrl.trim();
    let type: MessageAttachment['type'] = 'gif';
    if (url.match(/\.(mp4|webm|mov)(\?|$)/i)) type = 'video';
    else if (url.match(/\.(mp3|wav|ogg|m4a)(\?|$)/i)) type = 'audio';
    else if (url.match(/\.(png|jpe?g|webp|svg)(\?|$)/i)) type = 'image';

    onSelectGif({
      type,
      url,
      name: 'Custom Media',
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        let type: MessageAttachment['type'] = 'file';
        if (file.type.startsWith('image/')) type = file.type === 'image/gif' ? 'gif' : 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';

        onSelectGif({
          type,
          url: reader.result,
          name: file.name,
          size: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="absolute bottom-16 right-4 w-96 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-sm text-white">Tenor & GIFs / Saved Files</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-950/40 px-3 pt-2 gap-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('trending')}
          className={`pb-2 px-2 border-b-2 transition ${
            activeTab === 'trending'
              ? 'border-emerald-500 text-white font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Trending
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`pb-2 px-2 border-b-2 flex items-center gap-1.5 transition ${
            activeTab === 'favorites'
              ? 'border-emerald-500 text-white font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          Saved & Favorites ({favoriteGifs.length})
        </button>
        <button
          onClick={() => setActiveTab('custom')}
          className={`pb-2 px-2 border-b-2 transition ${
            activeTab === 'custom'
              ? 'border-emerald-500 text-white font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Custom / File
        </button>
      </div>

      {activeTab !== 'custom' && (
        <div className="p-2 border-b border-neutral-800 bg-neutral-950/20">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search GIFs & favorited files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-3 max-h-80 overflow-y-auto min-h-64">
        {activeTab === 'custom' ? (
          <div className="space-y-4 py-2">
            <form onSubmit={handleCustomSubmit} className="space-y-2">
              <label className="text-xs font-medium text-neutral-300">Insert Tenor, GIF, or Media URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://media.tenor.com/... or .gif URL"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                <button
                  type="submit"
                  disabled={!customUrl.trim()}
                  className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-neutral-900 rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </form>

            <div className="relative border-t border-neutral-800 pt-4">
              <span className="text-xs font-medium text-neutral-300 block mb-2">Or Upload GIF / Media / File from Computer</span>
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-neutral-700 hover:border-neutral-500 rounded-xl cursor-pointer bg-neutral-950/50 hover:bg-neutral-950 transition">
                <Upload className="w-6 h-6 text-neutral-400 mb-2" />
                <span className="text-xs text-neutral-300 font-medium">Click or Drag GIF / File here</span>
                <span className="text-[10px] text-neutral-500 mt-1">Supports GIF, PNG, JPG, MP4, MP3, Documents</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayedGifs.length === 0 ? (
              <div className="col-span-2 py-12 text-center text-xs text-neutral-500">
                {activeTab === 'favorites'
                  ? 'No saved favorites yet. Click the star on any GIF, image, video, audio, or attached file in chat to save it here!'
                  : 'No GIFs found.'}
              </div>
            ) : (
              displayedGifs.map((item) => {
                const fav = isFavorited(item.url);
                const isMediaImage = !item.type || item.type === 'gif' || item.type === 'image' || item.url.match(/\.(gif|jpg|jpeg|png|webp|svg)(\?|$)/i) || item.url.startsWith('data:image/');
                const isVideo = item.type === 'video' || item.url.match(/\.(mp4|webm|mov)(\?|$)/i) || item.url.startsWith('data:video/');
                const isAudio = item.type === 'audio' || item.url.match(/\.(mp3|wav|ogg|m4a)(\?|$)/i) || item.url.startsWith('data:audio/');

                let resolvedType: MessageAttachment['type'] = 'gif';
                if (isVideo) resolvedType = 'video';
                else if (isAudio) resolvedType = 'audio';
                else if (item.type === 'image') resolvedType = 'image';
                else if (!isMediaImage) resolvedType = 'file';

                return (
                  <div
                    key={item.id || item.url}
                    onClick={() =>
                      onSelectGif({
                        type: resolvedType,
                        url: item.url,
                        name: item.title,
                        size: item.size,
                      })
                    }
                    className="relative group rounded-lg overflow-hidden cursor-pointer bg-neutral-950 aspect-video border border-neutral-800 hover:border-neutral-600 transition flex flex-col items-center justify-center p-2"
                  >
                    {isMediaImage ? (
                      <img
                        src={item.url}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200 absolute inset-0"
                      />
                    ) : isVideo ? (
                      <div className="flex flex-col items-center justify-center text-center p-2 z-0">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center mb-1">
                          <Film className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-medium text-neutral-200 line-clamp-1">{item.title}</span>
                        <span className="text-[9px] text-neutral-500 font-mono">Video file</span>
                      </div>
                    ) : isAudio ? (
                      <div className="flex flex-col items-center justify-center text-center p-2 z-0">
                        <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-1">
                          <Music className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-medium text-neutral-200 line-clamp-1">{item.title}</span>
                        <span className="text-[9px] text-neutral-500 font-mono">Audio file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-2 z-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-1">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-medium text-neutral-200 line-clamp-1">{item.title}</span>
                        <span className="text-[9px] text-neutral-500 font-mono">Document / File</span>
                      </div>
                    )}

                    {/* Star Favorite Button in Top-Left */}
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(item, e)}
                      title={fav ? 'Remove from favorites' : 'Add to favorites'}
                      className={`absolute top-1.5 left-1.5 p-1 rounded-md backdrop-blur-md transition z-10 ${
                        fav
                          ? 'bg-black/70 text-amber-400 opacity-100'
                          : 'bg-black/50 text-white/70 opacity-0 group-hover:opacity-100 hover:text-amber-400'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400' : ''}`} />
                    </button>

                    {/* Title overlay for images */}
                    {isMediaImage && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 px-2 opacity-0 group-hover:opacity-100 transition z-10">
                        <p className="text-[10px] text-white truncate font-medium">{item.title}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
