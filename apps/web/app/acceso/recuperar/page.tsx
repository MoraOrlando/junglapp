'use client';

import { useState } from 'react';
import Link from 'next/link';
import { httpsCallable } from 'firebase/functions';
import { initFirebase } from '@junglapp/firebase';

const { functions } = initFirebase();

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const sendTempPassword = httpsCallable(functions, 'sendTempPassword');
      await sendTempPassword({ email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la solicitud. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        {sent ? (
          <div className="text-center">
            <div className="text-6xl mb-4">📬</div>
            <h1 className="text-2xl font-bold text-gray-800">¡Contraseña temporal enviada!</h1>
            <p className="text-gray-500 mt-3">
              Enviamos una contraseña temporal a{' '}
              <span className="font-semibold text-gray-700">{email.trim()}</span>
            </p>
            <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 mt-5 text-left">
              <p className="text-primary-700 text-sm leading-relaxed">
                1️⃣ Abre el correo y copia la contraseña temporal<br />
                2️⃣ Inicia sesión con esa contraseña<br />
                3️⃣ Te pediremos crear una nueva contraseña segura
              </p>
            </div>
            <p className="text-gray-400 text-xs mt-3">Revisa también tu carpeta de spam.</p>
            <Link
              href="/acceso"
              className="inline-block mt-6 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl py-3 px-8 transition active:scale-[0.97]"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-primary-700">🔑 Recuperar contraseña</h1>
              <p className="text-gray-500 mt-2">
                Ingresa tu correo registrado y te enviaremos una contraseña temporal.
              </p>
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

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl py-3 transition active:scale-[0.97] disabled:opacity-70"
              >
                {loading ? 'Enviando contraseña temporal...' : 'Enviar contraseña temporal'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link href="/acceso" className="text-sm text-gray-500 hover:text-gray-700 transition">
                ¿Recordaste tu contraseña? Iniciar sesión
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
