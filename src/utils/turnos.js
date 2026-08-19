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

// Extrae el número de grado para comparar formatos distintos: "1°",
// "1ro secundaria", "1RO" -> "1". Si no hay número, cae al texto en
// mayúsculas. Sirve para emparejar el grado del auxiliar (guardado como
// "1°") con el del alumno (importado como "1ro secundaria").
export function gradoNumero(grado) {
  const m = String(grado || '').match(/\d+/);
  return m ? m[0] : String(grado || '').trim().toUpperCase();
}

// Clave normalizada "numeroGrado|SECCION" para comparar jurisdicciones sin
// importar cómo esté escrito el grado.
export function claveGradoSeccion(grado, seccion) {
  return `${gradoNumero(grado)}|${String(seccion || '').trim().toUpperCase()}`;
}

// Acorta el grado para mostrarlo en el carnet: quita palabras como
// "secundaria"/"primaria"/"grado"/"de". "3ro secundaria" -> "3ro".
export function gradoCorto(grado) {
  return String(grado || '')
    .replace(/\bde\b/gi, ' ')
    .replace(/\bsecundaria\b/gi, ' ')
    .replace(/\bprimaria\b/gi, ' ')
    .replace(/\bgrado\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// Fecha "YYYY-MM-DD" en hora LOCAL (no UTC). Usar esto en vez de
// `new Date().toISOString().slice(0,10)`, que devuelve la fecha en UTC y
// en Perú (UTC-5) puede adelantar un día en marcaciones nocturnas.
export function fechaLocalISO(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
