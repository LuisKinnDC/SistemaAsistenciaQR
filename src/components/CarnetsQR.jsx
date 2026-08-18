import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';
import Icon from './Icon';

export default function CarnetsQR() {
  const [estudiantes, setEstudiantes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [turno, setTurno] = useState('todos');
  const [gradoSeccion, setGradoSeccion] = useState('all');

  useEffect(() => {
    cargarEstudiantes();
  }, []);

  async function cargarEstudiantes() {
    setCargando(true);
    const { data, error } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('activo', true)
      .order('apellidos');
    if (!error) setEstudiantes(data || []);
    setCargando(false);
  }

  const gradoSeccionOpciones = useMemo(() => {
    const set = new Map();
    for (const e of estudiantes) {
      const key = `${e.grado}|${e.seccion}`;
      set.set(key, `${e.grado} "${e.seccion}"`);
    }
    return Array.from(set.entries());
  }, [estudiantes]);

  const filtrados = useMemo(() => {
    return estudiantes.filter((e) => {
      if (turno !== 'todos' && e.turno !== turno) return false;
      if (gradoSeccion !== 'all' && `${e.grado}|${e.seccion}` !== gradoSeccion) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const nombreCompleto = `${e.apellidos} ${e.nombres}`.toLowerCase();
        if (!nombreCompleto.includes(q) && !e.dni.includes(q)) return false;
      }
      return true;
    });
  }, [estudiantes, turno, gradoSeccion, busqueda]);

  function descargarQR(estudiante) {
    const svg = document.getElementById(`qr-${estudiante.id}`);
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = `carnet_${estudiante.dni}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }

  return (
    <>
      <div className="p-margin-mobile md:p-margin-desktop pb-24 md:pb-margin-desktop w-full max-w-max-width mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">
              Generador de Carnets
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Crea y gestiona identificaciones de estudiantes con códigos QR.
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="hidden md:flex items-center px-6 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm no-print"
          >
            <Icon name="print" className="mr-2 text-[20px]" />
            Imprimir Carnets Filtrados
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm mb-8 no-print">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Buscar</label>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary transition-all text-body-md"
                placeholder="Nombre o DNI..."
                type="text"
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Turno</label>
              <select
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary transition-all text-body-md"
              >
                <option value="todos">Todos los Turnos</option>
                <option value="MANANA">Mañana</option>
                <option value="TARDE">Tarde</option>
              </select>
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">
                Grado y Sección
              </label>
              <select
                value={gradoSeccion}
                onChange={(e) => setGradoSeccion(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary transition-all text-body-md"
              >
                <option value="all">Todas las Secciones</option>
                {gradoSeccionOpciones.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex items-end justify-end">
              <span className="font-body-md text-body-md text-on-surface-variant">
                Mostrando {filtrados.length} estudiantes
              </span>
            </div>
          </div>
        </div>

        {cargando && <p className="text-on-surface-variant no-print">Cargando estudiantes...</p>}

        {/* Cards Grid (Print Area) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="print-area">
          {filtrados.map((e) => (
            <div
              key={e.id}
              className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow break-inside-avoid"
            >
              <div className={`h-2 w-full ${e.turno === 'MANANA' ? 'bg-amber-500' : 'bg-indigo-500'}`} />
              <div className="p-5 flex flex-col items-center flex-1">
                <div className="w-32 h-32 flex items-center justify-center border border-outline-variant p-2 rounded-lg bg-white">
                  <QRCodeSVG id={`qr-${e.id}`} value={e.dni} size={112} level="M" />
                </div>
                <p className="mt-3 font-title-md text-title-md text-on-surface text-center">
                  {e.apellidos}, {e.nombres}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
                  {e.grado} "{e.seccion}" · DNI {e.dni}
                </p>
                <span
                  className={`mt-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    e.turno === 'MANANA' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {e.turno === 'MANANA' ? 'Mañana' : 'Tarde'}
                </span>
              </div>
              <div className="bg-surface-container-low px-4 py-3 border-t border-outline-variant flex justify-between items-center no-print">
                <span className="font-label-md text-label-md text-primary cursor-default">{e.dni}</span>
                <button onClick={() => descargarQR(e)} title="Descargar PNG">
                  <Icon name="download" className="text-outline hover:text-primary cursor-pointer" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {!cargando && filtrados.length === 0 && (
          <p className="text-on-surface-variant no-print mt-6">
            No hay estudiantes que coincidan con los filtros seleccionados.
          </p>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => window.print()}
        className="md:hidden fixed bottom-24 right-4 z-40 bg-primary text-on-primary w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-container active:scale-95 transition-transform no-print"
      >
        <Icon name="print" />
      </button>
    </>
  );
}
