import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { useUI } from '../lib/UIContext';
import { HORARIOS, TURNOS } from '../utils/turnos';
import Icon from './Icon';

function seccionesValidas(turno) {
  return turno === TURNOS.MANANA ? HORARIOS.MANANA.secciones : HORARIOS.TARDE.secciones;
}

function formularioVacio() {
  return {
    id: null,
    nombres: '',
    email: '',
    dni: '',
    password: '',
    rol: 'AUXILIAR',
    turno: TURNOS.MANANA,
    secciones: [],
  };
}

// Borrador del formulario: se guarda en sessionStorage mientras el modal
// está abierto, para que si el navegador recarga la pestaña (p. ej. al
// volver de otra pestaña con el ahorro de memoria activo) no se pierda lo
// que estabas escribiendo. Se limpia al cerrar/guardar el formulario.
const STORAGE_KEY = 'gestion_usuarios_borrador';

function leerBorrador() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function GestionUsuarios() {
  const { perfil: perfilActual, recargarPerfil } = useAuth();
  const { toast, confirmar } = useUI();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [modalAbierto, setModalAbierto] = useState(() => leerBorrador()?.modalAbierto ?? false);
  const [form, setForm] = useState(() => leerBorrador()?.form ?? formularioVacio());
  const [guardando, setGuardando] = useState(false);
  const [nuevoGrado, setNuevoGrado] = useState('1°');
  const [nuevaSeccion, setNuevaSeccion] = useState(seccionesValidas(TURNOS.MANANA)[0]);

  useEffect(() => {
    cargarUsuarios();
  }, []);

  // Persiste (o limpia) el borrador cada vez que cambia el formulario o el modal.
  useEffect(() => {
    if (modalAbierto) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ modalAbierto, form }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [modalAbierto, form]);

  async function cargarUsuarios() {
    setCargando(true);
    const { data, error } = await supabase
      .from('perfiles_auxiliares')
      .select('*, auxiliar_secciones(grado, seccion)')
      .order('created_at', { ascending: false });
    if (error) setErrorMsg(error.message);
    setUsuarios(data || []);
    setCargando(false);
  }

  function abrirCrear() {
    setForm(formularioVacio());
    setNuevaSeccion(seccionesValidas(TURNOS.MANANA)[0]);
    setErrorMsg('');
    setModalAbierto(true);
  }

  function abrirEditar(usuario) {
    setForm({
      id: usuario.id,
      nombres: usuario.nombres,
      email: usuario.email,
      dni: usuario.dni || '',
      password: '',
      rol: usuario.rol,
      turno: usuario.turno || TURNOS.MANANA,
      secciones: usuario.auxiliar_secciones || [],
    });
    setNuevaSeccion(seccionesValidas(usuario.turno || TURNOS.MANANA)[0]);
    setErrorMsg('');
    setModalAbierto(true);
  }

  function cambiarTurnoForm(turno) {
    setForm((f) => ({ ...f, turno, secciones: [] }));
    setNuevaSeccion(seccionesValidas(turno)[0]);
  }

  function agregarSeccion() {
    if (!nuevoGrado.trim()) return;
    const grado = nuevoGrado.trim();
    const yaExiste = form.secciones.some((s) => s.grado === grado && s.seccion === nuevaSeccion);
    if (yaExiste) return;
    setForm((f) => ({ ...f, secciones: [...f.secciones, { grado, seccion: nuevaSeccion }] }));
  }

  function quitarSeccion(idx) {
    setForm((f) => ({ ...f, secciones: f.secciones.filter((_, i) => i !== idx) }));
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorMsg('');

    try {
      if (form.id) {
        // Editar usuario existente: perfiles_auxiliares y auxiliar_secciones
        // son directamente editables por un ADMIN vía RLS, sin Edge Function.
        const { error: errPerfil } = await supabase
          .from('perfiles_auxiliares')
          .update({
            nombres: form.nombres,
            dni: form.dni || null,
            rol: form.rol,
            turno: form.rol === 'ADMIN' ? null : form.turno,
          })
          .eq('id', form.id);
        if (errPerfil) throw errPerfil;

        const { error: errBorrar } = await supabase
          .from('auxiliar_secciones')
          .delete()
          .eq('auxiliar_id', form.id);
        if (errBorrar) throw errBorrar;

        if (form.rol === 'AUXILIAR' && form.secciones.length > 0) {
          const { error: errSecciones } = await supabase.from('auxiliar_secciones').insert(
            form.secciones.map((s) => ({ auxiliar_id: form.id, grado: s.grado, seccion: s.seccion }))
          );
          if (errSecciones) throw errSecciones;
        }

        if (form.password) {
          const { error: errPass } = await supabase.functions.invoke('admin-usuarios', {
            body: { accion: 'cambiar_password', id: form.id, password: form.password },
          });
          if (errPass) throw errPass;
        }
      } else {
        // Crear usuario nuevo: requiere la Edge Function (service role).
        const { data, error } = await supabase.functions.invoke('admin-usuarios', {
          body: {
            accion: 'crear',
            email: form.email,
            password: form.password,
            nombres: form.nombres,
            dni: form.dni || null,
            rol: form.rol,
            turno: form.rol === 'ADMIN' ? null : form.turno,
            secciones: form.rol === 'AUXILIAR' ? form.secciones : [],
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      setModalAbierto(false);
      await cargarUsuarios();
      // Si editaste tu propia cuenta, refresca el perfil en sesión para que
      // el nombre/rol se actualice al instante en la barra lateral.
      if (form.id === perfilActual?.id) await recargarPerfil();
      toast(form.id ? 'Cambios guardados' : 'Usuario creado', 'exito');
    } catch (err) {
      setErrorMsg(err.message || 'Ocurrió un error al guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(usuario) {
    if (usuario.id === perfilActual?.id) return;
    const ok = await confirmar({
      titulo: 'Eliminar usuario',
      mensaje: `¿Eliminar la cuenta de ${usuario.nombres}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tono: 'peligro',
      icon: 'delete',
    });
    if (!ok) return;

    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
      body: { accion: 'eliminar', id: usuario.id },
    });
    if (error || data?.error) {
      const msg = error?.message || data?.error || 'No se pudo eliminar el usuario.';
      setErrorMsg(msg);
      toast(msg, 'error');
      return;
    }
    await cargarUsuarios();
    toast(`Usuario ${usuario.nombres} eliminado`, 'exito');
  }

  const secciones = useMemo(() => seccionesValidas(form.turno), [form.turno]);

  return (
    <div className="p-margin-mobile md:p-margin-desktop pb-24 md:pb-margin-desktop w-full max-w-max-width mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">
            Gestión de Usuarios
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Crea y administra cuentas de administradores y auxiliares, y su jurisdicción de secciones.
          </p>
        </div>
        <button
          onClick={abrirCrear}
          className="flex items-center px-6 py-2.5 bg-primary text-on-primary rounded-full font-label-md text-label-md hover:bg-primary-container hover:text-on-primary-container transition-colors shadow-sm"
        >
          <Icon name="person_add" className="mr-2 text-[20px]" />
          Nuevo Usuario
        </button>
      </div>

      {errorMsg && !modalAbierto && (
        <div className="bg-red-50 border border-red-300 text-error rounded-lg p-3 mb-6 text-sm">{errorMsg}</div>
      )}

      <div className="bg-surface rounded-xl border border-outline-variant elevation-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low/50 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-6 font-medium">Nombre</th>
                <th className="py-3 px-6 font-medium">Email</th>
                <th className="py-3 px-6 font-medium">Rol</th>
                <th className="py-3 px-6 font-medium">Turno</th>
                <th className="py-3 px-6 font-medium">Secciones</th>
                <th className="py-3 px-6 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                  <td className="py-3 px-6 font-medium">{u.nombres}</td>
                  <td className="py-3 px-6 text-on-surface-variant">{u.email}</td>
                  <td className="py-3 px-6">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${
                        u.rol === 'ADMIN'
                          ? 'bg-primary-container text-on-primary-container border-primary/30'
                          : 'bg-surface-variant text-on-surface-variant border-outline-variant'
                      }`}
                    >
                      {u.rol}
                    </span>
                  </td>
                  <td className="py-3 px-6">
                    {u.turno ? (
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border ${
                          u.turno === 'MANANA'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {u.turno === 'MANANA' ? 'MAÑANA' : 'TARDE'}
                      </span>
                    ) : (
                      <span className="text-on-surface-variant text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-6 text-on-surface-variant text-xs max-w-xs">
                    {(u.auxiliar_secciones || []).map((s) => `${s.grado} "${s.seccion}"`).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-6 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="text-secondary hover:text-primary transition-colors p-1"
                        title="Editar"
                      >
                        <Icon name="edit" className="text-[20px]" />
                      </button>
                      <button
                        onClick={() => eliminar(u)}
                        disabled={u.id === perfilActual?.id}
                        className="text-error hover:opacity-70 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={u.id === perfilActual?.id ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'}
                      >
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-on-surface-variant">
                    Aún no hay usuarios registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear/Editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-[100] bg-inverse-surface/60 flex items-center justify-center p-4">
          <form
            onSubmit={guardar}
            className="bg-surface rounded-xl border border-outline-variant shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-outline-variant flex justify-between items-center">
              <h3 className="font-title-lg text-title-lg text-on-surface">
                {form.id ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <button type="button" onClick={() => setModalAbierto(false)} className="text-on-surface-variant hover:text-primary">
                <Icon name="close" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Nombres completos</label>
                <input
                  required
                  value={form.nombres}
                  onChange={(e) => setForm((f) => ({ ...f, nombres: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1">DNI (opcional)</label>
                  <input
                    value={form.dni}
                    onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Rol</label>
                  <select
                    value={form.rol}
                    onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                    className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                  >
                    <option value="AUXILIAR">Auxiliar</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Email</label>
                <input
                  type="email"
                  required
                  disabled={!!form.id}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface-variant mb-1">
                  {form.id ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña temporal'}
                </label>
                <input
                  type="text"
                  required={!form.id}
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                />
              </div>

              {form.rol === 'AUXILIAR' && (
                <>
                  <div>
                    <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Turno</label>
                    <div className="flex bg-surface-container-low rounded-lg p-1 border border-outline-variant w-fit">
                      {[TURNOS.MANANA, TURNOS.TARDE].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => cambiarTurnoForm(t)}
                          className={`px-4 py-1.5 rounded-md font-label-md text-label-md transition-colors ${
                            form.turno === t
                              ? 'bg-white shadow-sm text-primary border border-outline-variant/30'
                              : 'text-on-surface-variant hover:bg-surface-variant'
                          }`}
                        >
                          {HORARIOS[t].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block font-label-md text-label-md text-on-surface-variant mb-1">
                      Secciones a cargo
                    </label>
                    <div className="flex gap-2 mb-2">
                      <select
                        value={nuevoGrado}
                        onChange={(e) => setNuevoGrado(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                      >
                        {['1°', '2°', '3°', '4°', '5°'].map((g) => (
                          <option key={g} value={g}>
                            {g} grado
                          </option>
                        ))}
                      </select>
                      <select
                        value={nuevaSeccion}
                        onChange={(e) => setNuevaSeccion(e.target.value)}
                        className="px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-secondary"
                      >
                        {secciones.map((s) => (
                          <option key={s} value={s}>
                            Sección {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={agregarSeccion}
                        className="px-3 py-2 bg-surface-container-high text-primary rounded-lg hover:bg-surface-variant transition-colors"
                      >
                        <Icon name="add" className="text-[18px]" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {form.secciones.map((s, i) => (
                        <span
                          key={`${s.grado}-${s.seccion}-${i}`}
                          className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface px-2 py-1 rounded-full text-xs"
                        >
                          {s.grado} "{s.seccion}"
                          <button type="button" onClick={() => quitarSeccion(i)} className="hover:text-error">
                            <Icon name="close" className="text-[14px]" />
                          </button>
                        </span>
                      ))}
                      {form.secciones.length === 0 && (
                        <span className="text-on-surface-variant text-xs">Ninguna sección agregada aún.</span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {errorMsg && (
                <div className="bg-red-50 border border-red-300 text-error rounded-lg p-3 text-sm flex items-center gap-2">
                  <Icon name="error" className="text-[18px]" />
                  {errorMsg}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-outline-variant flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container-low transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="px-6 py-2 bg-brand-blue text-white rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
