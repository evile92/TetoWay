import type { Lang } from '../types/transit';

export type RideToneKind = 'start' | 'approaching' | 'arriving' | 'passed';

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioCtor) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try {
      sharedAudioCtx = new AudioCtor();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

/**
 * Unlock Web Audio playback synchronously inside a user tap gesture (required on iOS Safari & Android Chrome)
 * so subsequent GPS-triggered alerts play reliably without browser autoplay blocks.
 */
export function unlockRideAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      // Ignore audio resume denial in restricted environments
    });
  }
}

interface ChimeNote {
  freq: number;
  offsetSec: number;
  durationSec: number;
  gain: number;
}

const CHIME_SEQUENCES: Record<RideToneKind, ChimeNote[]> = {
  start: [{ freq: 587.33, offsetSec: 0, durationSec: 0.14, gain: 0.12 }],
  approaching: [
    { freq: 659.25, offsetSec: 0, durationSec: 0.18, gain: 0.2 },
    { freq: 880.0, offsetSec: 0.2, durationSec: 0.26, gain: 0.22 },
  ],
  arriving: [
    { freq: 523.25, offsetSec: 0, durationSec: 0.16, gain: 0.22 },
    { freq: 659.25, offsetSec: 0.18, durationSec: 0.16, gain: 0.24 },
    { freq: 1046.5, offsetSec: 0.36, durationSec: 0.36, gain: 0.26 },
  ],
  passed: [
    { freq: 783.99, offsetSec: 0, durationSec: 0.18, gain: 0.2 },
    { freq: 523.25, offsetSec: 0.2, durationSec: 0.28, gain: 0.22 },
  ],
};

/** Synthesize a clear, offline transit chime using Web Audio API (no external MP3 files required). */
export function playRideAlertTone(kind: RideToneKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.02;
    const notes = CHIME_SEQUENCES[kind];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.offsetSec);

      const start = now + note.offsetSec;
      const end = start + note.durationSec;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Ignore audio synthesis errors on locked/headless contexts
  }
}

const VIBRATION_PATTERNS: Record<Exclude<RideToneKind, 'start'>, number[]> = {
  approaching: [220, 120, 220],
  arriving: [350, 120, 350, 120, 500],
  passed: [180, 90, 180, 90, 180],
};

/** Trigger tactile vibration patterns on supported mobile devices (graceful no-op on desktop/iOS). */
export function triggerRideVibration(kind: Exclude<RideToneKind, 'start'>): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATION_PATTERNS[kind]);
    }
  } catch {
    // Ignore vibration errors in restricted browsers
  }
}

/** Speak a short offline voice prompt if a matching voice for the selected language exists. */
export function speakRideAnnouncement(text: string, lang: Lang): void {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return;
  }

  try {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const targetPrefix = lang === 'ar' ? 'ar' : 'en';
    const matchingVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith(targetPrefix),
    );

    // If voices are loaded and no Arabic voice is installed on the device,
    // skip TTS gracefully instead of letting an English voice mispronounce Arabic text.
    if (lang === 'ar' && voices.length > 0 && !matchingVoice) {
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = matchingVoice?.lang ?? (lang === 'ar' ? 'ar-MA' : 'en-US');
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }
    utterance.rate = 0.98;
    utterance.volume = 1;
    synth.speak(utterance);
  } catch {
    // Ignore TTS failures on unsupported browsers
  }
}

/** Stop any active spoken alert immediately. */
export function cancelRideSpeech(): void {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore cancel errors
  }
}

/** Request Screen Wake Lock so the phone display stays lit during the bus ride. */
export async function requestScreenWakeLock(
  onRelease?: () => void,
): Promise<WakeLockSentinel | null> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.wakeLock ||
      typeof navigator.wakeLock.request !== 'function'
    ) {
      return null;
    }
    const sentinel = await navigator.wakeLock.request('screen');
    if (onRelease && typeof sentinel.addEventListener === 'function') {
      sentinel.addEventListener('release', onRelease);
    }
    return sentinel;
  } catch {
    return null;
  }
}

export async function releaseScreenWakeLock(
  sentinel: WakeLockSentinel | null,
): Promise<void> {
  if (!sentinel || sentinel.released) return;
  try {
    await sentinel.release();
  } catch {
    // Ignore already-released sentinel errors
  }
}
