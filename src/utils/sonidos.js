// Sonidos de feedback del escáner, sintetizados con la Web Audio API (sin
// archivos de audio ni dependencias). Cada resultado de marcación tiene un
// timbre distinto para reconocerlo sin mirar la pantalla.

let ctx = null;

function obtenerContexto() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Debe llamarse dentro de un gesto del usuario (p. ej. al iniciar la cámara)
// para que el navegador permita reproducir audio después.
export function desbloquearAudio() {
  const c = obtenerContexto();
  if (c && c.state === 'suspended') c.resume();
}

// Reproduce un tono con envolvente suave (evita "clics" al iniciar/cortar).
function tono(c, freq, inicio, duracion, { volumen = 0.22, tipo = 'sine' } = {}) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = tipo;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);

  const t0 = c.currentTime + inicio;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volumen, t0 + 0.012);
  gain.gain.setValueAtTime(volumen, t0 + duracion - 0.04);
  gain.gain.linearRampToValueAtTime(0, t0 + duracion);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
}

// Patrón de sonido por tipo de resultado.
const PATRONES = {
  // ASISTIÓ: dos notas ascendentes, alegre (A5 -> D6).
  ASISTIO: (c) => {
    tono(c, 880.0, 0, 0.12);
    tono(c, 1174.66, 0.12, 0.18);
  },
  // TARDE: dos notas descendentes, tono de aviso (E5 -> C5).
  TARDE: (c) => {
    tono(c, 659.25, 0, 0.15);
    tono(c, 523.25, 0.16, 0.22);
  },
  // TURNO INCORRECTO ("horario no correspondido"): doble zumbido grave.
  TURNO_INCORRECTO: (c) => {
    tono(c, 311.13, 0, 0.15, { tipo: 'square', volumen: 0.18 });
    tono(c, 311.13, 0.22, 0.15, { tipo: 'square', volumen: 0.18 });
  },
  // DUPLICADO ("usted ya registró hoy"): dos notas neutras, "ya está".
  DUPLICADO: (c) => {
    tono(c, 587.33, 0, 0.1, { tipo: 'triangle' });
    tono(c, 587.33, 0.14, 0.18, { tipo: 'triangle' });
  },
  // Resto (fuera de horario, no encontrado, error): zumbido grave descendente.
  ERROR: (c) => {
    tono(c, 415.3, 0, 0.14, { tipo: 'sawtooth', volumen: 0.16 });
    tono(c, 277.18, 0.15, 0.26, { tipo: 'sawtooth', volumen: 0.16 });
  },
};

// Reproduce el sonido correspondiente al tipo de resultado de la marcación.
export function reproducirSonido(tipo) {
  const c = obtenerContexto();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  const patron = PATRONES[tipo] || PATRONES.ERROR;
  try {
    patron(c);
  } catch {
    /* si el audio falla, no interrumpimos el registro */
  }
}
