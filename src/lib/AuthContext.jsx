import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  // Id del usuario cuyo perfil ya cargamos. Sirve para NO recargar el perfil
  // en cada evento de reautenticación (p. ej. al volver de otra pestaña
  // Supabase reemite SIGNED_IN aunque el usuario no haya cambiado).
  const usuarioIdRef = useRef(null);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      const s = data.session;
      setSession(s);
      if (s?.user) {
        usuarioIdRef.current = s.user.id;
        cargarPerfil(s.user.id, true); // arranque: sí mostramos el spinner
      } else {
        setCargando(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nuevaSesion) => {
      setSession(nuevaSesion);

      if (event === 'SIGNED_IN') {
        const idPrevio = usuarioIdRef.current;
        // Solo (re)cargamos si es un usuario DISTINTO al ya cargado. Si es el
        // mismo (reautenticación al reenfocar la pestaña), no hacemos nada:
        // así no se desmonta la pantalla ni se pierden datos en curso.
        if (idPrevio !== nuevaSesion.user.id) {
          usuarioIdRef.current = nuevaSesion.user.id;
          // Mostramos el spinner solo en el login inicial (antes no había
          // nadie); en un cambio de cuenta ya en sesión, recargamos en
          // segundo plano sin tapar la pantalla.
          cargarPerfil(nuevaSesion.user.id, idPrevio == null);
        }
      } else if (event === 'SIGNED_OUT') {
        usuarioIdRef.current = null;
        setPerfil(null);
        setCargando(false);
      }
      // TOKEN_REFRESHED / INITIAL_SESSION / USER_UPDATED: el token se renueva
      // solo en segundo plano; el perfil no cambia. Al no tocar `cargando`,
      // la pantalla no se desmonta y no se pierde ningún formulario abierto.
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function cargarPerfil(userId, mostrarCarga = false) {
    if (mostrarCarga) setCargando(true);
    const { data, error } = await supabase
      .from('perfiles_auxiliares')
      .select('*, auxiliar_secciones(grado, seccion)')
      .eq('id', userId)
      .single();
    if (error) console.error('Error cargando perfil de auxiliar:', error.message);
    setPerfil(data ? { ...data, secciones: data.auxiliar_secciones || [] } : null);
    setCargando(false);
  }

  // Vuelve a cargar el perfil del usuario en sesión (sin tapar la pantalla).
  // Útil tras editar tu propia cuenta para reflejar el cambio al instante.
  async function recargarPerfil() {
    if (session?.user) await cargarPerfil(session.user.id, false);
  }

  async function iniciarSesion(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
  }

  const esAdmin = perfil?.rol === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{ session, perfil, cargando, esAdmin, iniciarSesion, cerrarSesion, recargarPerfil }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
