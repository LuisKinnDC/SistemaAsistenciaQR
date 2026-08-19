import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';
import { useUI } from '../lib/UIContext';
import { gradoCorto } from '../utils/turnos';
import Icon from './Icon';
import Cargador from './Cargador';

// Traza un rectángulo con esquinas redondeadas en el contexto 2D.
function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Parte un texto en varias líneas para que quepa en `maxWidth`, hasta un
// máximo de líneas; la última se recorta con "…" si aún no cabe.
function envolverTexto(ctx, texto, maxWidth, maxLineas) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let actual = '';
  for (let i = 0; i < palabras.length; i++) {
    const prueba = actual ? `${actual} ${palabras[i]}` : palabras[i];
    if (ctx.measureText(prueba).width <= maxWidth) {
      actual = prueba;
    } else {
      if (actual) lineas.push(actual);
      if (lineas.length === maxLineas - 1) {
        actual = palabras.slice(i).join(' ');
        break;
      }
      actual = palabras[i];
    }
  }
  if (actual) lineas.push(actual);
  const ultimo = lineas.length - 1;
  if (ultimo >= 0 && ctx.measureText(lineas[ultimo]).width > maxWidth) {
    let t = lineas[ultimo];
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    lineas[ultimo] = `${t}…`;
  }
  return lineas.slice(0, maxLineas);
}

export default function CarnetsQR() {
  const { toast } = useUI();
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
      set.set(key, `${gradoCorto(e.grado)} "${e.seccion}"`);
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

  // Genera un documento aislado SOLO con los carnets filtrados y lo manda a
  // imprimir. Como abre el diálogo de impresión del navegador, el usuario
  // puede elegir "Guardar como PDF". Usa un iframe oculto (evita bloqueadores
  // de pop-ups y no captura la pantalla de la app).
  function imprimirCarnets() {
    if (filtrados.length === 0) return;
    toast(`Generando PDF de ${filtrados.length} carnet(s)…`, 'info');

    const escapar = (t) =>
      String(t ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const tarjetas = filtrados
      .map((e) => {
        const svg = document.getElementById(`qr-${e.id}`);
        const qr = svg ? new XMLSerializer().serializeToString(svg) : '';
        const turnoClase = e.turno === 'MANANA' ? 'manana' : 'tarde';
        const turnoLabel = e.turno === 'MANANA' ? 'Mañana' : 'Tarde';
        const etiquetaId = e.tipoId === 'CODIGO' || String(e.dni).length > 10 ? 'Código' : 'DNI';
        return `
          <div class="carnet">
            <div class="franja ${turnoClase}"></div>
            <div class="cuerpo">
              <div class="qr">${qr}</div>
              <div class="nombre">${escapar(e.apellidos)}, ${escapar(e.nombres)}</div>
              <div class="meta">${escapar(gradoCorto(e.grado))} "${escapar(e.seccion)}"</div>
              <div class="id">${etiquetaId}: ${escapar(e.dni)}</div>
              <span class="badge ${turnoClase}">${turnoLabel}</span>
            </div>
          </div>`;
      })
      .join('');

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Carnets QR</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #1a1a1a; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8mm;
  }
  .carnet {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    display: flex;
    flex-direction: column;
    background: #fff;
  }
  .franja { height: 8px; width: 100%; }
  .franja.manana { background: #f59e0b; }
  .franja.tarde { background: #6366f1; }
  .cuerpo { padding: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .qr { width: 34mm; height: 34mm; padding: 4px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: center; }
  .qr svg { width: 100%; height: 100%; }
  .nombre { margin-top: 8px; font-size: 12px; font-weight: 700; line-height: 1.2; }
  .meta { margin-top: 2px; font-size: 11px; color: #475569; }
  .id { margin-top: 2px; font-size: 10px; color: #64748b; }
  .badge { margin-top: 6px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 2px 8px; border-radius: 999px; }
  .badge.manana { background: #fef3c7; color: #92400e; }
  .badge.tarde { background: #e0e7ff; color: #3730a3; }
</style>
</head>
<body>
  <div class="grid">${tarjetas}</div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    iframe.contentWindow.focus();
    // Pequeña espera para asegurar el render de los SVG antes de imprimir.
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 250);
  }

  // Descarga el CARNET COMPLETO como PNG (no solo el QR): franja de color,
  // QR, nombre, grado/sección, DNI/código y etiqueta de turno, igual que en
  // la vista y el PDF. Se dibuja todo en un canvas de alta resolución.
  function descargarCarnet(e) {
    const svg = document.getElementById(`qr-${e.id}`);
    if (!svg) {
      toast('No se pudo generar el carnet', 'error');
      return;
    }
    const svgStr = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const qrImg = new Image();

    qrImg.onload = () => {
      const escala = 3; // alta resolución
      const W = 320;
      const H = 420;
      const canvas = document.createElement('canvas');
      canvas.width = W * escala;
      canvas.height = H * escala;
      const ctx = canvas.getContext('2d');
      ctx.scale(escala, escala);

      const esManana = e.turno === 'MANANA';
      const colorFranja = esManana ? '#f59e0b' : '#6366f1';
      const badgeBg = esManana ? '#fef3c7' : '#e0e7ff';
      const badgeFg = esManana ? '#92400e' : '#3730a3';

      // Tarjeta blanca con esquinas redondeadas (fondo transparente afuera).
      const r = 16;
      rectRedondeado(ctx, 0.5, 0.5, W - 1, H - 1, r);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = colorFranja; // franja superior de color por turno
      ctx.fillRect(0, 0, W, 12);
      ctx.restore();
      rectRedondeado(ctx, 0.5, 0.5, W - 1, H - 1, r);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Caja del QR.
      const qrSize = 170;
      const qrX = (W - qrSize) / 2;
      const qrY = 36;
      rectRedondeado(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Textos, centrados.
      ctx.textAlign = 'center';
      let y = qrY + qrSize + 40;

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 18px Arial, sans-serif';
      const lineas = envolverTexto(ctx, `${e.apellidos}, ${e.nombres}`, W - 40, 2);
      for (const ln of lineas) {
        ctx.fillText(ln, W / 2, y);
        y += 22;
      }

      ctx.fillStyle = '#475569';
      ctx.font = '400 14px Arial, sans-serif';
      ctx.fillText(`${gradoCorto(e.grado)} "${e.seccion}"`, W / 2, y);
      y += 20;

      const etiqueta = e.tipoId === 'CODIGO' || String(e.dni).length > 10 ? 'Código' : 'DNI';
      ctx.fillStyle = '#64748b';
      ctx.font = '400 12px Arial, sans-serif';
      ctx.fillText(`${etiqueta}: ${e.dni}`, W / 2, y);
      y += 22;

      // Badge de turno.
      const texto = esManana ? 'MAÑANA' : 'TARDE';
      ctx.font = '700 11px Arial, sans-serif';
      const bw = ctx.measureText(texto).width + 24;
      const bh = 22;
      const bx = (W - bw) / 2;
      rectRedondeado(ctx, bx, y, bw, bh, bh / 2);
      ctx.fillStyle = badgeBg;
      ctx.fill();
      ctx.fillStyle = badgeFg;
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, W / 2, y + bh / 2 + 1);
      ctx.textBaseline = 'alphabetic';

      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = `carnet_${e.dni}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      toast(`Carnet de ${e.apellidos}, ${e.nombres} descargado`, 'exito');
    };

    qrImg.src = url;
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
            onClick={imprimirCarnets}
            disabled={filtrados.length === 0}
            className="hidden md:flex items-center px-6 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm no-print disabled:opacity-50"
          >
            <Icon name="picture_as_pdf" className="mr-2 text-[20px]" />
            Generar PDF de Carnets
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

        {cargando && <Cargador texto="Cargando estudiantes…" className="py-16 no-print" />}

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
                  {gradoCorto(e.grado)} "{e.seccion}" · {String(e.dni).length > 10 ? 'Código' : 'DNI'} {e.dni}
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
                <button onClick={() => descargarCarnet(e)} title="Descargar carnet (PNG)">
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
        onClick={imprimirCarnets}
        disabled={filtrados.length === 0}
        className="md:hidden fixed bottom-24 right-4 z-40 bg-primary text-on-primary w-14 h-14 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-container active:scale-95 transition-transform no-print disabled:opacity-50"
      >
        <Icon name="picture_as_pdf" />
      </button>
    </>
  );
}
