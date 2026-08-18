import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import Icon from '../components/Icon';

export default function Login() {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const { error } = await iniciarSesion(email, password);
    setEnviando(false);
    if (error) setError('Correo o contraseña incorrectos.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background font-body-md px-4">
      <form
        onSubmit={manejarSubmit}
        className="bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant p-8 w-full max-w-sm"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Icon name="school" className="text-on-primary" fill />
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-black text-primary leading-tight">
              Asistencia Sanjuanino
            </h1>
            <p className="text-on-surface-variant text-label-md">Acceso de auxiliares y administración</p>
          </div>
        </div>

        <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Correo</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 mb-4 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition-all"
        />

        <label className="block font-label-md text-label-md text-on-surface-variant mb-1">Contraseña</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 mb-4 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition-all"
        />

        {error && (
          <p className="text-error text-sm mb-4 flex items-center gap-1">
            <Icon name="error" className="text-[16px]" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="bg-[#00164e] hover:bg-primary disabled:opacity-50 text-on-primary font-title-md text-title-md w-full py-2.5 rounded-lg transition-colors"
        >
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
