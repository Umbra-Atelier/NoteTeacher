import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export type MicPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';
export type DevicePlatform = 'apple' | 'android' | 'windows' | 'other';

export function detectDevicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const platform = (navigator as Navigator & { platform?: string }).platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;
  // Detect iPhone, iPad, iPod, macOS, and iPadOS reporting MacIntel with touch points
  if (/iPad|iPhone|iPod|Macintosh|Mac OS X/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1)) {
    return 'apple';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (/Windows|Win32|Win64/i.test(ua) || /Win/i.test(platform)) {
    return 'windows';
  }
  return 'other';
}

export function getDeniedPermissionHelpMessage(platform: DevicePlatform): string {
  switch (platform) {
    case 'apple':
      return 'Microphone access is blocked. On iPad/iPhone/Mac, tap the "AA" or lock icon in Safari’s address bar (or Settings → Safari/Browser → Microphone) and set Microphone to Allow.';
    case 'android':
      return 'Microphone access is blocked. Tap the lock/tune icon in your browser’s address bar → Permissions → Allow Microphone (and check Android Settings → Apps → Browser → Permissions).';
    case 'windows':
      return 'Microphone access is blocked. Click the lock/mic icon in the browser address bar to allow Microphone, and verify Windows Settings → Privacy & security → Microphone is enabled.';
    default:
      return 'Microphone permission was denied. Please allow microphone access in your browser site settings to dictate.';
  }
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function getPreferredAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Ignore probe error
    }
  }
  return '';
}

function joinTranscriptParts(base: string, addition: string): string {
  const cleanAdd = addition.trim();
  if (!cleanAdd) return base;
  const cleanBase = base.trimEnd();
  if (!cleanBase) return cleanAdd;
  if (/^[.,!?;:)'"\]]/.test(cleanAdd)) {
    return `${cleanBase}${cleanAdd}`;
  }
  return `${cleanBase} ${cleanAdd}`;
}

export interface UseSpeechDictationOptions {
  onTranscriptUpdate: (boxId: string, finalizedText: string, interimText: string) => void;
  onStatusError?: (message: string) => void;
}

export function useSpeechDictation({
  onTranscriptUpdate,
  onStatusError,
}: UseSpeechDictationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [activeTargetBoxId, setActiveTargetBoxId] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermissionState>(() => {
    if (typeof window === 'undefined') return 'unknown';
    const hasGetUserMedia = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasSpeech = Boolean(getSpeechRecognitionCtor());
    if (!hasGetUserMedia && !hasSpeech) return 'unsupported';
    return 'prompt';
  });
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const micPermissionRef = useRef<MicPermissionState>(micPermission);
  micPermissionRef.current = micPermission;
  const platformRef = useRef<DevicePlatform>(detectDevicePlatform());

  const shouldListenRef = useRef(false);
  const targetBoxIdRef = useRef<string | null>(null);
  const baseTextRef = useRef('');
  const latestFinalJoinedRef = useRef('');
  const latestInterimRef = useRef('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimerRef = useRef<number | null>(null);

  // Fallback MediaRecorder refs for browsers lacking Web Speech API
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkLoopTimerRef = useRef<number | null>(null);
  const usingFallbackRef = useRef(false);

  const onTranscriptUpdateRef = useRef(onTranscriptUpdate);
  onTranscriptUpdateRef.current = onTranscriptUpdate;
  const onStatusErrorRef = useRef(onStatusError);
  onStatusErrorRef.current = onStatusError;

  // Probe existing microphone permission status safely across Apple Safari, Windows, and Android
  const refreshMicPermission = useCallback(async (): Promise<MicPermissionState> => {
    if (typeof window === 'undefined') return 'unknown';
    const hasGetUserMedia = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasSpeech = Boolean(getSpeechRecognitionCtor());

    if (!window.isSecureContext && !hasSpeech && !hasGetUserMedia) {
      setMicPermission('unsupported');
      return 'unsupported';
    }

    // 1. Standard Permissions API (Windows Chrome/Edge/Firefox & Android Chrome)
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        });
        const mapped: MicPermissionState =
          status.state === 'granted'
            ? 'granted'
            : status.state === 'denied'
            ? 'denied'
            : 'prompt';
        setMicPermission(mapped);
        status.onchange = () => {
          const nextState: MicPermissionState =
            status.state === 'granted'
              ? 'granted'
              : status.state === 'denied'
              ? 'denied'
              : 'prompt';
          setMicPermission(nextState);
        };
        return mapped;
      } catch {
        // Safari/iOS throws on permissions.query({ name: 'microphone' }) — fall through to enumerateDevices
      }
    }

    // 2. Safari / Apple fallback probe: if audioinput devices already expose non-empty labels, permission is granted
    if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        if (audioInputs.some((d) => Boolean(d.label && d.label.trim().length > 0))) {
          setMicPermission('granted');
          return 'granted';
        }
      } catch {
        // Ignore probe errors
      }
    }

    if (!hasGetUserMedia && !hasSpeech) {
      setMicPermission('unsupported');
      return 'unsupported';
    }

    setMicPermission((prev) => (prev === 'granted' ? 'granted' : 'prompt'));
    return micPermissionRef.current === 'granted' ? 'granted' : 'prompt';
  }, []);

  useEffect(() => {
    void refreshMicPermission();
  }, [refreshMicPermission]);

  // Explicit cross-platform microphone permission request (must be safe to invoke from user clicks across Apple, Windows, Android)
  const requestMicPermission = useCallback(async (opts?: { silentIfUnsupported?: boolean }): Promise<boolean> => {
    const platform = platformRef.current;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setMicPermission('unsupported');
      if (!opts?.silentIfUnsupported) {
        onStatusErrorRef.current?.(
          'Microphone permissions require HTTPS (or localhost). Please open NoteTeacher over HTTPS.'
        );
      }
      return false;
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      setIsRequestingPermission(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setMicPermission('granted');
        micPermissionRef.current = 'granted';
        return true;
      } catch (err) {
        const errName = err instanceof Error ? err.name : '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError'
        ) {
          setMicPermission('denied');
          micPermissionRef.current = 'denied';
          onStatusErrorRef.current?.(getDeniedPermissionHelpMessage(platform));
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          onStatusErrorRef.current?.(
            'No microphone was detected on this device. Connect a microphone and try again.'
          );
        } else {
          onStatusErrorRef.current?.(
            err instanceof Error
              ? `Could not access microphone: ${err.message}`
              : 'Unable to request microphone permission.'
          );
        }
        return false;
      } finally {
        setIsRequestingPermission(false);
      }
    }

    // Fallback: WebKit/Browser where only SpeechRecognition exists without mediaDevices
    const Ctor = getSpeechRecognitionCtor();
    if (Ctor) {
      setMicPermission('prompt');
      return true;
    }

    setMicPermission('unsupported');
    if (!opts?.silentIfUnsupported) {
      onStatusErrorRef.current?.(
        'Microphone access is not supported in this browser. Try Safari, Chrome, or Edge over HTTPS.'
      );
    }
    return false;
  }, []);

  const clearRestartTimer = () => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopMediaRecorderFallback = useCallback(() => {
    if (chunkLoopTimerRef.current !== null) {
      window.clearInterval(chunkLoopTimerRef.current);
      chunkLoopTimerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    usingFallbackRef.current = false;
  }, []);

  const stopDictation = useCallback(() => {
    shouldListenRef.current = false;
    clearRestartTimer();

    const boxId = targetBoxIdRef.current;
    if (boxId) {
      // Commit any lingering interim words cleanly into finalized text on stop
      const committed = latestInterimRef.current
        ? joinTranscriptParts(latestFinalJoinedRef.current, latestInterimRef.current)
        : latestFinalJoinedRef.current;
      baseTextRef.current = committed;
      latestFinalJoinedRef.current = committed;
      latestInterimRef.current = '';
      onTranscriptUpdateRef.current(boxId, committed, '');
    }

    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {}
    }

    stopMediaRecorderFallback();
    setIsListening(false);
  }, [stopMediaRecorderFallback]);

  const startMediaRecorderFallback = useCallback(
    async (boxId: string, existingStream?: MediaStream) => {
      try {
        usingFallbackRef.current = true;
        if (!existingStream && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)) {
          throw new Error('Audio recording API is not available in this browser.');
        }
        const stream =
          existingStream ||
          (await navigator.mediaDevices.getUserMedia({ audio: true }));
        setMicPermission('granted');
        micPermissionRef.current = 'granted';
        if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const preferredMime = getPreferredAudioMimeType();

        const transcribeBlob = async (blob: Blob) => {
          if (blob.size < 1200) return;
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const res = String(reader.result || '');
                const commaIdx = res.indexOf(',');
                resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
              };
              reader.onerror = () => reject(new Error('Failed reading audio'));
              reader.readAsDataURL(blob);
            });
            const rawMime = blob.type || preferredMime || 'audio/webm';
            const cleanMime = rawMime.split(';')[0].trim() || 'audio/webm';
            const resp = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: cleanMime,
              }),
            });
            if (!resp.ok) return;
            const data = (await resp.json()) as { text?: string };
            if (data.text && targetBoxIdRef.current === boxId) {
              const updated = joinTranscriptParts(latestFinalJoinedRef.current, data.text);
              latestFinalJoinedRef.current = updated;
              baseTextRef.current = updated;
              onTranscriptUpdateRef.current(boxId, updated, '');
            }
          } catch {
            // Silently ignore single failed chunk
          }
        };

        const launchRecorderSlice = () => {
          if (!shouldListenRef.current || !mediaStreamRef.current) return;
          const recorder = preferredMime
            ? new MediaRecorder(mediaStreamRef.current, { mimeType: preferredMime })
            : new MediaRecorder(mediaStreamRef.current);
          const chunks: Blob[] = [];
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.onstop = () => {
            if (chunks.length > 0) {
              const fullBlob = new Blob(chunks, {
                type: recorder.mimeType || preferredMime || 'audio/webm',
              });
              void transcribeBlob(fullBlob);
            }
          };
          mediaRecorderRef.current = recorder;
          recorder.start();
          window.setTimeout(() => {
            if (recorder.state === 'recording') {
              try {
                recorder.stop();
              } catch {}
            }
          }, 2600);
        };

        launchRecorderSlice();
        chunkLoopTimerRef.current = window.setInterval(() => {
          if (shouldListenRef.current) {
            launchRecorderSlice();
          }
        }, 2700);
        setIsListening(true);
      } catch (err) {
        shouldListenRef.current = false;
        setIsListening(false);
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setMicPermission('denied');
          micPermissionRef.current = 'denied';
          onStatusErrorRef.current?.(getDeniedPermissionHelpMessage(platformRef.current));
        } else {
          onStatusErrorRef.current?.(
            err instanceof Error
              ? `Microphone access failed: ${err.message}`
              : 'Unable to access microphone.'
          );
        }
      }
    },
    []
  );

  const launchWebSpeech = useCallback(
    (boxId: string, Ctor: SpeechRecognitionCtor) => {
      if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) return;

      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;

      rec.onstart = () => {
        if (shouldListenRef.current && targetBoxIdRef.current === boxId) {
          setMicPermission('granted');
          micPermissionRef.current = 'granted';
          setIsListening(true);
        }
      };

      rec.onresult = (event: SpeechRecognitionEvent) => {
        if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) return;
        let sessionFinal = '';
        let sessionInterim = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript || '';
          if (result.isFinal) {
            sessionFinal = joinTranscriptParts(sessionFinal, transcript);
          } else {
            sessionInterim = joinTranscriptParts(sessionInterim, transcript);
          }
        }
        const combinedFinal = joinTranscriptParts(baseTextRef.current, sessionFinal);
        latestFinalJoinedRef.current = combinedFinal;
        latestInterimRef.current = sessionInterim;
        onTranscriptUpdateRef.current(boxId, combinedFinal, sessionInterim);
      };

      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        if (ev.error === 'aborted' || ev.error === 'no-speech') {
          return;
        }
        if (ev.error === 'not-allowed') {
          shouldListenRef.current = false;
          setIsListening(false);
          setMicPermission('denied');
          micPermissionRef.current = 'denied';
          onStatusErrorRef.current?.(getDeniedPermissionHelpMessage(platformRef.current));
          return;
        }
        if (ev.error === 'audio-capture') {
          shouldListenRef.current = false;
          setIsListening(false);
          onStatusErrorRef.current?.('No microphone was detected on this device.');
          return;
        }
        if (ev.error === 'service-not-allowed' || ev.error === 'network') {
          // Gracefully switch to server-side MediaRecorder transcription (supports Safari MP4 + Chrome/Edge WebM)
          try {
            rec.stop();
          } catch {}
          recognitionRef.current = null;
          if (shouldListenRef.current) {
            void startMediaRecorderFallback(boxId);
          }
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (shouldListenRef.current && targetBoxIdRef.current === boxId && !usingFallbackRef.current) {
          // Commit current session text to baseTextRef and seamlessly restart listening
          baseTextRef.current = latestFinalJoinedRef.current;
          latestInterimRef.current = '';
          onTranscriptUpdateRef.current(boxId, latestFinalJoinedRef.current, '');
          clearRestartTimer();
          restartTimerRef.current = window.setTimeout(() => {
            if (shouldListenRef.current && targetBoxIdRef.current === boxId) {
              launchWebSpeech(boxId, Ctor);
            }
          }, 120);
        } else if (!usingFallbackRef.current) {
          setIsListening(false);
        }
      };

      try {
        rec.start();
        setIsListening(true);
      } catch {
        // On Apple Safari/iOS if gesture expired or overlap happened, try fallback if stream permissions allow
        if (shouldListenRef.current && platformRef.current === 'apple') {
          recognitionRef.current = null;
          void startMediaRecorderFallback(boxId);
        }
      }
    },
    [startMediaRecorderFallback]
  );

  const startDictation = useCallback(
    async (boxId: string, existingText: string) => {
      // Cleanly stop any prior session before starting/resuming this box
      if (recognitionRef.current) {
        const old = recognitionRef.current;
        recognitionRef.current = null;
        old.onresult = null;
        old.onerror = null;
        old.onend = null;
        try {
          old.stop();
        } catch {}
      }
      stopMediaRecorderFallback();
      clearRestartTimer();

      targetBoxIdRef.current = boxId;
      setActiveTargetBoxId(boxId);
      baseTextRef.current = existingText;
      latestFinalJoinedRef.current = existingText;
      latestInterimRef.current = '';
      shouldListenRef.current = true;
      usingFallbackRef.current = false;

      const Ctor = getSpeechRecognitionCtor();
      const platform = platformRef.current;

      // If Web Speech is available and mic permission is ALREADY granted (or on Apple Safari where rec.start() MUST stay synchronous in user gesture),
      // launch Web Speech immediately so we never break iOS/iPadOS/macOS user-activation or stall Android/Windows audio routing.
      if (Ctor && (micPermissionRef.current === 'granted' || platform === 'apple')) {
        launchWebSpeech(boxId, Ctor);
        return;
      }

      // Otherwise prompt for microphone permission upfront via getUserMedia (Windows, Android, or browsers without Web Speech)
      let micStream: MediaStream | undefined;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setMicPermission('granted');
          micPermissionRef.current = 'granted';
        } catch (err) {
          shouldListenRef.current = false;
          setIsListening(false);
          const errName = err instanceof Error ? err.name : '';
          if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
            setMicPermission('denied');
            micPermissionRef.current = 'denied';
            onStatusErrorRef.current?.(getDeniedPermissionHelpMessage(platform));
          } else {
            onStatusErrorRef.current?.(
              'Microphone is unavailable or permission was denied.'
            );
          }
          return;
        }
      } else if (!Ctor) {
        shouldListenRef.current = false;
        setIsListening(false);
        setMicPermission('unsupported');
        micPermissionRef.current = 'unsupported';
        onStatusErrorRef.current?.(
          'Speech dictation is unavailable in this browser context. Please use HTTPS on Safari, Chrome, or Edge.'
        );
        return;
      }

      if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) {
        micStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (Ctor) {
        // Release getUserMedia stream so Web Speech API has clean audio device ownership
        micStream?.getTracks().forEach((t) => t.stop());
        launchWebSpeech(boxId, Ctor);
      } else {
        await startMediaRecorderFallback(boxId, micStream);
      }
    },
    [launchWebSpeech, startMediaRecorderFallback, stopMediaRecorderFallback]
  );

  const syncBaseTextIfIdle = useCallback((boxId: string, text: string) => {
    if (targetBoxIdRef.current === boxId && !shouldListenRef.current) {
      baseTextRef.current = text;
      latestFinalJoinedRef.current = text;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDictation();
    };
  }, [stopDictation]);

  return {
    isListening,
    activeTargetBoxId,
    micPermission,
    isRequestingPermission,
    devicePlatform: platformRef.current,
    requestMicPermission,
    refreshMicPermission,
    startDictation,
    stopDictation,
    syncBaseTextIfIdle,
  };
}
