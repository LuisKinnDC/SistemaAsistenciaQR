import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import ImportarExcel from './components/ImportarExcel';
import CarnetsQR from './components/CarnetsQR';
import EscanerQR from './components/EscanerQR';
import ReportesAuxiliar from './components/ReportesAuxiliar';
import GestionUsuarios from './components/GestionUsuarios';
import Shell from './components/Shell';

// Se monta UNA sola vez al entrar al área protegida; <Outlet /> es lo único
// que cambia entre rutas, así el Shell (sidebar/nav) no se desmonta ni
// "parpadea" al navegar entre pantallas.
function ShellLayout() {
  const { session, perfil, cargando } = useAuth();
  if (cargando) return <div className="p-10 text-center text-on-surface-variant font-body-md">Cargando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!perfil) {
    return (
      <div className="p-10 text-center text-error font-body-md">
        Tu usuario no tiene un perfil de auxiliar asignado. Contacta al administrador.
      </div>
    );
  }
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

function RutaAdmin({ children }) {
  const { esAdmin } = useAuth();
  if (!esAdmin) return <Navigate to="/escaner" replace />;
  return children;
}

export default function App() {
  const { session, cargando } = useAuth();

  if (cargando) return <div className="p-10 text-center text-on-surface-variant font-body-md">Cargando...</div>;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/escaner" replace /> : <Login />} />
      <Route element={<ShellLayout />}>
        <Route path="/escaner" element={<EscanerQR />} />
        <Route
          path="/reportes"
          element={
            <RutaAdmin>
              <ReportesAuxiliar />
            </RutaAdmin>
          }
        />
        <Route
          path="/importar"
          element={
            <RutaAdmin>
              <ImportarExcel />
            </RutaAdmin>
          }
        />
        <Route
          path="/carnets"
          element={
            <RutaAdmin>
              <CarnetsQR />
            </RutaAdmin>
          }
        />
        <Route
          path="/usuarios"
          element={
            <RutaAdmin>
              <GestionUsuarios />
            </RutaAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/escaner" replace />} />
    </Routes>
  );
}
