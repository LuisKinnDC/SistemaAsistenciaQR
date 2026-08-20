import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import {
  evaluarEstado,
  fechaLocalISO,
  formatearHora,
  formatearHoraDesdeTexto,
  HORA_MINIMA_ESCANEO,
  HORARIOS,
  ventanaEscaneo,
  TURNOS,
} from '../utils/turnos';
import Icon from './Icon';
import { desbloquearAudio, reproducirSonido } from '../utils/sonidos';

const LECTOR_ID = 'qr-reader-region';
const DURACION_OVERLAY_MS = 2500;

const OVERLAY_ESTILOS = {
  ASISTIO: { bg: 'bg-blue-600/90', icon: 'check_circle', titulo: '¡ASISTIÓ!' },
  TARDE: { bg: 'bg-red-600/90', icon: 'schedule', titulo: '¡TARDE!' },
  TURNO_INCORRECTO: { bg: 'bg-amber-600/90', icon: 'warning', titulo: '¡TURNO INCORRECTO!' },
  FUERA_DE_HORARIO: { bg: 'bg-slate-800/90', icon: 'bedtime', titulo: 'FUERA DE HORARIO' },
  DUPLICADO: { bg: 'bg-slate-700/90', icon: 'block', titulo: 'YA REGISTRADO HOY' },
  NO_ENCONTRADO: { bg: 'bg-slate-800/90', icon: 'person_off', titulo: 'NO ENCONTRADO' },
  ERROR: { bg: 'bg-slate-800/90', icon: 'error', titulo: 'ERROR AL REGISTRAR' },
};

const LOG_ESTILOS = {
  ASISTIO: { barra: 'bg-blue-600', chip: 'text-blue-600 bg-blue-50', label: 'PUNTUAL' },
  TARDE: { barra: 'bg-red-600', chip: 'text-red-600 bg-red-50', label: 'TARDE' },
  TURNO_INCORRECTO: { barra: 'bg-amber-500', chip: 'text-amber-700 bg-amber-50', label: 'TURNO INCORRECTO' },
};

function Overlay({ resultado, onCerrar }) {
  if (!resultado) return null;
  const estilo = OVERLAY_ESTILOS[resultado.tipo];
  return (
    <div
      className={`feedback-overlay active absolute inset-0 ${estilo.bg} flex flex-col items-center justify-center z-20 cursor-pointer`}
      onClick={onCerrar}
    >
      <Icon name={estilo.icon} className="text-white mb-4" style={{ fontSize: 96 }} fill />
      <h2 className="text-white font-display-lg text-display-lg font-bold tracking-tight text-center leading-tight px-4">
        {estilo.titulo}
      </h2>
      {resultado.nombreCompleto && (
        <p className="text-white/90 font-title-lg text-title-lg mt-2 text-center px-4">{resultado.nombreCompleto}</p>
      )}
      {resultado.detalle && (
        <p className="text-white/80 font-body-lg text-body-lg mt-1 text-center px-4">{resultado.detalle}</p>
      )}
      {resultado.hora && <p className="text-white/90 font-body-lg text-body-lg mt-1">{resultado.hora}</p>}
      <p className="mt-8 text-white/60 text-xs">Toca la pantalla para continuar escaneando</p>
    </div>
  );
}

export default function EscanerQR() {
  const { perfil, esAdmin } = useAuth();
  const [turno, setTurno] = useState(perfil?.turno || TURNOS.MANANA);
  const [escaneando, setEscaneando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [reloj, setReloj] = useState(new Date());
  const [registros, setRegistros] = useState([]);
  const scannerRef = useRef(null);
  const cierreTimeoutRef = useRef(null);

  useEffect(() => {
    if (perfil?.turno && !esAdmin) setTurno(perfil.turno);
  }, [perfil, esAdmin]);

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    cargarRegistrosHoy();
    return () => detenerCamara();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarRegistrosHoy() {
    const hoy = fechaLocalISO();
    const { data } = await supabase
      .from('asistencias')
      .select('id, hora_ingreso, estado, estudiantes(nombres, apellidos, grado, seccion)')
      .eq('fecha', hoy)
      .order('hora_ingreso', { ascending: false })
      .limit(50);
    if (data) {
      setRegistros(
        data.map((r) => ({
          id: r.id,
          tipo: r.estado,
          nombre: `${r.estudiantes?.nombres || ''} ${r.estudiantes?.apellidos || ''}`.trim(),
          gradoSeccion: `${r.estudiantes?.grado || ''} "${r.estudiantes?.seccion || ''}"`,
          hora: r.hora_ingreso,
        }))
      );
    }
  }

  async function iniciarCamara() {
    // Iniciar la cámara es un gesto del usuario: aprovechamos para habilitar el
    // audio, si no el navegador bloquea el sonido de las marcaciones.
    desbloquearAudio();
    setEscaneando(true);
    const scanner = new Html5Qrcode(LECTOR_ID);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => manejarLectura(decodedText),
        () => {}
      );
    } catch (err) {
      console.error('No se pudo iniciar la cámara:', err);
      setEscaneando(false);
    }
  }

  async function detenerCamara() {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* ya estaba detenida */
      }
      scannerRef.current = null;
    }
    setEscaneando(false);
  }

  async function manejarLectura(dni) {
    if (procesando) return;
    setProcesando(true);
    if (scannerRef.current) {
      try {
        await scannerRef.current.pause(true);
      } catch {
        /* noop */
      }
    }
    await registrarMarcacion(dni.trim());
    setProcesando(false);
  }

  async function registrarMarcacion(dni) {
    const ahora = new Date();

    const { data: estudiante, error: errBusqueda } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('dni', dni)
      .eq('activo', true)
      .maybeSingle();

    if (errBusqueda || !estudiante) {
      mostrarResultado({ tipo: 'NO_ENCONTRADO', detalle: `DNI escaneado: ${dni}` });
      return;
    }

    const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`;
    const gradoSeccion = `${estudiante.grado} "${estudiante.seccion}"`;

    if (estudiante.turno !== turno) {
      mostrarResultado({
        tipo: 'TURNO_INCORRECTO',
        nombreCompleto: `${nombreCompleto} - ${HORARIOS[estudiante.turno].label}`,
        detalle: 'Por favor, esperar a su horario.',
      });
      agregarAlLog({ tipo: 'TURNO_INCORRECTO', nombre: nombreCompleto, gradoSeccion, hora: ahora.toTimeString().slice(0, 8) });
      return;
    }

    // Compuerta horaria según el turno del alumno (ya coincide con el turno del
    // escáner): fuera del horario de clases (madrugada o pasada la salida) el
    // escaneo no debe registrarse como asistencia.
    const ventana = ventanaEscaneo(estudiante.turno, ahora);
    if (ventana !== 'OK') {
      const detalle =
        ventana === 'ANTES'
          ? `Solo se puede marcar a partir de las ${formatearHoraDesdeTexto(HORA_MINIMA_ESCANEO)}.`
          : `El horario de ${HORARIOS[estudiante.turno].label} terminó a las ${formatearHoraDesdeTexto(HORARIOS[estudiante.turno].salida)}.`;
      mostrarResultado({ tipo: 'FUERA_DE_HORARIO', nombreCompleto, detalle });
      return;
    }

    const estado = evaluarEstado(turno, ahora);
    const fecha = fechaLocalISO(ahora);
    const horaIngreso = ahora.toTimeString().slice(0, 8);

    const { error: errInsert } = await supabase.from('asistencias').insert({
      estudiante_id: estudiante.id,
      fecha,
      hora_ingreso: horaIngreso,
      estado,
      registrado_por: perfil?.id,
    });

    if (errInsert) {
      if (errInsert.code === '23505') {
        mostrarResultado({ tipo: 'DUPLICADO', nombreCompleto, detalle: 'Ya tiene una marcación registrada hoy.' });
      } else {
        mostrarResultado({ tipo: 'ERROR', nombreCompleto, detalle: errInsert.message });
      }
      return;
    }

    mostrarResultado({
      tipo: estado,
      nombreCompleto: `${nombreCompleto} - ${gradoSeccion}`,
      hora: formatearHora(ahora),
    });
    agregarAlLog({ tipo: estado, nombre: nombreCompleto, gradoSeccion, hora: horaIngreso });
  }

  function agregarAlLog(item) {
    setRegistros((prev) => [{ id: `${Date.now()}`, ...item }, ...prev].slice(0, 50));
  }

  function mostrarResultado(res) {
    setResultado(res);
    reproducirSonido(res.tipo);
    cierreTimeoutRef.current = setTimeout(() => cerrarOverlay(), DURACION_OVERLAY_MS);
  }

  async function cerrarOverlay() {
    clearTimeout(cierreTimeoutRef.current);
    setResultado(null);
    if (scannerRef.current) {
      try {
        await scannerRef.current.resume();
      } catch {
        /* noop */
      }
    }
  }

  const horario = HORARIOS[turno];

  return (
    <div className="flex-1 md:ml-0 bg-background flex flex-col h-[calc(100dvh-64px-72px)] md:h-screen relative">
      {/* Control Header */}
      <div className="bg-surface shadow-sm px-margin-mobile md:px-margin-desktop py-4 flex flex-col md:flex-row justify-between items-center gap-4 z-10 no-print">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            disabled={escaneando || (!esAdmin && !!perfil?.turno)}
            className="block flex-1 min-w-[150px] md:flex-none md:w-auto pl-3 pr-10 py-2 text-title-md font-title-md border-outline-variant sm:text-sm rounded-md bg-surface-container-lowest text-on-surface border disabled:opacity-60"
          >
            <option value={TURNOS.MANANA}>Turno Mañana</option>
            <option value={TURNOS.TARDE}>Turno Tarde</option>
          </select>
          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full font-label-md text-label-md flex items-center gap-1 border border-amber-200 whitespace-nowrap shrink-0">
            <Icon name="timer" className="text-[16px]" />
            Tolerancia: {horario.tolerancia}
          </div>
        </div>
        <div className="text-center w-full md:w-auto flex flex-col items-center">
          <div className="font-display-lg text-3xl md:text-display-lg text-primary tracking-tight tabular-nums">
            {reloj.toLocaleTimeString('es-PE', { hour12: true })}
          </div>
          <div className="text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
            {reloj.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div className="hidden md:block w-24" />
      </div>

      {/* Layout Split */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Scanner Viewport */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden min-h-[320px]">
          {/* El tamaño/centrado del <video> y el ocultado de los elementos
              extra de html5-qrcode se controlan en index.css (#qr-reader-region),
              para ganarle a los estilos inline de la librería. */}
          <div id={LECTOR_ID} />

          {!escaneando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-inverse-surface/60">
              <button
                onClick={iniciarCamara}
                className="bg-primary text-on-primary font-title-md text-title-md px-8 py-4 rounded-xl shadow-lg flex items-center gap-3 hover:bg-primary-container hover:text-on-primary-container transition-colors"
              >
                <Icon name="videocam" />
                Iniciar Cámara
              </button>
            </div>
          )}

          {escaneando && (
            <div className="relative w-64 h-64 md:w-80 md:h-80 z-10 pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-container rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-container rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-container rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-container rounded-br-lg" />
              <div className="absolute top-0 left-0 w-full h-1 bg-secondary-container shadow-[0_0_8px_2px_rgba(91,184,254,0.6)] scanner-line" />
            </div>
          )}

          <Overlay resultado={resultado} onCerrar={cerrarOverlay} />

          {escaneando && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4 z-10">
              <button
                onClick={detenerCamara}
                className="bg-surface/90 backdrop-blur-sm text-primary px-4 h-14 rounded-full flex items-center gap-2 shadow-lg border border-outline-variant font-label-md text-label-md"
              >
                <Icon name="stop_circle" />
                Detener
              </button>
            </div>
          )}
        </div>

        {/* Recent Log Panel */}
        <div className="w-full lg:w-[400px] bg-surface flex flex-col border-t lg:border-t-0 lg:border-l border-outline-variant shadow-[-4px_0_15px_rgba(0,0,0,0.05)] h-1/3 lg:h-auto z-10">
          <div className="p-4 border-b border-outline-variant bg-surface-container-lowest sticky top-0 flex justify-between items-center">
            <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-2">
              <Icon name="history" className="text-primary" />
              Registro Reciente
            </h3>
            <span className="bg-surface-container-high text-primary px-2 py-1 rounded-md font-label-md text-label-md">
              Hoy: {registros.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {registros.length === 0 && (
              <p className="text-on-surface-variant text-sm text-center py-8">Aún no hay marcaciones hoy.</p>
            )}
            {registros.map((r) => {
              const estilo = LOG_ESTILOS[r.tipo] || LOG_ESTILOS.TARDE;
              return (
                <div
                  key={r.id}
                  className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 flex items-center gap-3 hover:bg-surface-container-low transition-colors shadow-sm"
                >
                  <div className={`w-2 h-full min-h-[48px] ${estilo.barra} rounded-full`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-title-md text-title-md text-on-surface leading-tight truncate">{r.nombre}</p>
                      <span className="font-label-md text-label-md text-on-surface-variant shrink-0">
                        {formatearHoraDesdeTexto(r.hora)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1 gap-2">
                      <p className="font-body-md text-body-md text-on-surface-variant truncate">{r.gradoSeccion}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm shrink-0 ${estilo.chip}`}>
                        {estilo.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
