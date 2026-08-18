// Reglas de horario del Colegio San Juan. Única fuente de verdad para
// el turno de una sección y el límite de tolerancia de cada turno.

export const TURNOS = {
  MANANA: 'MANANA',
  TARDE: 'TARDE',
};

export const HORARIOS = {
  MANANA: {
    label: 'Turno Mañana',
    secciones: ['A', 'B', 'C', 'D', 'E'],
    ingresoInicio: '07:00',
    tolerancia: '07:10',
    salida: '12:45',
  },
  TARDE: {
    label: 'Turno Tarde',
    secciones: ['F', 'G', 'H'],
    ingresoInicio: '12:30',
    tolerancia: '12:40',
    salida: '18:15',
  },
};

// Mapea una sección (A-H) a su turno correspondiente.
export function seccionATurno(seccion) {
  const s = String(seccion || '').trim().toUpperCase();
  if (HORARIOS.MANANA.secciones.includes(s)) return TURNOS.MANANA;
  if (HORARIOS.TARDE.secciones.includes(s)) return TURNOS.TARDE;
  return null;
}

// Construye un Date de "hoy" con el hh:mm dado, en hora local.
function horaHoyComoDate(hhmm, referencia = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(referencia);
  d.setHours(h, m, 59, 999); // el límite incluye ese minuto completo
  return d;
}

// Evalúa el estado de la marcación (ASISTIO | TARDE) para un turno dado,
// comparando la hora de marcación contra el límite de tolerancia del turno.
export function evaluarEstado(turno, horaMarcacion = new Date()) {
  const horario = HORARIOS[turno];
  if (!horario) throw new Error(`Turno inválido: ${turno}`);

  const limite = horaHoyComoDate(horario.tolerancia, horaMarcacion);
  return horaMarcacion <= limite ? 'ASISTIO' : 'TARDE';
}

// Determina cuál turno está "activo" según la hora actual, usando el punto
// medio entre la salida de la mañana y el inicio de la tarde como corte.
export function turnoActivoPorHora(referencia = new Date()) {
  const minutos = referencia.getHours() * 60 + referencia.getMinutes();
  const corteManana = 11 * 60 + 45; // 11:45, punto medio aprox. entre 10:45 salida-ish y 12:30
  if (minutos < corteManana) return TURNOS.MANANA;
  return TURNOS.TARDE;
}

export function formatearHora(date = new Date()) {
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

// Convierte una hora almacenada como "HH:MM:SS" (24h) a formato 12h con am/pm.
export function formatearHoraDesdeTexto(horaTexto) {
  if (!horaTexto) return '';
  const [h, m] = horaTexto.split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m), 0, 0);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
}
