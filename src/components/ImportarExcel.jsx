import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { useUI } from '../lib/UIContext';
import { seccionATurno } from '../utils/turnos';
import Icon from './Icon';
import EditarAlumno from './EditarAlumno';

const COLUMNAS_ESPERADAS = ['DNI', 'NOMBRES', 'APELLIDOS', 'GRADO', 'SECCION'];
const PAGE_SIZE = 8;

// Alias aceptados por cada columna (ya NORMALIZADOS: sin acentos, sin
// puntuación, sin espacios extra, en MAYÚSCULAS). Así el Excel puede traer
// "Sección", "N° DNI", "D.N.I.", "APELLIDO", "Año", "Código", etc., en
// cualquier orden, y aun así se reconoce.
const ALIAS_COLUMNAS = {
  DNI: [
    'DNI', 'DOCUMENTO', 'NRO DOCUMENTO', 'NUMERO DOCUMENTO', 'NUMERO DE DOCUMENTO',
    'N DNI', 'NRO DNI', 'NUMERO DNI', 'CODIGO', 'CODIGO ESTUDIANTE', 'CODIGO DEL ESTUDIANTE',
  ],
  NOMBRES: ['NOMBRES', 'NOMBRE', 'NOMBRE DEL ESTUDIANTE', 'NOMBRES DEL ESTUDIANTE'],
  APELLIDOS: ['APELLIDOS', 'APELLIDO', 'APELLIDOS Y NOMBRES', 'APELLIDOS DEL ESTUDIANTE'],
  GRADO: ['GRADO', 'ANO', 'ANIO', 'GRADO ANO', 'GRADO ANIO'],
  SECCION: ['SECCION', 'SEC'],
};

// Normaliza el texto de una cabecera: quita acentos y puntuación, colapsa
// espacios, recorta y pasa a mayúsculas. "  Sección " -> "SECCION",
// "D.N.I." -> "DNI", "N° DNI" -> "N DNI".
function normalizarClave(clave) {
  return String(clave ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ') // puntuación/símbolos -> espacio
    .replace(/\s+/g, ' ')
    .trim();
}

// ¿La clave corresponde a alguno de los alias? Se compara sobre la versión
// COMPACTA (sin espacios) para que cabeceras con puntuación como "N° D.N.I."
// (-> "NDNI") o "D.N.I." (-> "DNI") coincidan con el alias "DNI". Acepta
// igualdad exacta o "contiene" (p. ej. "DNIDELALUMNO" contiene "DNI").
function coincideColumna(claveCompacta, alias) {
  return alias.some((a) => {
    const ac = a.replace(/ /g, '');
    return claveCompacta === ac || claveCompacta.includes(ac);
  });
}

// Dada la fila de cabecera (normalizada para mostrar), devuelve el índice de
// columna de cada campo esperado, o -1 si no aparece.
function detectarIndices(cabecera) {
  const compactas = cabecera.map((k) => k.replace(/ /g, ''));
  const indices = {};
  for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
    indices[campo] = compactas.findIndex((k) => coincideColumna(k, alias));
  }
  return indices;
}

// Recorre TODAS las hojas del libro y devuelve la mejor candidata a cabecera:
// la fila (en cualquier hoja) que reconoce más columnas esperadas.
function localizarCabecera(workbook) {
  let mejor = { matriz: null, idxCabecera: -1, indices: null, cabecera: [], aciertos: -1 };
  for (const nombreHoja of workbook.SheetNames) {
    const hoja = workbook.Sheets[nombreHoja];
    if (!hoja) continue;
    const matriz = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false, // valores ya formateados como texto
    });
    matriz.forEach((fila, idx) => {
      if (!Array.isArray(fila)) return;
      const cabecera = fila.map(normalizarClave);
      const indices = detectarIndices(cabecera);
      const aciertos = COLUMNAS_ESPERADAS.filter((c) => indices[c] !== -1).length;
      if (aciertos > mejor.aciertos) {
        mejor = { matriz, idxCabecera: idx, indices, cabecera, aciertos };
      }
    });
  }
  return mejor;
}

export default function ImportarExcel() {
  const { toast } = useUI();
  const [pestana, setPestana] = useState('importar'); // importar | editar
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [filtroTurno, setFiltroTurno] = useState('TODOS');
  const [pagina, setPagina] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [analisis, setAnalisis] = useState(null); // { nuevos, actualizar, sinCambios, bajas }
  const [incluirBajas, setIncluirBajas] = useState(true);

  function manejarArchivo(file) {
    if (!file) return;
    setArchivo(file);
    setResultado(null);
    setErrorArchivo('');
    setPagina(0);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        if (!workbook.SheetNames.length) {
          setErrorArchivo('El archivo no contiene ninguna hoja de cálculo.');
          setFilas([]);
          return;
        }

        // Localiza la fila de cabecera en cualquier hoja, aunque haya filas o
        // columnas vacías por encima/izquierda (elige la fila que reconoce más
        // columnas esperadas). Tolera títulos y espaciadores.
        const { matriz, idxCabecera, indices, cabecera, aciertos } = localizarCabecera(workbook);

        const faltantes = COLUMNAS_ESPERADAS.filter((col) => !indices || indices[col] === -1);
        if (idxCabecera === -1 || faltantes.length > 0) {
          const detectada = (cabecera || []).filter(Boolean).join(', ') || '(vacía)';
          setErrorArchivo(
            aciertos <= 0
              ? 'No se encontró una fila de cabecera con las columnas DNI, NOMBRES, APELLIDOS, GRADO y SECCION.'
              : `Faltan columnas en el Excel: ${faltantes.join(', ')}. Cabecera detectada: ${detectada}`
          );
          setFilas([]);
          return;
        }

        const valor = (fila, campo) => String(fila[indices[campo]] ?? '').trim();

        const procesadas = matriz
          .slice(idxCabecera + 1)
          .map((fila) => {
            if (!Array.isArray(fila)) return null;
            const dni = valor(fila, 'DNI').replace(/\s+/g, '');
            const nombres = valor(fila, 'NOMBRES');
            const apellidos = valor(fila, 'APELLIDOS');
            const grado = valor(fila, 'GRADO');
            const seccion = valor(fila, 'SECCION').toUpperCase();

            // Descarta filas totalmente vacías (p. ej. separadores al final).
            if (!dni && !nombres && !apellidos && !grado && !seccion) return null;

            const turno = seccionATurno(seccion);
            let estado = 'valido';
            let mensaje = 'Válido';
            // Se acepta el DNI peruano (8 díg., rango 6-10) y también códigos
            // más largos (p. ej. código de estudiante / documento de
            // extranjería de 14 díg.). Todo va al mismo campo `dni`.
            let tipoId = 'DNI';
            if (!dni || !/^\d{6,15}$/.test(dni)) {
              estado = 'error';
              mensaje = 'ID inválido (debe ser numérico, 6 a 15 dígitos)';
              tipoId = null;
            } else if (!turno) {
              estado = 'error';
              mensaje = 'Sección Inválida';
              tipoId = dni.length > 10 ? 'CODIGO' : 'DNI';
            } else {
              tipoId = dni.length > 10 ? 'CODIGO' : 'DNI';
            }
            return { dni, nombres, apellidos, grado, seccion, turno, estado, mensaje, tipoId };
          })
          .filter(Boolean);

        if (procesadas.length === 0) {
          setErrorArchivo('El archivo no contiene filas de datos debajo de la cabecera.');
          setFilas([]);
          return;
        }

        setFilas(procesadas);
      } catch (err) {
        setErrorArchivo(`No se pudo leer el archivo: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const filasValidas = useMemo(() => filas.filter((f) => f.estado === 'valido'), [filas]);
  const filasFiltradas = useMemo(() => {
    if (filtroTurno === 'TODOS') return filas;
    return filas.filter((f) => f.turno === filtroTurno);
  }, [filas, filtroTurno]);

  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / PAGE_SIZE));
  const filasPagina = filasFiltradas.slice(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE);

  // Compara la nómina del Excel contra la base y clasifica los cambios, SIN
  // aplicar nada todavía. El usuario revisa el resumen y confirma.
  async function analizar() {
    if (filasValidas.length === 0) return;
    setAnalizando(true);
    setResultado(null);
    setAnalisis(null);

    const { data: actuales, error } = await supabase
      .from('estudiantes')
      .select('id, dni, nombres, apellidos, grado, seccion, turno, activo');

    if (error) {
      setAnalizando(false);
      setResultado({ ok: false, mensaje: error.message });
      return;
    }

    const mapaBD = new Map((actuales || []).map((e) => [String(e.dni), e]));
    const mapaExcel = new Map(filasValidas.map((f) => [String(f.dni), f]));

    const nuevos = [];
    const actualizar = [];
    const sinCambios = [];
    const bajas = [];

    for (const f of filasValidas) {
      const bd = mapaBD.get(String(f.dni));
      if (!bd) {
        nuevos.push(f);
      } else {
        const cambio =
          bd.nombres !== f.nombres ||
          bd.apellidos !== f.apellidos ||
          bd.grado !== f.grado ||
          bd.seccion !== f.seccion ||
          bd.turno !== f.turno ||
          !bd.activo;
        if (cambio) actualizar.push({ ...f, _bd: bd });
        else sinCambios.push(f);
      }
    }

    // Alumnos activos en la BD que ya no aparecen en el nuevo Excel.
    for (const e of actuales || []) {
      if (e.activo && !mapaExcel.has(String(e.dni))) bajas.push(e);
    }

    setAnalisis({ nuevos, actualizar, sinCambios, bajas });
    setAnalizando(false);
  }

  // Aplica la sincronización previamente analizada.
  async function aplicar() {
    if (!analisis) return;
    setAplicando(true);
    setResultado(null);

    const { nuevos, actualizar, bajas } = analisis;
    const upserts = [...nuevos, ...actualizar].map(({ dni, nombres, apellidos, grado, seccion, turno }) => ({
      dni,
      nombres,
      apellidos,
      grado,
      seccion,
      turno,
      activo: true, // reactiva a quien vuelve a aparecer en la nómina
    }));

    let err = null;
    if (upserts.length > 0) {
      const { error } = await supabase
        .from('estudiantes')
        .upsert(upserts, { onConflict: 'dni', ignoreDuplicates: false });
      if (error) err = error;
    }

    // Baja lógica (activo=false): NO se borra el alumno, así se conserva su
    // historial de asistencias. Solo si el usuario marcó la opción.
    if (!err && incluirBajas && bajas.length > 0) {
      const { error } = await supabase
        .from('estudiantes')
        .update({ activo: false })
        .in(
          'dni',
          bajas.map((b) => b.dni)
        );
      if (error) err = error;
    }

    setAplicando(false);
    if (err) {
      setResultado({ ok: false, mensaje: err.message });
      return;
    }

    const partes = [];
    if (nuevos.length) partes.push(`${nuevos.length} agregado(s)`);
    if (actualizar.length) partes.push(`${actualizar.length} actualizado(s)`);
    if (incluirBajas && bajas.length) partes.push(`${bajas.length} dado(s) de baja`);
    setResultado({
      ok: true,
      mensaje: `Sincronización aplicada: ${partes.length ? partes.join(', ') : 'sin cambios que aplicar'}.`,
    });
    toast('Sincronización aplicada', 'exito');
    setAnalisis(null);
  }

  const pillsGlobal = [
    { key: 'TODOS', label: 'Todos', dot: null },
    { key: 'MANANA', label: 'Mañana', dot: 'bg-amber-500' },
    { key: 'TARDE', label: 'Tarde', dot: 'bg-indigo-500' },
  ];

  return (
    <>
      {/* Desktop Header */}
      {pestana === 'importar' && (
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
      )}

      <div className="p-margin-mobile md:p-margin-desktop flex-1 max-w-max-width mx-auto w-full flex flex-col gap-6">
        {/* Pestañas: Importar / Modificar alumno */}
        <div className="flex gap-1 bg-surface-container-low rounded-lg p-1 border border-outline-variant w-full md:w-fit">
          {[
            { key: 'importar', label: 'Importar / Sincronizar', icon: 'upload_file' },
            { key: 'editar', label: 'Modificar alumno', icon: 'edit' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setPestana(t.key)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md font-label-md text-label-md transition-colors ${
                pestana === t.key
                  ? 'bg-white shadow-sm text-primary border border-outline-variant/30'
                  : 'text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              <Icon name={t.icon} className="text-[18px]" />
              {t.label}
            </button>
          ))}
        </div>

        {pestana === 'editar' && <EditarAlumno />}

        {pestana === 'importar' && (
        <>
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
                      <td className="py-4 px-6 font-medium text-on-surface-variant whitespace-nowrap">
                        {f.dni || '—'}
                        {f.tipoId === 'CODIGO' && (
                          <span className="ml-2 inline-flex items-center gap-1 bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider align-middle">
                            <Icon name="badge" className="text-[12px]" />
                            Código
                          </span>
                        )}
                      </td>
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
                      <p className={`text-xs mb-0.5 flex items-center gap-1.5 ${f.estado === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
                        {f.tipoId === 'CODIGO' ? 'Código' : 'DNI'}: {f.dni || '—'}
                        {f.tipoId === 'CODIGO' && (
                          <span className="inline-flex items-center bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                            14 díg.
                          </span>
                        )}
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
              onClick={analizar}
              disabled={analizando || filasValidas.length === 0}
              className="w-full md:w-auto bg-brand-blue text-white font-title-md text-title-md px-8 py-4 rounded-xl shadow-md hover:bg-brand-blue-dark active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Icon name="difference" />
              {analizando ? 'Comparando…' : `Comparar ${filasValidas.length} con la base de datos`}
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
        </>
        )}

        {/* Modal de diferencias (resultado del análisis) */}
        {analisis && (
          <div className="fixed inset-0 z-[100] bg-inverse-surface/60 flex items-center justify-center p-4">
            <div className="bg-surface rounded-xl border border-outline-variant shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center">
                <h3 className="font-title-lg text-title-lg text-on-surface flex items-center gap-2">
                  <Icon name="difference" className="text-primary" />
                  Comparación con la base de datos
                </h3>
                <button
                  type="button"
                  onClick={() => setAnalisis(null)}
                  className="text-on-surface-variant hover:text-primary"
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                {/* Contadores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { n: analisis.nuevos.length, label: 'Nuevos', clase: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
                    { n: analisis.actualizar.length, label: 'Actualizar', clase: 'bg-amber-50 text-amber-700 border-amber-300' },
                    { n: analisis.bajas.length, label: 'Dar de baja', clase: 'bg-red-50 text-error border-red-300' },
                    { n: analisis.sinCambios.length, label: 'Sin cambios', clase: 'bg-surface-container-low text-on-surface-variant border-outline-variant' },
                  ].map((c) => (
                    <div key={c.label} className={`rounded-lg border p-3 text-center ${c.clase}`}>
                      <div className="font-display-lg text-3xl font-bold">{c.n}</div>
                      <div className="text-xs font-medium uppercase tracking-wide">{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Nuevos */}
                {analisis.nuevos.length > 0 && (
                  <details className="border border-outline-variant rounded-lg" open>
                    <summary className="cursor-pointer px-4 py-2 font-title-md text-title-md text-emerald-700">
                      Se agregarán ({analisis.nuevos.length})
                    </summary>
                    <ul className="px-4 pb-3 max-h-40 overflow-y-auto text-body-md text-on-surface-variant">
                      {analisis.nuevos.map((f) => (
                        <li key={f.dni} className="py-1 border-t border-outline-variant/50">
                          {f.apellidos}, {f.nombres} — {f.grado} "{f.seccion}" · {f.dni}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Actualizar */}
                {analisis.actualizar.length > 0 && (
                  <details className="border border-outline-variant rounded-lg" open>
                    <summary className="cursor-pointer px-4 py-2 font-title-md text-title-md text-amber-700">
                      Se actualizarán ({analisis.actualizar.length})
                    </summary>
                    <ul className="px-4 pb-3 max-h-40 overflow-y-auto text-body-md text-on-surface-variant">
                      {analisis.actualizar.map((f) => {
                        const cambios = [];
                        if (f._bd.grado !== f.grado || f._bd.seccion !== f.seccion)
                          cambios.push(`${f._bd.grado} "${f._bd.seccion}" → ${f.grado} "${f.seccion}"`);
                        if (f._bd.apellidos !== f.apellidos || f._bd.nombres !== f.nombres) cambios.push('nombre');
                        if (!f._bd.activo) cambios.push('reactivar');
                        return (
                          <li key={f.dni} className="py-1 border-t border-outline-variant/50">
                            {f.apellidos}, {f.nombres} · {f.dni}
                            {cambios.length > 0 && (
                              <span className="text-amber-700"> — {cambios.join(', ')}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}

                {/* Bajas */}
                {analisis.bajas.length > 0 && (
                  <details className="border border-red-300 rounded-lg bg-red-50/40" open>
                    <summary className="cursor-pointer px-4 py-2 font-title-md text-title-md text-error">
                      Ya no están en el Excel ({analisis.bajas.length})
                    </summary>
                    <div className="px-4 pb-3">
                      <label className="flex items-start gap-2 py-2 text-body-md text-on-surface cursor-pointer">
                        <input
                          type="checkbox"
                          checked={incluirBajas}
                          onChange={(e) => setIncluirBajas(e.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          Dar de baja a estos alumnos (se marcan como <strong>inactivos</strong>, no se borran —
                          conservan su historial de asistencias).
                        </span>
                      </label>
                      <ul className="max-h-40 overflow-y-auto text-body-md text-on-surface-variant">
                        {analisis.bajas.map((e) => (
                          <li key={e.dni} className="py-1 border-t border-outline-variant/50">
                            {e.apellidos}, {e.nombres} — {e.grado} "{e.seccion}" · {e.dni}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}

                {analisis.nuevos.length === 0 &&
                  analisis.actualizar.length === 0 &&
                  analisis.bajas.length === 0 && (
                    <p className="text-center text-on-surface-variant py-4">
                      La base ya está al día con este Excel: no hay cambios que aplicar.
                    </p>
                  )}
              </div>

              <div className="p-6 border-t border-outline-variant flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAnalisis(null)}
                  className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={
                    aplicando ||
                    (analisis.nuevos.length === 0 &&
                      analisis.actualizar.length === 0 &&
                      !(incluirBajas && analisis.bajas.length > 0))
                  }
                  className="px-6 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Icon name="sync" className="text-[18px]" />
                  {aplicando ? 'Aplicando…' : 'Aplicar cambios'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
