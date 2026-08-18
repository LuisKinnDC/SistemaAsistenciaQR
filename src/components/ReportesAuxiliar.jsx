import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { HORARIOS } from '../utils/turnos';
import Icon from './Icon';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function haceNDiasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function iniciales(nombres, apellidos) {
  return `${(apellidos || '?')[0] || ''}${(nombres || '?')[0] || ''}`.toUpperCase();
}

export default function ReportesAuxiliar() {
  const { perfil, esAdmin } = useAuth();

  const [fechaInicio, setFechaInicio] = useState(haceNDiasISO(7));
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [vista, setVista] = useState('CONSOLIDADO'); // CONSOLIDADO | MANANA | TARDE
  const [auxiliarSel, setAuxiliarSel] = useState(''); // '' = todos los auxiliares

  const [filas, setFilas] = useState([]);
  const [auxiliares, setAuxiliares] = useState([]);
  const [tardanzasRaw, setTardanzasRaw] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (perfil) {
      consultar();
      cargarAuxiliares();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function cargarAuxiliares() {
    const { data } = await supabase
      .from('perfiles_auxiliares')
      .select('id, nombres, turno, auxiliar_secciones(grado, seccion)')
      .eq('rol', 'AUXILIAR')
      .order('nombres');
    setAuxiliares(data || []);
  }

  async function consultar() {
    setCargando(true);
    setErrorMsg('');

    const [reporte, porDia] = await Promise.all([
      // Se trae TODO el rango (sin filtrar turno) y el filtrado por turno /
      // auxiliar se hace del lado del cliente, para que cambiar de filtro
      // sea instantáneo sin volver a consultar la base.
      supabase.rpc('obtener_reporte_asistencia', {
        p_fecha_inicio: fechaInicio,
        p_fecha_fin: fechaFin,
        p_turno: null,
      }),
      cargarTardanzasRaw(),
    ]);

    setCargando(false);
    if (reporte.error) {
      setErrorMsg(reporte.error.message);
      setFilas([]);
      return;
    }
    setFilas(reporte.data || []);
    setTardanzasRaw(porDia);
  }

  async function cargarTardanzasRaw() {
    const { data } = await supabase
      .from('asistencias')
      .select('fecha, estudiantes!inner(turno, grado, seccion)')
      .eq('estado', 'TARDE')
      .gte('fecha', fechaInicio)
      .lte('fecha', fechaFin);
    return data || [];
  }

  // Conjunto de secciones "grado|seccion" del auxiliar seleccionado (o null = todas).
  const seccionesAux = useMemo(() => {
    if (!auxiliarSel) return null;
    const aux = auxiliares.find((a) => a.id === auxiliarSel);
    if (!aux) return null;
    return new Set((aux.auxiliar_secciones || []).map((s) => `${s.grado}|${s.seccion}`));
  }, [auxiliarSel, auxiliares]);

  // El filtro de turno (vista) solo aplica cuando NO hay un auxiliar
  // seleccionado; sus secciones ya definen el turno por sí solas.
  const filtroTurno = seccionesAux ? 'CONSOLIDADO' : vista;

  // Filas visibles = aplica el filtro de turno y el de auxiliar.
  const filasVisibles = useMemo(() => {
    return filas.filter((f) => {
      if (filtroTurno !== 'CONSOLIDADO' && f.turno !== filtroTurno) return false;
      if (seccionesAux && !seccionesAux.has(`${f.grado}|${f.seccion}`)) return false;
      return true;
    });
  }, [filas, filtroTurno, seccionesAux]);

  const tardanzasPorDia = useMemo(() => {
    const conteo = {};
    tardanzasRaw.forEach((r) => {
      if (filtroTurno !== 'CONSOLIDADO' && r.estudiantes.turno !== filtroTurno) return;
      if (seccionesAux && !seccionesAux.has(`${r.estudiantes.grado}|${r.estudiantes.seccion}`)) return;
      conteo[r.fecha] = (conteo[r.fecha] || 0) + 1;
    });
    return conteo;
  }, [tardanzasRaw, filtroTurno, seccionesAux]);

  const ranking = useMemo(
    () => [...filasVisibles].sort((a, b) => b.total_tarde - a.total_tarde).slice(0, 10),
    [filasVisibles]
  );

  const consolidado = useMemo(() => {
    return filasVisibles.reduce(
      (acc, f) => {
        acc.asistio += Number(f.total_asistio) || 0;
        acc.tarde += Number(f.total_tarde) || 0;
        acc.falta += Number(f.total_falta) || 0;
        return acc;
      },
      { asistio: 0, tarde: 0, falta: 0 }
    );
  }, [filasVisibles]);

  const porcentajeAsistencia = useMemo(() => {
    const total = consolidado.asistio + consolidado.tarde + consolidado.falta;
    return total === 0 ? 0 : Math.round(((consolidado.asistio + consolidado.tarde) / total) * 100);
  }, [consolidado]);

  const barrasDiarias = useMemo(() => {
    const fechas = Object.keys(tardanzasPorDia).sort().slice(-5);
    const max = Math.max(1, ...fechas.map((f) => tardanzasPorDia[f]));
    return fechas.map((f) => ({
      fecha: f,
      valor: tardanzasPorDia[f],
      alturaPct: Math.round((tardanzasPorDia[f] / max) * 100),
      diaLabel: new Date(`${f}T00:00:00`).toLocaleDateString('es-PE', { weekday: 'short' }),
    }));
  }, [tardanzasPorDia]);

  const distribucion = useMemo(() => {
    const manana = filasVisibles.filter((f) => f.turno === 'MANANA').reduce((s, f) => s + Number(f.total_tarde), 0);
    const tarde = filasVisibles.filter((f) => f.turno === 'TARDE').reduce((s, f) => s + Number(f.total_tarde), 0);
    const total = manana + tarde;
    return {
      total,
      pctManana: total === 0 ? 0 : Math.round((manana / total) * 100),
      pctTarde: total === 0 ? 0 : Math.round((tarde / total) * 100),
    };
  }, [filasVisibles]);

  const nombreAuxSel = auxiliares.find((a) => a.id === auxiliarSel)?.nombres || '';

  function exportarExcel(soloTurno) {
    let base = filasVisibles;
    if (soloTurno) base = base.filter((f) => f.turno === soloTurno);
    const filasExport = base.map((f) => ({
      DNI: f.dni,
      Apellidos: f.apellidos,
      Nombres: f.nombres,
      Grado: f.grado,
      Sección: f.seccion,
      Turno: f.turno,
      Asistencias: f.total_asistio,
      Tardanzas: f.total_tarde,
      Faltas: f.total_falta,
      'Días evaluados': f.total_dias,
    }));
    const hoja = XLSX.utils.json_to_sheet(filasExport);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
    const sufijoTurno = soloTurno ? `_${soloTurno}` : '';
    const sufijoAux = nombreAuxSel ? `_${nombreAuxSel.split(' ')[0]}` : '';
    XLSX.writeFile(libro, `reporte_asistencia${sufijoAux}${sufijoTurno}_${fechaInicio}_a_${fechaFin}.xlsx`);
  }

  const dasharrayManana = `${distribucion.pctManana}, 100`;
  const dasharrayTarde = `${distribucion.pctTarde}, 100`;

  return (
    <div className="p-margin-mobile md:p-margin-desktop pb-24 md:pb-margin-desktop w-full max-w-max-width mx-auto">
      {/* Header + Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-1">
            Panel de Reportes
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {esAdmin
              ? auxiliarSel
                ? `Reporte del auxiliar: ${nombreAuxSel} — solo sus secciones a cargo.`
                : 'Análisis consolidado de asistencia y tardanzas por turno.'
              : `Restringido a tu jurisdicción: ${HORARIOS[perfil?.turno]?.label || ''} · ${
                  perfil?.secciones?.length
                    ? perfil.secciones.map((s) => `${s.grado} "${s.seccion}"`).join(', ')
                    : 'sin secciones asignadas'
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="bg-surface border border-outline-variant text-on-surface font-body-md text-body-md rounded-lg px-3 py-2"
          />
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className="bg-surface border border-outline-variant text-on-surface font-body-md text-body-md rounded-lg px-3 py-2"
          />
          {esAdmin && (
            <div className="relative">
              <select
                value={auxiliarSel}
                onChange={(e) => setAuxiliarSel(e.target.value)}
                className="appearance-none bg-surface border border-outline-variant text-on-surface font-body-md text-body-md rounded-lg pl-4 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
              >
                <option value="">Todos los auxiliares</option>
                {auxiliares.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombres}
                    {a.auxiliar_secciones?.length
                      ? ` (${a.auxiliar_secciones.map((s) => `${s.grado}${s.seccion}`).join(', ')})`
                      : ''}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                person_search
              </span>
            </div>
          )}
          {esAdmin && !auxiliarSel && (
            <div className="flex bg-surface-container-low rounded-lg p-1 border border-outline-variant">
              {[
                { key: 'CONSOLIDADO', label: 'Consolidado' },
                { key: 'MANANA', label: 'Mañana (A-E)' },
                { key: 'TARDE', label: 'Tarde (F-H)' },
              ].map((op) => (
                <button
                  key={op.key}
                  onClick={() => setVista(op.key)}
                  className={`px-4 py-2 rounded-md font-label-md text-label-md transition-colors ${
                    vista === op.key
                      ? 'bg-white shadow-sm text-primary border border-outline-variant/30'
                      : 'text-on-surface-variant hover:bg-surface-variant'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={consultar}
            className="bg-primary text-on-primary rounded-lg px-4 py-2 font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors"
          >
            Consultar
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-error rounded-lg p-3 mb-6 text-sm">{errorMsg}</div>
      )}

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Asistencia % */}
        <div className="bg-surface rounded-xl p-6 border border-outline-variant elevation-1 elevation-interactive transition-all border-t-4 border-t-primary">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-title-md text-title-md text-on-surface">Asistencia del Período</h3>
            <div className="p-2 bg-primary-fixed rounded-lg text-on-primary-fixed">
              <Icon name="how_to_reg" />
            </div>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="font-display-lg text-display-lg text-on-surface">{porcentajeAsistencia}%</span>
          </div>
          <p className="font-label-md text-label-md text-on-surface-variant">
            {consolidado.asistio + consolidado.tarde} presentes de {consolidado.asistio + consolidado.tarde + consolidado.falta} días-alumno
          </p>
          <div className="mt-4 w-full bg-surface-container h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: `${porcentajeAsistencia}%` }} />
          </div>
        </div>

        {/* Tardanzas */}
        <div className="bg-surface rounded-xl p-6 border border-outline-variant elevation-1 elevation-interactive transition-all border-t-4 border-t-error">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-title-md text-title-md text-on-surface">Tardanzas del Período</h3>
            <div className="p-2 bg-error-container rounded-lg text-on-error-container">
              <Icon name="schedule" />
            </div>
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="font-display-lg text-display-lg text-error">{consolidado.tarde}</span>
          </div>
          <p className="font-label-md text-label-md text-on-surface-variant">Total acumulado en el rango</p>
          {barrasDiarias.length > 0 && (
            <div className="mt-4 flex gap-1 h-8 items-end">
              {barrasDiarias.map((b) => (
                <div
                  key={b.fecha}
                  className="w-1/5 bg-error rounded-t transition-colors"
                  style={{ height: `${Math.max(8, b.alturaPct)}%` }}
                  title={`${b.diaLabel}: ${b.valor}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Exportar */}
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant elevation-1 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-6 -top-6 text-primary-fixed-dim opacity-20">
            <Icon name="file_download" style={{ fontSize: 120 }} />
          </div>
          <div className="relative z-10">
            <h3 className="font-title-md text-title-md text-on-surface mb-2">Exportar Datos</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-6">
              Genera reportes consolidados o por turno en formato Excel.
            </p>
          </div>
          <div className="flex flex-col gap-2 relative z-10">
            <button
              onClick={() => exportarExcel(null)}
              disabled={filas.length === 0}
              className="flex items-center justify-between w-full px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <Icon name="table_view" className="text-[18px]" /> Consolidado
              </span>
              <Icon name="download" className="text-[18px]" />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => exportarExcel('MANANA')}
                disabled={filas.length === 0}
                className="flex items-center justify-center gap-1 px-3 py-2 border border-outline-variant text-primary rounded-lg font-label-md text-label-md hover:bg-surface-container-low transition-colors bg-surface disabled:opacity-50"
              >
                Turno Mañana
              </button>
              <button
                onClick={() => exportarExcel('TARDE')}
                disabled={filas.length === 0}
                className="flex items-center justify-center gap-1 px-3 py-2 border border-outline-variant text-primary rounded-lg font-label-md text-label-md hover:bg-surface-container-low transition-colors bg-surface disabled:opacity-50"
              >
                Turno Tarde
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Data Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Ranking */}
        <div className="xl:col-span-2 bg-surface rounded-xl border border-outline-variant elevation-1 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest">
            <div>
              <h3 className="font-title-md text-title-md text-on-surface">Ranking de Impuntualidad</h3>
              <p className="font-label-md text-label-md text-on-surface-variant mt-1">
                Estudiantes con mayor incidencia de tardanzas en el período
              </p>
            </div>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low/50 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3 px-6 font-medium">Estudiante</th>
                  <th className="py-3 px-6 font-medium">Grado/Sección</th>
                  <th className="py-3 px-6 font-medium">Turno</th>
                  <th className="py-3 px-6 font-medium text-center">Tardanzas</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {ranking.map((f, i) => (
                  <tr key={f.estudiante_id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors group">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            i === 0
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-variant text-on-surface-variant'
                          }`}
                        >
                          {iniciales(f.nombres, f.apellidos)}
                        </div>
                        <span className="font-medium">
                          {f.apellidos}, {f.nombres}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-on-surface-variant">
                      {f.grado} {f.seccion}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${
                          f.turno === 'MANANA'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {f.turno === 'MANANA' ? 'MAÑANA' : 'TARDE'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-center">
                      <span className={`font-title-md ${f.total_tarde > 0 ? 'text-error' : 'text-on-surface'}`}>
                        {f.total_tarde}
                      </span>
                    </td>
                  </tr>
                ))}
                {!cargando && ranking.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-on-surface-variant">
                      No hay datos para el rango seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Distribution Donut */}
        <div className="bg-surface rounded-xl border border-outline-variant elevation-1 flex flex-col">
          <div className="p-6 border-b border-outline-variant bg-surface-container-lowest">
            <h3 className="font-title-md text-title-md text-on-surface">Distribución por Turno</h3>
            <p className="font-label-md text-label-md text-on-surface-variant mt-1">Comparativa de tardanzas</p>
          </div>
          <div className="p-6 flex-1 flex flex-col justify-center items-center">
            <div className="relative w-48 h-48 mb-6">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-surface-variant"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="text-primary"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={dasharrayManana}
                  strokeWidth="4"
                />
                <path
                  className="text-tertiary-container"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={dasharrayTarde}
                  strokeDashoffset={-distribucion.pctManana}
                  strokeWidth="4"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display-lg text-3xl font-bold text-on-surface">{distribucion.total}</span>
                <span className="font-label-md text-label-md text-on-surface-variant">Total</span>
              </div>
            </div>
            <div className="w-full flex flex-col gap-3">
              <div className="flex items-center justify-between p-2 rounded bg-surface-container-low">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="font-body-md text-body-md text-on-surface">Mañana (A-E)</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">{distribucion.pctManana}%</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-surface-container-low">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-tertiary-container" />
                  <span className="font-body-md text-body-md text-on-surface">Tarde (F-H)</span>
                </div>
                <span className="font-title-md text-title-md text-on-surface">{distribucion.pctTarde}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {cargando && <p className="text-on-surface-variant mt-6">Cargando reporte...</p>}
    </div>
  );
}
