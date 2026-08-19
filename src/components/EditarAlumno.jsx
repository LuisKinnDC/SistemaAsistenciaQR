import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useUI } from '../lib/UIContext';
import { seccionATurno, HORARIOS } from '../utils/turnos';
import Icon from './Icon';

// Herramienta para modificar un alumno puntual buscándolo por su DNI/código:
// cambiar grado/sección (el turno se recalcula solo) y darlo de baja o alta.
// Útil para casos individuales (p. ej. un alumno que se cambió de sección)
// sin tener que re-subir toda la nómina.
export default function EditarAlumno() {
  const { toast } = useUI();
  const [dni, setDni] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [alumno, setAlumno] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);

  const turnoDerivado = form ? seccionATurno(form.seccion) : null;

  async function buscar(e) {
    e?.preventDefault();
    const q = dni.trim();
    if (!q) return;
    setBuscando(true);
    setMsg(null);
    setAlumno(null);
    setForm(null);

    const { data, error } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('dni', q)
      .maybeSingle();

    setBuscando(false);
    if (error) {
      setMsg({ ok: false, texto: error.message });
      return;
    }
    if (!data) {
      setMsg({ ok: false, texto: `No se encontró ningún alumno con DNI/código ${q}.` });
      return;
    }
    setAlumno(data);
    setForm({
      nombres: data.nombres,
      apellidos: data.apellidos,
      grado: data.grado,
      seccion: data.seccion,
      activo: data.activo,
    });
  }

  async function guardar(e) {
    e.preventDefault();
    if (!alumno) return;
    if (!turnoDerivado) {
      setMsg({ ok: false, texto: 'La sección debe ser una letra A–H válida.' });
      return;
    }
    setGuardando(true);
    setMsg(null);

    const seccion = form.seccion.trim().toUpperCase();
    const { error } = await supabase
      .from('estudiantes')
      .update({
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        grado: form.grado.trim(),
        seccion,
        turno: turnoDerivado,
        activo: form.activo,
      })
      .eq('id', alumno.id);

    setGuardando(false);
    if (error) {
      setMsg({ ok: false, texto: error.message });
      return;
    }
    setAlumno((a) => ({ ...a, ...form, seccion, turno: turnoDerivado }));
    setMsg({ ok: true, texto: 'Cambios guardados correctamente.' });
    toast('Alumno actualizado', 'exito');
  }

  const inputCls =
    'w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary';

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h3 className="font-title-lg text-title-lg text-on-surface">Modificar alumno por DNI</h3>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Busca un alumno por su DNI o código y cambia su grado/sección (el turno se ajusta
          automáticamente) o su estado (activo/inactivo).
        </p>
      </div>

      {/* Buscador */}
      <form onSubmit={buscar} className="flex gap-2">
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI o código del alumno"
          inputMode="numeric"
          className={inputCls}
        />
        <button
          type="submit"
          disabled={buscando || !dni.trim()}
          className="shrink-0 px-5 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Icon name="search" className="text-[18px]" />
          {buscando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {msg && (
        <div
          className={`rounded-lg p-3 flex items-center gap-2 text-sm ${
            msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-red-50 text-error border border-red-300'
          }`}
        >
          <Icon name={msg.ok ? 'check_circle' : 'error'} className="text-[18px]" />
          {msg.texto}
        </div>
      )}

      {/* Formulario de edición */}
      {alumno && form && (
        <form
          onSubmit={guardar}
          className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex flex-col gap-4"
        >
          <div className="flex items-center gap-2 text-on-surface-variant text-sm">
            <Icon name="badge" className="text-[18px]" />
            {String(alumno.dni).length > 10 ? 'Código' : 'DNI'}: <strong className="text-on-surface">{alumno.dni}</strong>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Apellidos</label>
              <input
                value={form.apellidos}
                onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Nombres</label>
              <input
                value={form.nombres}
                onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Grado (ej: 3°)</label>
              <input
                value={form.grado}
                onChange={(e) => setForm((f) => ({ ...f, grado: e.target.value }))}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Sección (A–H)</label>
              <input
                value={form.seccion}
                onChange={(e) => setForm((f) => ({ ...f, seccion: e.target.value.toUpperCase() }))}
                maxLength={1}
                className={inputCls}
                required
              />
            </div>
          </div>

          {/* Turno derivado */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-on-surface-variant">Turno resultante:</span>
            {turnoDerivado ? (
              <span
                className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${
                  turnoDerivado === 'MANANA'
                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                    : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                }`}
              >
                {HORARIOS[turnoDerivado].label}
              </span>
            ) : (
              <span className="text-error inline-flex items-center gap-1">
                <Icon name="error" className="text-[16px]" /> Sección inválida
              </span>
            )}
          </div>

          <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            />
            Alumno activo (desmárcalo para darlo de baja sin borrar su historial)
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={guardando || !turnoDerivado}
              className="px-6 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Icon name="save" className="text-[18px]" />
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
