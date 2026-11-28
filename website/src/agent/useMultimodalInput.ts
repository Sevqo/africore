import { useCallback, useEffect, useRef, useState } from 'react';
import type { API } from '../operations/UI';

export interface AgentImageAttachment {
  kind: 'image';
  filename: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  data_url: string;
  alt_text?: string;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result || '');
      resolve(str.includes(',') ? str.split(',', 2)[1] : str);
    };
    reader.onerror = () => reject(new Error('Could not read audio clip.'));
    reader.readAsDataURL(blob);
  });
}

export function useMultimodalInput(
  api: API,
  onTranscript: (text: string) => void,
  onError: (msg: string) => void,
) {
  const [attachments, setAttachments] = useState<AgentImageAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveSpeech, setLiveSpeech] = useState('');
  const [voiceNote, setVoiceNote] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef<any>(null);
  const speechTextRef = useRef('');
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const stopCleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {
        /* ignore */
      }
      speechRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCleanup(), [stopCleanup]);

  const addImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files || []);
      if (!list.length) return;
      const next: AgentImageAttachment[] = [];
      for (const file of list) {
        if (attachments.length + next.length >= MAX_ATTACHMENTS) {
          onError(`Attach up to ${MAX_ATTACHMENTS} images per message.`);
          break;
        }
        if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
          onError('Only PNG, JPEG, and WebP images are supported.');
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          onError(`"${file.name}" exceeds the 2 MB image limit.`);
          continue;
        }
        try {
          const data_url = await readFileAsDataUrl(file);
          next.push({
            kind: 'image',
            filename: file.name || 'pasted-image.png',
            mime_type: file.type as AgentImageAttachment['mime_type'],
            data_url,
          });
        } catch (err) {
          onError((err as Error).message);
        }
      }
      if (next.length) {
        setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
      }
    },
    [attachments.length, onError],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const startVoiceRecording = useCallback(async () => {
    if (recording || transcribing) return;
    setVoiceNote('');
    setLiveSpeech('');
    speechTextRef.current = '';
    chunksRef.current = [];

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError('Microphone capture is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const durationMs = Math.max(0, Date.now() - startTimeRef.current);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const capturedSpeech = speechTextRef.current.trim();
        stopCleanup();
        setRecording(false);
        setRecordSeconds(0);
        setTranscribing(true);
        try {
          const audio_base64 = blob.size > 0 ? await blobToBase64(blob) : '';
          const res = await api('/agent/transcribe', 'POST', {
            audio_base64,
            mime_type: mimeType,
            duration_ms: durationMs,
            client_transcript: capturedSpeech,
            language: 'en',
          });
          const text = String(res?.transcript || capturedSpeech || '').trim();
          if (text) {
            onTranscript(text);
          }
          if (res?.note) setVoiceNote(String(res.note));
        } catch (err) {
          if (capturedSpeech) {
            onTranscript(capturedSpeech);
          } else {
            onError((err as Error).message);
          }
        } finally {
          setTranscribing(false);
          setLiveSpeech('');
        }
      };

      // Optional live browser SpeechRecognition preview alongside MediaRecorder
      const SpeechCtor =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechCtor) {
        try {
          const rec = new SpeechCtor();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (event: any) => {
            let full = '';
            for (let i = 0; i < event.results.length; i++) {
              full += event.results[i][0]?.transcript || '';
            }
            speechTextRef.current = full.trim();
            setLiveSpeech(full.trim());
          };
          rec.onerror = () => {
            /* MediaRecorder still captures audio cleanly */
          };
          rec.start();
          speechRef.current = rec;
        } catch {
          /* ignore */
        }
      }

      startTimeRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      stopCleanup();
      onError('Microphone permission was denied. Allow microphone access in your browser to record voice instructions.');
    }
  }, [api, onError, onTranscript, recording, stopCleanup, transcribing]);

  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopCleanup();
      setRecording(false);
    }
  }, [stopCleanup]);

  return {
    attachments,
    addImageFiles,
    removeAttachment,
    clearAttachments,
    recording,
    transcribing,
    recordSeconds,
    liveSpeech,
    voiceNote,
    startVoiceRecording,
    stopVoiceRecording,
  };
}
