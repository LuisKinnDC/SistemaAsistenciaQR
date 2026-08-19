import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from '../components/Icon';

const UIContext = createContext(null);

const TOAST_ESTILOS = {
  exito: { barra: 'bg-emerald-500', icon: 'check_circle', color: 'text-emerald-600' },
  error: { barra: 'bg-error', icon: 'error', color: 'text-error' },
  info: { barra: 'bg-primary', icon: 'info', color: 'text-primary' },
};

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null); // { titulo, mensaje, confirmLabel, cancelLabel, tono }
  const resolverRef = useRef(null);

  const quitarToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (mensaje, tipo = 'info', duracion = 3500) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, mensaje, tipo }]);
      setTimeout(() => quitarToast(id), duracion);
    },
    [quitarToast]
  );

  // Devuelve una promesa que resuelve true (Aceptar) o false (Cancelar).
  const confirmar = useCallback((opciones) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirm({
        titulo: opciones.titulo || '¿Confirmar acción?',
        mensaje: opciones.mensaje || '',
        confirmLabel: opciones.confirmLabel || 'Aceptar',
        cancelLabel: opciones.cancelLabel || 'Cancelar',
        tono: opciones.tono || 'normal', // normal | peligro
        icon: opciones.icon,
      });
    });
  }, []);

  function responder(valor) {
    setConfirm(null);
    if (resolverRef.current) {
      resolverRef.current(valor);
      resolverRef.current = null;
    }
  }

  const esPeligro = confirm?.tono === 'peligro';

  return (
    <UIContext.Provider value={{ toast, confirmar }}>
      {children}

      {/* Toasts (mensajes pop al costado) */}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const estilo = TOAST_ESTILOS[t.tipo] || TOAST_ESTILOS.info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-surface border border-outline-variant rounded-lg shadow-lg overflow-hidden flex items-stretch animate-[toast-in_.25s_ease-out]"
              role="status"
            >
              <div className={`w-1.5 ${estilo.barra}`} />
              <div className="flex items-center gap-2 p-3 flex-1">
                <Icon name={estilo.icon} className={`${estilo.color} text-[20px]`} />
                <span className="font-body-md text-body-md text-on-surface flex-1">{t.mensaje}</span>
                <button
                  onClick={() => quitarToast(t.id)}
                  className="text-on-surface-variant hover:text-on-surface shrink-0"
                  aria-label="Cerrar"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de confirmación */}
      {confirm && (
        <div className="fixed inset-0 z-[250] bg-inverse-surface/60 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-outline-variant shadow-lg w-full max-w-sm overflow-hidden">
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  esPeligro ? 'bg-error-container text-error' : 'bg-primary-container text-on-primary-container'
                }`}
              >
                <Icon name={confirm.icon || (esPeligro ? 'warning' : 'help')} className="text-[26px]" />
              </div>
              <h3 className="font-title-lg text-title-lg text-on-surface">{confirm.titulo}</h3>
              {confirm.mensaje && (
                <p className="font-body-md text-body-md text-on-surface-variant">{confirm.mensaje}</p>
              )}
            </div>
            <div className="p-4 border-t border-outline-variant flex gap-3">
              <button
                onClick={() => responder(false)}
                className="flex-1 px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container-low transition-colors"
              >
                {confirm.cancelLabel}
              </button>
              <button
                onClick={() => responder(true)}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${
                  esPeligro ? 'bg-error hover:opacity-90' : 'bg-brand-blue hover:bg-brand-blue-dark'
                }`}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI debe usarse dentro de <UIProvider>');
  return ctx;
}
