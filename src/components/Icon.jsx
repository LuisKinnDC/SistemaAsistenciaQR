// Envuelve un ícono de Material Symbols Outlined (cargado como fuente en index.html).
export default function Icon({ name, className = '', fill = false, style }) {
  return (
    <span className={`material-symbols-outlined ${fill ? 'fill-icon' : ''} ${className}`} style={style}>
      {name}
    </span>
  );
}
