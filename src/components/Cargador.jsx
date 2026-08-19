// Spinner de carga reutilizable. Úsalo con `pantallaCompleta` para el
// arranque del sistema, o embebido (sin la prop) para cargas dentro de una
// pantalla ya montada.
export default function Cargador({ texto = 'Cargando…', pantallaCompleta = false, className = '' }) {
  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <span
        role="status"
        aria-label="Cargando"
        className="inline-block w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"
      />
      {texto && <p className="text-on-surface-variant font-body-md text-body-md">{texto}</p>}
    </div>
  );

  if (pantallaCompleta) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-background">{spinner}</div>;
  }
  return spinner;
}
