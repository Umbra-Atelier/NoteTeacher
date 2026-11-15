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

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
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
        const stream =
          existingStream ||
          (await navigator.mediaDevices.getUserMedia({ audio: true }));
        if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

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
            const resp = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
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
                type: recorder.mimeType || 'audio/webm',
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
        onStatusErrorRef.current?.(
          err instanceof Error
            ? `Microphone access failed: ${err.message}`
            : 'Unable to access microphone.'
        );
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
        if (ev.error === 'not-allowed' || ev.error === 'audio-capture') {
          shouldListenRef.current = false;
          setIsListening(false);
          onStatusErrorRef.current?.(
            ev.error === 'not-allowed'
              ? 'Microphone permission was denied. Please allow microphone access to dictate.'
              : 'No microphone was detected on this device.'
          );
          return;
        }
        if (ev.error === 'service-not-allowed' || ev.error === 'network') {
          // Gracefully switch to server-side MediaRecorder transcription if browser speech service blocked
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
        // Ignore rapid start overlap
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

      // Prompt for microphone permission upfront if supported
      let micStream: MediaStream | undefined;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          shouldListenRef.current = false;
          setIsListening(false);
          onStatusErrorRef.current?.(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Microphone permission denied. Please allow microphone access to dictate.'
              : 'Microphone is unavailable or permission was denied.'
          );
          return;
        }
      }

      if (!shouldListenRef.current || targetBoxIdRef.current !== boxId) {
        micStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      const Ctor = getSpeechRecognitionCtor();
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
    startDictation,
    stopDictation,
    syncBaseTextIfIdle,
  };
}
