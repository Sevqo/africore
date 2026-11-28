import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { audit, fail, type Access } from '../platform/auth';
import { agentTranscribeInput } from './contracts';

const execFileAsync = promisify(execFile);

export interface AgentTranscriptionResult {
  transcript: string;
  engine: 'local_whisper_http' | 'local_whisper_cli' | 'browser_speech_fallback';
  local_model_ready: boolean;
  duration_ms: number;
  bytes_received: number;
  note: string;
}

const MAX_AUDIO_BYTES = 3 * 1024 * 1024; // 3 MiB max voice clip

function extForMime(mime: string): string {
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mp4')) return '.m4a';
  if (mime.includes('mpeg')) return '.mp3';
  return '.webm';
}

export async function transcribeAgentVoice(
  a: Access,
  input: unknown,
): Promise<AgentTranscriptionResult> {
  if (a.api) fail(403, 'Human session required for voice transcription');
  const d = agentTranscribeInput.parse(input);

  const audioBuf = d.audio_base64 ? Buffer.from(d.audio_base64, 'base64') : Buffer.alloc(0);
  if (audioBuf.length > MAX_AUDIO_BYTES) {
    fail(400, 'Voice recording exceeds the 3 MiB clip limit. Keep clips under 2 minutes.');
  }

  // 1. Local Whisper HTTP sidecar (e.g. faster-whisper-server or whisper.cpp server)
  const whisperUrl = (process.env.AFRICORE_WHISPER_URL || '').trim();
  if (whisperUrl && audioBuf.length > 0) {
    try {
      const target = new URL(whisperUrl);
      if (!['http:', 'https:'].includes(target.protocol)) {
        throw new Error('Invalid whisper URL protocol');
      }
      const form = new FormData();
      form.append(
        'file',
        new Blob([audioBuf], { type: d.mime_type }),
        `voice${extForMime(d.mime_type)}`,
      );
      form.append('language', d.language);
      const res = await fetch(target.toString(), {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) {
        const json: any = await res.json().catch(() => ({}));
        const transcript = String(json.text || json.transcript || '').trim();
        if (transcript) {
          await audit(a.org, a.actor, 'agent.voice_transcribed', 'local_whisper_http');
          return {
            transcript,
            engine: 'local_whisper_http',
            local_model_ready: true,
            duration_ms: d.duration_ms,
            bytes_received: audioBuf.length,
            note: 'Transcribed privately by your local Whisper HTTP service.',
          };
        }
      }
    } catch {
      /* fall through to CLI or client transcript */
    }
  }

  // 2. Local Whisper CLI binary (e.g. whisper / whisper-cli)
  const whisperBin = (process.env.AFRICORE_WHISPER_BIN || '').trim();
  if (whisperBin && audioBuf.length > 0) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'africore-voice-'));
    const audioPath = path.join(tmpDir, `${randomUUID()}${extForMime(d.mime_type)}`);
    try {
      await fs.writeFile(audioPath, audioBuf);
      const { stdout } = await execFileAsync(
        whisperBin,
        [audioPath, '--language', d.language, '--output_format', 'txt'],
        { timeout: 25_000, maxBuffer: 1024 * 1024 },
      );
      const transcript = String(stdout || '').trim();
      if (transcript) {
        await audit(a.org, a.actor, 'agent.voice_transcribed', 'local_whisper_cli');
        return {
          transcript,
          engine: 'local_whisper_cli',
          local_model_ready: true,
          duration_ms: d.duration_ms,
          bytes_received: audioBuf.length,
          note: 'Transcribed privately by your local Whisper CLI model.',
        };
      }
    } catch {
      /* fall through to browser fallback */
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // 3. Immediate browser-captured speech transcript fallback (100% local, zero cloud upload)
  const transcript = d.client_transcript.trim();
  await audit(a.org, a.actor, 'agent.voice_transcribed', 'browser_speech_fallback');
  return {
    transcript,
    engine: 'browser_speech_fallback',
    local_model_ready: false,
    duration_ms: d.duration_ms,
    bytes_received: audioBuf.length,
    note: transcript
      ? 'Captured locally via browser voice recognition. Set AFRICORE_WHISPER_URL or AFRICORE_WHISPER_BIN to plug in your local Whisper model.'
      : 'Audio clip captured locally, but no speech text was detected by your browser. Type your note or configure AFRICORE_WHISPER_URL / AFRICORE_WHISPER_BIN for offline Whisper transcription.',
  };
}
