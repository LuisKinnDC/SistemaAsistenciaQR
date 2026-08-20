import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useUI } from '../lib/UIContext';
import Icon from './Icon';

// Texto de secciones a cargo del auxiliar (ej: 3° "A", 4° "B").
function seccionesTexto(perfil) {
  if (!perfil?.secciones?.length) return '';
  return perfil.secciones.map((s) => `${s.grado} "${s.seccion}"`).join(', ');
}

// Iniciales para el avatar: primeras letras de los dos primeros nombres.
function iniciales(perfil) {
  const base = perfil?.nombres || perfil?.email || '';
  const partes = base.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  const dos = partes.slice(0, 2).map((p) => p[0]);
  return dos.join('').toUpperCase();
}

// Botón de perfil (esquina superior derecha) con menú desplegable que muestra
// el nombre del usuario, su rol/secciones y la opción de cerrar sesión.
export default function ProfileMenu() {
  const { perfil, cerrarSesion } = useAuth();
  const { confirmar, toast } = useUI();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  // Cierra el menú al hacer clic fuera o presionar Escape.
  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    function alEscape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alClicFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClicFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  async function manejarCerrarSesion() {
    setAbierto(false);
    const ok = await confirmar({
      titulo: 'Cerrar sesión',
      mensaje: '¿Seguro que quieres salir de tu cuenta?',
      confirmLabel: 'Cerrar sesión',
      tono: 'peligro',
      icon: 'logout',
    });
    if (!ok) return;
    toast('Sesión cerrada', 'info');
    await cerrarSesion();
  }

  const esAdmin = perfil?.rol === 'ADMIN';
  const subtitulo = esAdmin ? 'Administrador' : seccionesTexto(perfil) || 'Sin secciones asignadas';
  const ini = iniciales(perfil);

  return (
    <div className="relative shrink-0" ref={contenedorRef}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Mi perfil"
        className="flex items-center justify-center w-10 h-10 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-bold active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {ini || <Icon name="person" />}
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 max-w-[80vw] rounded-2xl bg-surface-container-low border border-outline-variant shadow-lg overflow-hidden z-50"
        >
          <div className="flex items-center gap-3 p-4 border-b border-outline-variant/60">
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-primary-container text-on-primary-container font-label-md text-label-md font-bold shrink-0">
              {ini || <Icon name="person" />}
            </div>
            <div className="min-w-0">
              <p className="text-on-surface text-body-md font-semibold truncate">
                {perfil?.nombres || perfil?.email}
              </p>
              <p className="text-on-surface-variant text-label-md truncate" title={subtitulo}>
                {subtitulo}
              </p>
            </div>
          </div>
          <button
            role="menuitem"
            onClick={manejarCerrarSesion}
            className="flex items-center gap-3 w-full px-4 py-3 text-error hover:bg-surface-container-high transition-colors text-body-md font-medium"
          >
            <Icon name="logout" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}
    </div>
  );
}
