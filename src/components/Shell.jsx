import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useUI } from '../lib/UIContext';
import Icon from './Icon';

const ITEMS = [
  { to: '/importar', label: 'Importar Excel', labelCorto: 'Importar', icon: 'upload_file', soloAdmin: true },
  { to: '/carnets', label: 'Generar QR', labelCorto: 'QR', icon: 'qr_code_2', soloAdmin: true },
  { to: '/escaner', label: 'Escáner de Asistencia', labelCorto: 'Escáner', icon: 'qr_code_scanner', soloAdmin: false },
  { to: '/reportes', label: 'Reportes', labelCorto: 'Reportes', icon: 'analytics', soloAdmin: true },
  { to: '/usuarios', label: 'Gestión de Usuarios', labelCorto: 'Usuarios', icon: 'manage_accounts', soloAdmin: true },
];

function seccionesTexto(perfil) {
  if (!perfil?.secciones?.length) return '';
  return perfil.secciones.map((s) => `${s.grado} "${s.seccion}"`).join(', ');
}

function Logo({ small = false }) {
  return (
    <img
      src="/logo.png"
      alt="Escudo Colegio San Juan"
      className={`${small ? 'w-8 h-8' : 'w-10 h-10'} object-contain shrink-0`}
    />
  );
}

export default function Shell({ children }) {
  const { perfil, esAdmin, cerrarSesion } = useAuth();
  const { confirmar, toast } = useUI();
  const items = ITEMS.filter((i) => !i.soloAdmin || esAdmin);

  async function manejarCerrarSesion() {
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

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen antialiased flex flex-col md:flex-row">
      {/* SIDE NAV (Desktop) */}
      <nav className="bg-surface-container-low text-primary font-label-md text-label-md h-screen w-[280px] hidden md:flex flex-col border-r border-outline-variant fixed left-0 top-0 z-40">
        <div className="p-6 border-b border-outline-variant/50">
          <div className="flex items-center gap-3 mb-4">
            <Logo />
            <div>
              <h1 className="font-headline-md text-headline-md font-black text-primary leading-tight">
                Asistencia Sanjuanino
              </h1>
            </div>
          </div>
          <p className="text-on-surface-variant text-label-md uppercase tracking-wider">
            {esAdmin ? 'Panel de Administrador' : 'Panel del Auxiliar'}
          </p>
        </div>
        <div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-bold border-l-4 border-brand-yellow'
                    : 'text-on-surface-variant hover:bg-surface-container-high border-l-4 border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} fill={isActive} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-outline-variant/50">
          <div className="flex items-center justify-between px-2">
            <div className="min-w-0">
              <p className="text-on-surface text-body-md font-medium truncate">
                {perfil?.nombres || perfil?.email}
              </p>
              <p className="text-on-surface-variant text-label-md truncate" title={seccionesTexto(perfil)}>
                {perfil?.rol === 'ADMIN' ? 'Administrador' : seccionesTexto(perfil) || 'Sin secciones asignadas'}
              </p>
            </div>
            <button
              onClick={manejarCerrarSesion}
              className="text-on-surface-variant hover:text-primary p-2 rounded-full hover:bg-surface-container-high transition-colors shrink-0"
              title="Cerrar sesión"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </nav>

      {/* TOP NAV (Mobile) */}
      <header className="sticky top-0 z-50 flex justify-between items-center w-full px-margin-mobile md:hidden h-16 bg-surface border-b border-outline-variant shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Logo small />
          <span className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-primary truncate">
            Asistencia SJ
          </span>
        </div>
        <button
          onClick={manejarCerrarSesion}
          className="text-primary active:scale-95 duration-150 p-2 rounded-full hover:bg-surface-container-low transition-colors"
          title="Cerrar sesión"
        >
          <Icon name="logout" />
        </button>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 md:ml-[280px] w-full pb-24 md:pb-0 min-h-screen">{children}</main>

      {/* BOTTOM NAV (Mobile) */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 md:hidden bg-surface border-t border-outline-variant shadow-lg">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center p-2 rounded-xl scale-95 transition-transform ${
                isActive ? 'bg-primary-container text-on-primary-container' : 'text-on-surface-variant active:bg-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} fill={isActive} className="text-[24px]" />
                <span className="mt-1 text-[10px]">{item.labelCorto}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
