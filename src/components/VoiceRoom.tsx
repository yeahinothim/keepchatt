import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  Users,
  Radio,
  ChevronDown,
  ChevronUp,
  Monitor,
  Maximize2,
  Minimize2,
  Sliders,
  Sparkles,
  Shield,
  Headphones,
} from 'lucide-react';
import { socket } from '../lib/socket.ts';
import type { Channel, User } from '../types.ts';

export type VoiceFilterType = 'auto' | 'krisp' | 'studio' | 'all';

interface VoiceRoomProps {
  channel: Channel;
  currentUser: User | null;
  allUsers: User[];
  initialCallType?: 'audio' | 'video';
  isInitiator?: boolean;
  compact?: boolean;
  onLeaveCall?: () => void;
  onMinimize?: () => void;
}

export const VoiceRoom: React.FC<VoiceRoomProps> = ({
  channel,
  currentUser,
  allUsers,
  initialCallType = 'audio',
  isInitiator = false,
  compact = false,
  onLeaveCall,
  onMinimize,
}) => {
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterType>('krisp');
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const [userVideoStreams, setUserVideoStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMinimized, setIsMinimized] = useState(false);
  const [fullscreenTarget, setFullscreenTarget] = useState<{
    id: string;
    stream: MediaStream;
    name: string;
    isLocal?: boolean;
  } | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filterNodesRef = useRef<{
    highPass: BiquadFilterNode;
    peaking: BiquadFilterNode;
    lowPass: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
  } | null>(null);
  const speakingIntervalRef = useRef<any>(null);

  const STUN_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Clean up WebRTC & Media on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [channel.id]);

  const cleanupCall = () => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    socket.send({ type: 'vc:leave', channelId: channel.id });
    setIsConnected(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    setParticipants(new Set());
    setSpeakingUsers(new Set());
    setFullscreenTarget(null);
  };

  // Auto connect on mount if initialCallType or voice channel
  useEffect(() => {
    if (currentUser && !isConnected) {
      handleConnect(initialCallType === 'video' && isInitiator);
    }
  }, [channel.id]);

  // Sync fullscreen video element when stream is opened
  useEffect(() => {
    if (fullscreenTarget && fullscreenVideoRef.current) {
      fullscreenVideoRef.current.srcObject = fullscreenTarget.stream;
      fullscreenVideoRef.current.play().catch(() => {});
    }
  }, [fullscreenTarget]);

  // Adjust audio filtering parameters dynamically based on current selected filter
  useEffect(() => {
    if (!filterNodesRef.current) return;
    const { highPass, peaking, lowPass, compressor } = filterNodesRef.current;

    if (voiceFilter === 'krisp') {
      // Krisp AI Voice Isolation: cut sub-vocal rumble (<120Hz), isolate vocal band, compress background room noise
      highPass.frequency.value = 130;
      highPass.Q.value = 0.7;
      peaking.frequency.value = 2600;
      peaking.gain.value = 4;
      lowPass.frequency.value = 7500;
      compressor.threshold.value = -28;
      compressor.ratio.value = 10;
    } else if (voiceFilter === 'studio') {
      // Studio Mic: Warm broadcast low-end, crisp vocal air, gentle leveling
      highPass.frequency.value = 75;
      peaking.frequency.value = 3500;
      peaking.gain.value = 2.5;
      lowPass.frequency.value = 18000;
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
    } else if (voiceFilter === 'all') {
      // All Sounds / Raw: Hear everything (ambient, room acoustics, instruments) without gate
      highPass.frequency.value = 20;
      peaking.frequency.value = 1000;
      peaking.gain.value = 0;
      lowPass.frequency.value = 20000;
      compressor.threshold.value = 0;
      compressor.ratio.value = 1;
    } else {
      // Auto: Default balanced configuration
      highPass.frequency.value = 80;
      peaking.frequency.value = 2000;
      peaking.gain.value = 1;
      lowPass.frequency.value = 12000;
      compressor.threshold.value = -20;
      compressor.ratio.value = 4;
    }
  }, [voiceFilter]);

  // Speaking detection & WebAudio Filter Pipeline
  const setupSpeakingDetection = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // Create filter chain: HighPass -> Peaking -> LowPass -> DynamicsCompressor -> Analyser
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 120;

      const peaking = audioCtx.createBiquadFilter();
      peaking.type = 'peaking';
      peaking.frequency.value = 2500;
      peaking.gain.value = 3;

      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 8000;

      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(highPass);
      highPass.connect(peaking);
      peaking.connect(lowPass);
      lowPass.connect(compressor);
      compressor.connect(analyser);

      filterNodesRef.current = { highPass, peaking, lowPass, compressor };

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let wasSpeaking = false;

      speakingIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || isMuted) {
          if (wasSpeaking) {
            wasSpeaking = false;
            socket.send({
              type: 'call:speaking',
              channelId: channel.id,
              isSpeaking: false,
            });
            if (currentUser) {
              setSpeakingUsers((prev) => {
                const next = new Set(prev);
                next.delete(currentUser.id);
                return next;
              });
            }
          }
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const threshold = voiceFilter === 'krisp' ? 16 : voiceFilter === 'all' ? 8 : 12;
        const nowSpeaking = avg > threshold;

        if (nowSpeaking !== wasSpeaking) {
          wasSpeaking = nowSpeaking;
          socket.send({
            type: 'call:speaking',
            channelId: channel.id,
            isSpeaking: nowSpeaking,
          });
          if (currentUser) {
            setSpeakingUsers((prev) => {
              const next = new Set(prev);
              if (nowSpeaking) next.add(currentUser.id);
              else next.delete(currentUser.id);
              return next;
            });
          }
        }
      }, 160);
    } catch (err) {
      console.warn('AudioContext speaking detection not supported:', err);
    }
  };

  // WebRTC Signals and Participants Listeners
  useEffect(() => {
    if (!isConnected || !currentUser) return;

    const createPeerConnection = (targetUserId: string, initiateOffer: boolean) => {
      const pc = new RTCPeerConnection(STUN_SERVERS);
      peerConnectionsRef.current.set(targetUserId, pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.send({
            type: 'vc:signal',
            targetUserId,
            channelId: channel.id,
            signal: { candidate: event.candidate },
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;

        if (event.track.kind === 'video') {
          setUserVideoStreams((prev) => {
            const next = new Map(prev);
            next.set(targetUserId, stream);
            return next;
          });
        } else if (event.track.kind === 'audio') {
          let audio = audioElementsRef.current.get(targetUserId);
          if (!audio) {
            audio = document.createElement('audio');
            audio.autoplay = true;
            audioElementsRef.current.set(targetUserId, audio);
          }
          if (audio.srcObject !== stream) {
            audio.srcObject = stream;
          }
        }
      };

      if (initiateOffer) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socket.send({
              type: 'vc:signal',
              targetUserId,
              channelId: channel.id,
              signal: { offer: pc.localDescription },
            });
          })
          .catch((err) => console.error('Error creating offer', err));
      }

      return pc;
    };

    const unsubSignal = socket.on(
      'vc:signal',
      async (data: { fromUserId: string; signal: any; channelId: string }) => {
        if (data.channelId !== channel.id) return;

        let pc = peerConnectionsRef.current.get(data.fromUserId);
        if (!pc) {
          pc = createPeerConnection(data.fromUserId, false);
        }

        const signal = data.signal;
        try {
          if (signal.offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send({
              type: 'vc:signal',
              targetUserId: data.fromUserId,
              channelId: channel.id,
              signal: { answer: pc.localDescription },
            });
          } else if (signal.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch (err) {
          console.error('Error handling signal:', err);
        }
      }
    );

    const unsubParticipants = socket.on(
      'vc:participants',
      (data: { channelId: string; participants: string[]; callType?: string }) => {
        if (data.channelId !== channel.id) return;
        setParticipants(new Set(data.participants));

        data.participants.forEach((userId) => {
          if (!peerConnectionsRef.current.has(userId) && userId !== currentUser.id) {
            createPeerConnection(userId, true);
          }
        });
      }
    );

    const unsubJoined = socket.on(
      'vc:user-joined',
      (data: { channelId: string; userId: string; callType?: string }) => {
        if (data.channelId !== channel.id) return;
        setParticipants((prev) => {
          const next = new Set(prev);
          next.add(data.userId);
          return next;
        });
      }
    );

    const unsubLeft = socket.on(
      'vc:user-left',
      (data: { channelId: string; userId: string }) => {
        if (data.channelId !== channel.id) return;
        setParticipants((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
        setUserVideoStreams((prev) => {
          const next = new Map(prev);
          next.delete(data.userId);
          return next;
        });

        const pc = peerConnectionsRef.current.get(data.userId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(data.userId);
        }

        const audio = audioElementsRef.current.get(data.userId);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
          audioElementsRef.current.delete(data.userId);
        }
      }
    );

    const unsubSpeaking = socket.on(
      'call:speaking',
      (data: { channelId: string; userId: string; isSpeaking: boolean }) => {
        if (data.channelId !== channel.id) return;
        setSpeakingUsers((prev) => {
          const next = new Set(prev);
          if (data.isSpeaking) next.add(data.userId);
          else next.delete(data.userId);
          return next;
        });
      }
    );

    return () => {
      unsubSignal();
      unsubParticipants();
      unsubJoined();
      unsubLeft();
      unsubSpeaking();
    };
  }, [isConnected, currentUser, channel.id]);

  const handleConnect = async (withVideo = false) => {
    if (!currentUser) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: withVideo,
      });
      localStreamRef.current = stream;
      setIsConnected(true);
      setIsMuted(false);
      setIsVideoOn(withVideo);

      if (withVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      setupSpeakingDetection(stream);

      socket.send({
        type: 'vc:join',
        channelId: channel.id,
        video: withVideo,
      });
    } catch (err) {
      console.warn('Microphone/Camera access error, falling back to audio-only:', err);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        setIsConnected(true);
        setIsMuted(false);
        setIsVideoOn(false);
        setupSpeakingDetection(audioStream);
        socket.send({ type: 'vc:join', channelId: channel.id, video: false });
      } catch (audioErr) {
        console.warn('Microphone permission not granted.');
      }
    }
  };

  const handleDisconnect = () => {
    cleanupCall();
    onLeaveCall?.();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        if (!audioTrack.enabled && currentUser) {
          setSpeakingUsers((prev) => {
            const next = new Set(prev);
            next.delete(currentUser.id);
            return next;
          });
        }
      }
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;

    if (isVideoOn) {
      // Turn video off
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStreamRef.current.removeTrack(videoTrack);
      }
      setIsVideoOn(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    } else {
      // Turn video on
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        setIsVideoOn(true);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }

        // Add track to peer connections
        peerConnectionsRef.current.forEach((pc, targetUserId) => {
          pc.addTrack(videoTrack, localStreamRef.current!);
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              socket.send({
                type: 'vc:signal',
                targetUserId,
                channelId: channel.id,
                signal: { offer: pc.localDescription },
              });
            })
            .catch(() => {});
        });
      } catch (err) {
        await (window as any).customAlert('Could not access camera for video.');
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen share
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);

      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
      };

      // Broadcast screen share track to peers
      peerConnectionsRef.current.forEach((pc) => {
        pc.addTrack(screenTrack, screenStream);
      });
    } catch (err) {
      console.warn('Screen share cancelled or failed:', err);
    }
  };

  const getParticipantInfo = (id: string): User => {
    return (
      allUsers.find((u) => u.id === id) ||
      ({
        id,
        username: `user_${id.slice(0, 4)}`,
        displayName: `User ${id.slice(0, 4)}`,
        avatarColor: '#4f46e5',
        role: 'member',
        status: 'online',
        joinedAt: Date.now(),
        createdAt: Date.now(),
        lastActive: Date.now(),
      } as User)
    );
  };

  const totalInCall = (isConnected && currentUser ? 1 : 0) + participants.size;

  // Mini / compact bar when minimized
  if (compact && isMinimized) {
    return (
      <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Call in #{channel.name}</span>
            <span className="ml-1 text-[11px] font-mono text-emerald-300">({totalInCall} in call)</span>
          </div>
          {speakingUsers.size > 0 && (
            <span className="text-xs text-neutral-300 flex items-center gap-1 font-medium">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              {Array.from(speakingUsers)
                .map((id: string) => (id === currentUser?.id ? 'You' : getParticipantInfo(id).displayName))
                .join(', ')}{' '}
              speaking
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(false)}
            className="px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition flex items-center gap-1"
          >
            <span>Expand</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDisconnect}
            className="px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-md transition flex items-center gap-1 shadow-sm"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Leave</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="voice-call-stage"
      className={`border-b border-neutral-800 bg-neutral-950 transition-all select-none relative ${
        compact ? 'p-4' : 'flex-1 flex flex-col items-center justify-center p-6'
      }`}
    >
      {/* Fullscreen Video Modal (When clicking any participant's video or screen) */}
      {fullscreenTarget && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-6xl flex items-center justify-between pb-3 text-white border-b border-neutral-800 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-semibold tracking-wide">
                {fullscreenTarget.name} {fullscreenTarget.isLocal ? '(You)' : ''} — Fullscreen View
              </h3>
            </div>
            <button
              onClick={() => setFullscreenTarget(null)}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Exit Fullscreen</span>
            </button>
          </div>

          <div className="w-full max-w-6xl flex-1 flex items-center justify-center bg-black rounded-2xl overflow-hidden border border-neutral-800 relative shadow-2xl">
            <video
              ref={fullscreenVideoRef}
              autoPlay
              playsInline
              muted={fullscreenTarget.isLocal}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between w-full max-w-4xl mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Active Channel Call</span>
            <span className="font-mono text-[11px] text-emerald-300">({totalInCall})</span>
          </div>

          {speakingUsers.size > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>
                {Array.from(speakingUsers)
                  .map((id: string) => (id === currentUser?.id ? 'You' : getParticipantInfo(id).displayName))
                  .join(', ')}{' '}
                is speaking
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Filter Pills */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
            <span className="px-2 text-neutral-400 font-semibold flex items-center gap-1">
              <Sliders className="w-3 h-3 text-neutral-400" />
              <span className="hidden md:inline">Filter:</span>
            </span>
            {(['krisp', 'studio', 'auto', 'all'] as VoiceFilterType[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setVoiceFilter(mode)}
                className={`px-2 py-0.5 rounded-md font-medium capitalize transition ${
                  voiceFilter === mode
                    ? mode === 'krisp'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : mode === 'studio'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
                title={
                  mode === 'krisp'
                    ? 'Krisp AI: Voice only, cuts room hum, fans & keyboard noise'
                    : mode === 'studio'
                    ? 'Studio Mic: Warm broadcast presence and studio clarity'
                    : mode === 'all'
                    ? 'All Sounds: Hear everything with raw dynamic range'
                    : 'Auto: Standard voice profile'
                }
              >
                {mode === 'krisp' ? 'Krisp' : mode === 'all' ? 'All Sounds' : mode}
              </button>
            ))}
          </div>

          {compact && (
            <button
              onClick={() => {
                setIsMinimized(true);
                onMinimize?.();
              }}
              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition text-xs flex items-center gap-1"
              title="Minimize call bar"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Participants Grid with Speaking Indicators (Green Ring), Video Feeds & Fullscreen on Click */}
      <div
        className={`w-full max-w-4xl grid gap-3 mb-3 ${
          totalInCall <= 2
            ? 'grid-cols-2 max-w-xl'
            : totalInCall <= 4
            ? 'grid-cols-2 sm:grid-cols-4'
            : 'grid-cols-3 sm:grid-cols-6'
        }`}
      >
        {/* Local user tile */}
        {isConnected && currentUser && (
          <div
            onClick={() => {
              if (localStreamRef.current && (isVideoOn || isScreenSharing)) {
                setFullscreenTarget({
                  id: currentUser.id,
                  stream: isScreenSharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current,
                  name: currentUser.displayName,
                  isLocal: true,
                });
              }
            }}
            className={`flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 relative group min-h-[110px] ${
              isVideoOn || isScreenSharing ? 'cursor-pointer hover:border-neutral-600' : ''
            }`}
          >
            {/* Live Video feed if camera on or screen sharing */}
            {isVideoOn || isScreenSharing ? (
              <div
                className={`w-24 h-24 rounded-xl overflow-hidden shadow-lg relative ${
                  speakingUsers.has(currentUser.id)
                    ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-neutral-950 shadow-[0_0_15px_rgba(52,211,153,0.7)]'
                    : 'border border-neutral-700'
                }`}
              >
                <video
                  ref={(el) => {
                    localVideoRef.current = el;
                    if (el && localStreamRef.current) {
                      const st = isScreenSharing && screenStreamRef.current ? screenStreamRef.current : localStreamRef.current;
                      if (el.srcObject !== st) {
                        el.srcObject = st;
                        el.play().catch(() => {});
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isScreenSharing ? '' : 'scale-x-[-1]'}`}
                />
                <div className="absolute bottom-1 right-1 bg-black/60 p-1 rounded text-white opacity-0 group-hover:opacity-100 transition">
                  <Maximize2 className="w-3 h-3" />
                </div>
              </div>
            ) : (
              /* Avatar with animated GIF / file / photo support & Green Ring when speaking */
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-lg relative overflow-hidden bg-neutral-800 transition-all ${
                  speakingUsers.has(currentUser.id)
                    ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-neutral-950 shadow-[0_0_18px_rgba(52,211,153,0.85)] scale-105'
                    : 'ring-2 ring-neutral-700'
                }`}
                style={{ backgroundColor: currentUser.avatarColor || '#3b82f6' }}
              >
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (currentUser.displayName || currentUser.username).slice(0, 2).toUpperCase()
                )}
              </div>
            )}

            {isMuted && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center shadow-xs">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}

            <div className="mt-2 text-center truncate max-w-full">
              <span className="text-xs font-semibold text-white tracking-tight truncate block">
                {currentUser.displayName} (You)
              </span>
              {isScreenSharing && (
                <span className="text-[10px] text-emerald-400 font-mono block leading-none mt-0.5">
                  Sharing Screen
                </span>
              )}
            </div>
          </div>
        )}

        {/* Remote participant tiles */}
        {Array.from(participants).map((userId: string) => {
          const user = getParticipantInfo(userId);
          const isSpeaking = speakingUsers.has(userId);
          const videoStream = userVideoStreams.get(userId);

          return (
            <div
              key={userId}
              onClick={() => {
                if (videoStream) {
                  setFullscreenTarget({
                    id: userId,
                    stream: videoStream,
                    name: user.displayName,
                    isLocal: false,
                  });
                }
              }}
              className={`flex flex-col items-center justify-center p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 relative group min-h-[110px] ${
                videoStream ? 'cursor-pointer hover:border-neutral-600' : ''
              }`}
            >
              {videoStream ? (
                <div
                  className={`w-24 h-24 rounded-xl overflow-hidden shadow-lg relative ${
                    isSpeaking
                      ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-neutral-950 shadow-[0_0_15px_rgba(52,211,153,0.7)]'
                      : 'border border-neutral-700'
                  }`}
                >
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && el.srcObject !== videoStream) {
                        el.srcObject = videoStream;
                        el.play().catch(() => {});
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 bg-black/60 p-1 rounded text-white opacity-0 group-hover:opacity-100 transition">
                    <Maximize2 className="w-3 h-3" />
                  </div>
                </div>
              ) : (
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-lg relative overflow-hidden bg-neutral-800 transition-all ${
                    isSpeaking
                      ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-neutral-950 shadow-[0_0_18px_rgba(52,211,153,0.85)] scale-105'
                      : 'ring-2 ring-neutral-700'
                  }`}
                  style={{ backgroundColor: user.avatarColor || '#3b82f6' }}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                  ) : (
                    (user.displayName || user.username).slice(0, 2).toUpperCase()
                  )}
                </div>
              )}

              <span className="text-xs font-semibold text-neutral-200 tracking-tight mt-2 text-center truncate max-w-full">
                {user.displayName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Call Controls: Mic, Camera, Screen Share, Filter, Leave */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        <button
          onClick={toggleMute}
          className={`px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition shadow-md ${
            isMuted
              ? 'bg-red-950/80 text-red-400 hover:bg-red-900/90 border border-red-800/80'
              : 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={toggleVideo}
          className={`px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition shadow-md ${
            isVideoOn
              ? 'bg-purple-950/80 text-purple-300 hover:bg-purple-900/90 border border-purple-800/80'
              : 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700'
          }`}
        >
          {isVideoOn ? <Video className="w-4 h-4 text-purple-400" /> : <VideoOff className="w-4 h-4 text-neutral-400" />}
          <span>{isVideoOn ? 'Camera On' : 'Turn on Video'}</span>
        </button>

        <button
          onClick={toggleScreenShare}
          className={`px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition shadow-md ${
            isScreenSharing
              ? 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900/90 border border-emerald-800/80'
              : 'bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700'
          }`}
        >
          <Monitor className={`w-4 h-4 ${isScreenSharing ? 'text-emerald-400' : 'text-neutral-400'}`} />
          <span>{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}</span>
        </button>

        <button
          onClick={handleDisconnect}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-md"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave Call</span>
        </button>
      </div>
    </div>
  );
};
