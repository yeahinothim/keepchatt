import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import type { LinkPreviewData } from '../types.ts';
import { Globe, Music, Film, ExternalLink, Play, Download } from 'lucide-react';

const previewCache = new Map<string, LinkPreviewData>();

// Helper to extract YouTube video ID
export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  return match ? match[1] : null;
}

// Helper to check if URL is direct media
export function getDirectMediaType(url: string): 'image' | 'video' | 'audio' | null {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.match(/\.(png|jpe?g|gif|webp|svg)$/)) return 'image';
  if (cleanUrl.match(/\.(mp4|webm|mov|mkv|ogv)$/)) return 'video';
  if (cleanUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/)) return 'audio';
  return null;
}

export function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  // Match URLs starting with http:// or https://
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  const matches = text.match(urlRegex) || [];
  // Deduplicate URLs
  return Array.from(new Set(matches));
}

interface LinkPreviewProps {
  url: string;
}

export const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const youtubeId = extractYouTubeId(url);
  const directMediaType = getDirectMediaType(url);

  // Initial state from cache or fast heuristics
  const [data, setData] = useState<LinkPreviewData | null>(() => {
    if (previewCache.has(url)) return previewCache.get(url)!;
    if (youtubeId) {
      return {
        url,
        title: 'YouTube',
        description: 'Share your videos with friends, family, and the world.',
        siteName: 'YouTube',
        imageUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
        mediaType: 'youtube',
        videoId: youtubeId,
      };
    }
    if (directMediaType) {
      return {
        url,
        siteName: new URL(url).hostname,
        mediaType: directMediaType,
        imageUrl: directMediaType === 'image' ? url : undefined,
      };
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(!previewCache.has(url) && !directMediaType);
  const [error, setError] = useState<boolean>(false);
  const [showVideoPlayer, setShowVideoPlayer] = useState<boolean>(true);
  const [downloadedMedia, setDownloadedMedia] = useState<{ url: string; title: string; filename: string } | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  const handleDownloadMedia = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await api.downloadMedia(url);
      if (res && res.url) {
        setDownloadedMedia(res);
      } else {
        setDownloadError('Unable to extract video with yt-dlp');
      }
    } catch (err: any) {
      setDownloadError(err.message || 'yt-dlp download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    if (previewCache.has(url)) {
      setData(previewCache.get(url)!);
      setLoading(false);
      return;
    }

    if (directMediaType) {
      const initial: LinkPreviewData = {
        url,
        siteName: new URL(url).hostname,
        mediaType: directMediaType,
        imageUrl: directMediaType === 'image' ? url : undefined,
      };
      previewCache.set(url, initial);
      setData(initial);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getLinkPreview(url)
      .then((res) => {
        if (!isMounted) return;
        previewCache.set(url, res);
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        // Fallback for YouTube or general website
        if (youtubeId) {
          const fallback: LinkPreviewData = {
            url,
            title: 'YouTube',
            description: 'Share your videos with friends, family, and the world.',
            siteName: 'YouTube',
            imageUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            mediaType: 'youtube',
            videoId: youtubeId,
          };
          previewCache.set(url, fallback);
          setData(fallback);
        } else {
          try {
            const host = new URL(url).hostname;
            const fallback: LinkPreviewData = {
              url,
              title: host,
              description: `Visit ${host}`,
              siteName: host,
              mediaType: 'website',
            };
            setData(fallback);
          } catch {
            setError(true);
          }
        }
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [url, youtubeId, directMediaType]);

  if (error || (!data && !loading)) {
    return null;
  }

  // If media has been converted/downloaded via yt-dlp, render direct video player
  if (downloadedMedia) {
    return (
      <div className="mt-2.5 max-w-lg rounded-xl overflow-hidden border border-emerald-800/80 bg-neutral-950 shadow-xl animate-in fade-in duration-150">
        <div className="px-3.5 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 truncate">
            <Film className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-white truncate">{downloadedMedia.title || 'Converted Video (yt-dlp)'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded">
              yt-dlp direct
            </span>
            <a
              href={downloadedMedia.url}
              download={downloadedMedia.filename || 'video.mp4'}
              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition"
            >
              Save MP4
            </a>
          </div>
        </div>
        <video
          src={downloadedMedia.url}
          controls
          autoPlay={false}
          preload="metadata"
          playsInline
          className="w-full max-h-80 object-contain bg-black"
        />
      </div>
    );
  }

  // 1. Direct Image Link
  if (data?.mediaType === 'image' || directMediaType === 'image') {
    return (
      <div className="mt-2.5 inline-block max-w-md rounded-xl overflow-hidden border border-neutral-800/80 shadow-md transition">
        <a href={url} target="_blank" rel="noreferrer" className="block cursor-pointer">
          <img
            src={data?.imageUrl || url}
            alt="Shared image"
            className="max-h-80 w-auto h-auto max-w-full rounded-xl object-cover hover:scale-[1.01] transition"
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  // 2. Direct Video File (.mp4, .webm, etc.)
  if (data?.mediaType === 'video' || directMediaType === 'video') {
    return (
      <div className="mt-2.5 max-w-lg rounded-xl overflow-hidden border border-neutral-800 bg-black shadow-lg">
        <div className="px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-300">
          <div className="flex items-center gap-1.5 truncate">
            <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate font-medium">{url.split('/').pop()?.split('?')[0] || 'Video'}</span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            download
            className="text-neutral-400 hover:text-white flex items-center gap-1 text-[11px] hover:underline shrink-0"
          >
            <span>Open</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="max-h-80 w-full object-contain bg-black"
        />
      </div>
    );
  }

  // 3. Direct Audio File (.mp3, .wav, etc.)
  if (data?.mediaType === 'audio' || directMediaType === 'audio') {
    return (
      <div className="mt-2.5 max-w-md rounded-xl p-3 border border-neutral-800 bg-neutral-950 shadow-md">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-neutral-200 truncate">
                {url.split('/').pop()?.split('?')[0] || 'Audio track'}
              </p>
              <p className="text-[10px] text-neutral-400 font-mono">Audio file</p>
            </div>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            download
            className="text-[11px] text-neutral-400 hover:text-white hover:underline shrink-0"
          >
            Download
          </a>
        </div>
        <audio controls src={url} className="w-full h-9 rounded" preload="metadata" />
      </div>
    );
  }

  // 4. YouTube Video or YouTube Link
  if (data?.mediaType === 'youtube' || youtubeId) {
    const vId = data?.videoId || youtubeId;

    return (
      <div className="mt-2.5 max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-lg border-l-4 border-l-red-600 transition-all hover:border-neutral-700">
        <div className="p-3.5 space-y-1">
          {/* Header with YouTube branding */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
              <svg className="w-4 h-4 text-red-500 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <span className="font-semibold text-neutral-200">YouTube</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isDownloading}
                onClick={handleDownloadMedia}
                title="Download video with yt-dlp backend and replace embed with direct player"
                className="text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 bg-neutral-900 hover:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700 transition disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <div className="w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Direct stream (yt-dlp)</span>
                  </>
                )}
              </button>
              {vId && (
                <button
                  type="button"
                  onClick={() => setShowVideoPlayer(!showVideoPlayer)}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 transition"
                >
                  <Play className="w-2.5 h-2.5 text-red-400" />
                  <span>{showVideoPlayer ? 'Hide player' : 'Watch video'}</span>
                </button>
              )}
            </div>
          </div>

          {downloadError && (
            <div className="text-[11px] text-red-400 bg-red-950/40 p-1.5 rounded border border-red-900/60 mt-1">
              {downloadError}
            </div>
          )}

          {/* Link URL */}
          <div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-400 hover:underline break-all inline-flex items-center gap-1"
            >
              <span>{url}</span>
              <ExternalLink className="w-3 h-3 shrink-0 inline opacity-70" />
            </a>
          </div>

          {/* Title */}
          <h4 className="text-sm font-bold text-white pt-1 leading-snug">
            {data?.title || 'YouTube'}
          </h4>

          {/* Description */}
          <p className="text-xs text-neutral-300 leading-relaxed">
            {data?.description || 'Share your videos with friends, family, and the world.'}
          </p>
        </div>

        {/* Embedded YouTube Player */}
        {vId && showVideoPlayer && (
          <div className="px-3.5 pb-3.5">
            <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-neutral-800 shadow-inner">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${vId}?autoplay=0&rel=0&modestbranding=1`}
                title={data?.title || 'YouTube Video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. General Website Metadata Card
  return (
    <div className="mt-2.5 max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden shadow-md border-l-4 border-l-neutral-600 transition-all hover:border-neutral-700">
      <div className="p-3.5 space-y-1">
        {/* Header with Site Name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
            <Globe className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="font-semibold text-neutral-200">
              {data?.siteName || (url ? new URL(url).hostname : 'Website')}
            </span>
          </div>
          <button
            onClick={() => setIsPreviewing(!isPreviewing)}
            className="text-[11px] bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded hover:bg-neutral-700 hover:text-white transition"
          >
            {isPreviewing ? 'Close Preview' : 'Preview (Proxy)'}
          </button>
        </div>

        {/* Link URL */}
        <div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-400 hover:underline break-all inline-flex items-center gap-1"
          >
            <span>{url}</span>
            <ExternalLink className="w-3 h-3 shrink-0 inline opacity-70" />
          </a>
        </div>

        {/* Title */}
        {data?.title && (
          <h4 className="text-sm font-bold text-white pt-1 leading-snug">
            {data.title}
          </h4>
        )}

        {/* Description */}
        {data?.description && (
          <p className="text-xs text-neutral-300 leading-relaxed line-clamp-3">
            {data.description}
          </p>
        )}
      </div>

      {/* Optional Thumbnail Image OR Iframe Preview */}
      {isPreviewing ? (
        <div className="px-3.5 pb-3.5">
          <div className="w-full aspect-video bg-black rounded-lg border border-neutral-800 overflow-hidden">
            <iframe src={`/api/browser/proxy?url=${encodeURIComponent(url)}`} className="w-full h-full" title="Preview" />
          </div>
        </div>
      ) : data?.imageUrl ? (
        <div className="px-3.5 pb-3.5">
          <a href={url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-neutral-800">
            <img
              src={data.imageUrl}
              alt={data.title || 'Link preview'}
              className="max-h-48 w-full object-cover hover:scale-[1.01] transition bg-neutral-900"
              loading="lazy"
            />
          </a>
        </div>
      ) : null}
    </div>
  );
};
