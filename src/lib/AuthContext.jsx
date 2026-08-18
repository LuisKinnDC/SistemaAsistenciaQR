import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) cargarPerfil(data.session.user.id);
      else setCargando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nuevaSesion) => {
      setSession(nuevaSesion);
      if (event === 'SIGNED_IN') {
        cargarPerfil(nuevaSesion.user.id);
      } else if (event === 'SIGNED_OUT') {
        setPerfil(null);
        setCargando(false);
      }
      // TOKEN_REFRESHED / INITIAL_SESSION / USER_UPDATED: el token se
      // renueva solo en segundo plano (p. ej. al volver de otra pestaña),
      // el perfil no cambia. No tocar `cargando` aquí evita que la pantalla
      // se desmonte y se pierda cualquier formulario en progreso.
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function cargarPerfil(userId) {
    setCargando(true);
    const { data, error } = await supabase
      .from('perfiles_auxiliares')
      .select('*, auxiliar_secciones(grado, seccion)')
      .eq('id', userId)
      .single();
    if (error) console.error('Error cargando perfil de auxiliar:', error.message);
    setPerfil(data ? { ...data, secciones: data.auxiliar_secciones || [] } : null);
    setCargando(false);
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
      value={{ session, perfil, cargando, esAdmin, iniciarSesion, cerrarSesion }}
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
