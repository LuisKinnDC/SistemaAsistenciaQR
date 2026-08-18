import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { seccionATurno } from '../utils/turnos';
import Icon from './Icon';

const COLUMNAS_ESPERADAS = ['DNI', 'NOMBRES', 'APELLIDOS', 'GRADO', 'SECCION'];
const PAGE_SIZE = 8;

function normalizarFila(fila) {
  const norm = {};
  for (const key of Object.keys(fila)) norm[key.trim().toUpperCase()] = fila[key];
  return norm;
}

export default function ImportarExcel() {
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filtroTurno, setFiltroTurno] = useState('TODOS');
  const [pagina, setPagina] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);

  function manejarArchivo(file) {
    if (!file) return;
    setArchivo(file);
    setResultado(null);
    setErrorArchivo('');
    setPagina(0);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });
        const normalizadas = filasCrudas.map(normalizarFila);

        const faltantes = COLUMNAS_ESPERADAS.filter((col) => !(col in (normalizadas[0] || {})));
        if (faltantes.length > 0) {
          setErrorArchivo(`Faltan columnas en el Excel: ${faltantes.join(', ')}`);
          setFilas([]);
          return;
        }

        const procesadas = normalizadas.map((fila) => {
          const seccion = String(fila.SECCION || '').trim().toUpperCase();
          const dni = String(fila.DNI || '').trim();
          const turno = seccionATurno(seccion);
          let estado = 'valido';
          let mensaje = 'Válido';
          if (!dni || !/^\d{6,10}$/.test(dni)) {
            estado = 'error';
            mensaje = 'DNI inválido';
          } else if (!turno) {
            estado = 'error';
            mensaje = 'Sección Inválida';
          }
          return {
            dni,
            nombres: String(fila.NOMBRES || '').trim(),
            apellidos: String(fila.APELLIDOS || '').trim(),
            grado: String(fila.GRADO || '').trim(),
            seccion,
            turno,
            estado,
            mensaje,
          };
        });

        setFilas(procesadas);
      } catch (err) {
        setErrorArchivo(`No se pudo leer el archivo: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  }

  const filasValidas = useMemo(() => filas.filter((f) => f.estado === 'valido'), [filas]);
  const filasFiltradas = useMemo(() => {
    if (filtroTurno === 'TODOS') return filas;
    return filas.filter((f) => f.turno === filtroTurno);
  }, [filas, filtroTurno]);

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / PAGE_SIZE));
  const filasPagina = filasFiltradas.slice(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE);

  async function sincronizar() {
    if (filasValidas.length === 0) return;
    setCargando(true);
    setResultado(null);

    const payload = filasValidas.map(({ dni, nombres, apellidos, grado, seccion, turno }) => ({
      dni,
      nombres,
      apellidos,
      grado,
      seccion,
      turno,
    }));

    const { data, error } = await supabase
      .from('estudiantes')
      .upsert(payload, { onConflict: 'dni', ignoreDuplicates: false })
      .select('id');

    setCargando(false);
    if (error) {
      setResultado({ ok: false, mensaje: error.message });
    } else {
      setResultado({ ok: true, mensaje: `Se sincronizaron ${data.length} estudiantes con Supabase.` });
    }
  }

  const pillsGlobal = [
    { key: 'TODOS', label: 'Todos', dot: null },
    { key: 'MANANA', label: 'Mañana', dot: 'bg-amber-500' },
    { key: 'TARDE', label: 'Tarde', dot: 'bg-indigo-500' },
  ];

  return (
    <>
      {/* Desktop Header */}
      <header className="sticky top-0 z-30 hidden md:flex justify-between items-center w-full px-margin-desktop py-4 bg-surface border-b border-outline-variant shadow-sm">
        <h2 className="font-headline-lg text-headline-lg font-semibold text-on-surface">Importación Masiva</h2>
        <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg p-1">
          {pillsGlobal.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setFiltroTurno(p.key);
                setPagina(0);
              }}
              className={`px-4 py-1.5 rounded-md text-body-md font-body-md transition-colors flex items-center gap-1 ${
                filtroTurno === p.key
                  ? 'bg-surface-container-low text-primary font-medium shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-lowest'
              }`}
            >
              {p.dot && <span className={`w-2 h-2 rounded-full ${p.dot}`} />}
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-margin-mobile md:p-margin-desktop flex-1 max-w-max-width mx-auto w-full flex flex-col gap-6">
        {/* Mobile title */}
        <div className="md:hidden flex justify-between items-center mb-2">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
            Importación Masiva
          </h2>
        </div>
        {/* Mobile pills */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-2 -mx-margin-mobile px-margin-mobile">
          {pillsGlobal.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setFiltroTurno(p.key);
                setPagina(0);
              }}
              className={`shrink-0 px-4 py-2 rounded-lg text-body-md font-body-md border border-outline-variant flex items-center gap-2 ${
                filtroTurno === p.key
                  ? 'bg-surface-container-low text-primary font-medium'
                  : 'bg-surface-container-lowest text-on-surface'
              }`}
            >
              {p.dot && <span className={`w-2 h-2 rounded-full ${p.dot}`} />}
              {p.label}
            </button>
          ))}
        </div>

        {/* Top Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Zone */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-title-lg text-title-lg text-on-surface">Cargar Archivo Excel</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Sube la nómina de estudiantes en formato .xlsx o .xls.
                </p>
              </div>
            </div>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                manejarArchivo(e.dataTransfer.files?.[0]);
              }}
              className={`flex-1 min-h-[200px] border-2 border-dashed border-outline-variant rounded-lg bg-surface flex flex-col items-center justify-center p-8 text-center transition-colors hover:bg-surface-container-low cursor-pointer group ${
                arrastrando ? 'drag-over' : ''
              }`}
            >
              <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Icon name="cloud_upload" className="text-4xl text-primary" />
              </div>
              <p className="font-title-md text-title-md text-on-surface mb-2">
                {archivo ? archivo.name : 'Arrastra y suelta tu archivo aquí'}
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                o haz clic para explorar en tus carpetas
              </p>
              <span className="bg-surface-container-lowest border border-outline text-primary font-label-md text-label-md px-6 py-2.5 rounded-lg hover:bg-surface-container-low transition-colors shadow-sm">
                Seleccionar Archivo
              </span>
              <input
                accept=".xlsx,.xls"
                className="hidden"
                type="file"
                onChange={(e) => manejarArchivo(e.target.files?.[0])}
              />
            </label>
            {errorArchivo && (
              <p className="mt-3 text-sm text-error flex items-center gap-1">
                <Icon name="error" className="text-[18px]" />
                {errorArchivo}
              </p>
            )}
          </div>

          {/* Info Card: Classification Rules */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
            <div className="bg-primary-container p-4 border-b border-outline-variant flex items-center gap-3">
              <Icon name="rule" className="text-on-primary-container" />
              <h3 className="font-title-md text-title-md text-on-primary-container font-semibold">
                Reglas de Clasificación
              </h3>
            </div>
            <div className="p-6 flex-1 flex flex-col gap-6 bg-surface-bright">
              <p className="font-body-md text-body-md text-on-surface-variant">
                El sistema asignará automáticamente el turno del estudiante basándose en su sección
                correspondiente.
              </p>
              <div className="space-y-4">
                <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                  <div className="flex items-center gap-3 mb-2">
                    <Icon name="light_mode" className="text-amber-600" />
                    <h4 className="font-title-md text-title-md text-on-surface">Turno Mañana</h4>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant ml-9">
                    Secciones:{' '}
                    {['A', 'B', 'C', 'D', 'E'].map((s) => (
                      <strong key={s} className="text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded mr-1">
                        {s}
                      </strong>
                    ))}
                  </p>
                </div>
                <div className="bg-surface-container-lowest p-4 rounded-lg border border-outline-variant shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                  <div className="flex items-center gap-3 mb-2">
                    <Icon name="dark_mode" className="text-indigo-600" />
                    <h4 className="font-title-md text-title-md text-on-surface">Turno Tarde</h4>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant ml-9">
                    Secciones:{' '}
                    {['F', 'G', 'H'].map((s) => (
                      <strong key={s} className="text-on-surface bg-surface-container-high px-1.5 py-0.5 rounded mr-1">
                        {s}
                      </strong>
                    ))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {filas.length > 0 && (
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm flex flex-col flex-1 overflow-hidden mt-2">
            <div className="p-4 md:p-6 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface">
              <div>
                <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-2">
                  Vista Previa de Datos
                  <span className="bg-surface-container-high text-primary font-label-md text-label-md px-2 py-0.5 rounded-full">
                    {filasFiltradas.length} registros
                  </span>
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Revisa la clasificación antes de sincronizar.
                </p>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6 w-32">DNI</th>
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6">
                      NOMBRES Y APELLIDOS
                    </th>
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6 w-24">GRADO</th>
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6 w-24">SECCIÓN</th>
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6 w-40">
                      TURNO DETECTADO
                    </th>
                    <th className="font-label-md text-label-md text-on-surface-variant py-3 px-6 w-32">ESTADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-md text-body-md text-on-surface bg-surface-container-lowest">
                  {filasPagina.map((f, i) => (
                    <tr
                      key={i}
                      className={`hover:bg-surface-container-low transition-colors ${
                        f.estado === 'error' ? 'bg-error-container/10' : ''
                      }`}
                    >
                      <td className="py-4 px-6 font-medium text-on-surface-variant">{f.dni || '—'}</td>
                      <td className="py-4 px-6">
                        {f.apellidos}, {f.nombres}
                      </td>
                      <td className="py-4 px-6">{f.grado}</td>
                      <td className="py-4 px-6">
                        <span className="bg-surface-container-high px-2 py-1 rounded font-medium">
                          {f.seccion || '?'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {f.turno ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              f.turno === 'MANANA' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                f.turno === 'MANANA' ? 'bg-amber-600' : 'bg-indigo-600'
                              }`}
                            />
                            {f.turno === 'MANANA' ? 'Mañana' : 'Tarde'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-surface-variant text-on-surface-variant px-2.5 py-1 rounded-full text-xs font-semibold">
                            <Icon name="help" className="text-[14px]" />
                            No detectado
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        {f.estado === 'valido' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <Icon name="check_circle" className="text-[16px]" />
                            Válido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-error text-xs font-medium">
                            <Icon name="error" className="text-[16px]" />
                            {f.mensaje}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col p-4 gap-4 bg-surface-bright">
              {filasPagina.map((f, i) => (
                <div
                  key={i}
                  className={`border rounded-lg p-4 shadow-sm relative overflow-hidden ${
                    f.estado === 'error'
                      ? 'bg-error-container/20 border-error/30'
                      : 'bg-surface-container-lowest border-outline-variant'
                  }`}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      f.estado === 'error'
                        ? 'bg-error'
                        : f.turno === 'MANANA'
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                    }`}
                  />
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className={`text-xs mb-0.5 ${f.estado === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
                        DNI: {f.dni || '—'}
                      </p>
                      <h4 className="font-title-md text-title-md text-on-surface">
                        {f.apellidos}, {f.nombres}
                      </h4>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        !f.turno
                          ? 'bg-surface-variant text-on-surface-variant'
                          : f.turno === 'MANANA'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {f.turno === 'MANANA' ? 'Mañana' : f.turno === 'TARDE' ? 'Tarde' : 'Desconocido'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3 pt-3 border-t border-outline-variant">
                    <div>
                      <span className="text-on-surface-variant text-xs block mb-1">Grado/Sección</span>
                      <span className="font-medium text-on-surface">
                        {f.grado} "{f.seccion || '?'}"
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-on-surface-variant text-xs block mb-1">Estado</span>
                      {f.estado === 'valido' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <Icon name="check_circle" className="text-[14px]" /> Válido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-error text-xs font-medium">
                          <Icon name="error" className="text-[14px]" /> {f.mensaje}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-outline-variant bg-surface flex justify-between items-center text-sm text-on-surface-variant">
              <span>
                Mostrando {filasFiltradas.length === 0 ? 0 : pagina * PAGE_SIZE + 1}-
                {Math.min(filasFiltradas.length, pagina * PAGE_SIZE + PAGE_SIZE)} de {filasFiltradas.length} registros
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  disabled={pagina === 0}
                  className="p-1 rounded hover:bg-surface-container-low disabled:opacity-50"
                >
                  <Icon name="chevron_left" className="text-[20px]" />
                </button>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                  disabled={pagina >= totalPaginas - 1}
                  className="p-1 rounded hover:bg-surface-container-low disabled:opacity-50"
                >
                  <Icon name="chevron_right" className="text-[20px]" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        {filas.length > 0 && (
          <div className="mt-4 mb-6 md:mb-8 flex flex-col items-end gap-2">
            {filas.some((f) => f.estado === 'error') && (
              <p className="text-sm text-error flex items-center gap-1">
                <Icon name="error" className="text-[16px]" />
                {filas.filter((f) => f.estado === 'error').length} registro(s) con errores serán omitidos.
              </p>
            )}
            <button
              onClick={sincronizar}
              disabled={cargando || filasValidas.length === 0}
              className="w-full md:w-auto bg-[#00164e] text-white font-title-md text-title-md px-8 py-4 rounded-xl shadow-md hover:bg-[#00236f] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Icon name="sync" />
              {cargando ? 'Sincronizando...' : `Procesar y Sincronizar ${filasValidas.length} con Supabase`}
            </button>
          </div>
        )}

        {resultado && (
          <div
            className={`rounded-lg p-4 flex items-center gap-2 ${
              resultado.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-red-50 text-error border border-red-300'
            }`}
          >
            <Icon name={resultado.ok ? 'check_circle' : 'error'} />
            {resultado.mensaje}
          </div>
        )}
      </div>
    </>
  );
}
