'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';

export default function AccesoPage() {
  const router = useRouter();
  const { user, loading, authError, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if ((user as any).mustChangePassword) {
        router.replace('/acceso/cambiar-contrasena');
        return;
      }
      if (user.role === 'owner') router.replace('/owner');
      else if (user.role === 'store') router.replace('/store');
      else if (user.role === 'support') router.replace('/dashboard');
      else setError('Este tipo de cuenta no tiene acceso web por ahora.');
    } else if (!loading && authError) {
      // Signed in with Firebase Auth, but the app-level profile failed to
      // load — previously this left the form stuck on "Ingresando..." (or
      // silently back to normal) with no explanation at all.
      setError(authError);
    }
  }, [user, loading, authError, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch {
      setError('Correo o contraseña incorrectos');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🐾</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-primary-700">JunglApp</h1>
          <p className="text-gray-500 mt-1">Acceso para dueños y tiendas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="tu@correo.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <Link href="/acceso/recuperar" className="text-xs font-medium text-primary-600 hover:text-primary-700">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl py-3 transition active:scale-[0.97] disabled:opacity-70"
          >
            {submitting ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-xs mt-6">
          ¿No tienes cuenta?{' '}
          <span className="text-primary-500 font-medium">Descarga la app para registrarte</span>
        </p>

        <div className="mt-4 text-center">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 transition">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
