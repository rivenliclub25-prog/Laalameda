/**
 * Sonido y vibración para la pantalla del camarero. El sonido se genera con la Web Audio API
 * (sin archivos). La preferencia de sonido se recuerda en este dispositivo.
 */

const SOUND_KEY = 'alameda-canjear-sonido';

export function loadSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada, solo no se recuerda.
  }
}

let audioContext: AudioContext | null = null;

function tone(ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

/** "ok": dos tonos agudos. "error": un tono grave. */
export function playFeedback(kind: 'ok' | 'error', soundEnabled: boolean) {
  navigator.vibrate?.(kind === 'ok' ? [70, 40, 70] : [250]);
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext ??= new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume();
    if (kind === 'ok') {
      tone(audioContext, 880, 0, 0.12, 'sine');
      tone(audioContext, 1320, 0.13, 0.16, 'sine');
    } else {
      tone(audioContext, 180, 0, 0.35, 'square');
    }
  } catch {
    // Sin audio disponible: solo vibración.
  }
}
