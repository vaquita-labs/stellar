'use client';

// Efectos de sonido de la edición del mapa, sintetizados con Web Audio API:
// cero assets que descargar (un mp3 por efecto pesaría más que todo este
// módulo) y latencia nula. Cada efecto es un oscilador corto con barrido de
// frecuencia + fade out exponencial.

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioContext;
};

const blip = (startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  // Los navegadores crean el contexto suspendido hasta el primer gesto del
  // usuario; estos efectos siempre disparan desde un tap/click, así que
  // reanudar aquí alcanza.
  if (ctx.state === 'suspended') void ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

/** Pop ascendente y alegre: objeto colocado. */
export const sfxPlace = () => blip(380, 640, 0.12, 'triangle', 0.15);

/** Plop descendente: objeto quitado. */
export const sfxRemove = () => blip(420, 160, 0.16, 'triangle', 0.15);

/** Tick corto mecánico: objeto rotado. */
export const sfxRotate = () => blip(520, 780, 0.06, 'square', 0.07);
