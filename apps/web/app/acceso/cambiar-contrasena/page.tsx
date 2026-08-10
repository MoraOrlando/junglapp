'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Blocks direct access without a session, same as the mobile screen.
  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace('/acceso');
  }, [firebaseUser, authLoading, router]);

  const requirements = [
    { label: 'Mínimo 8 caracteres', ok: newPassword.length >= 8 },
    { label: 'Al menos una mayúscula', ok: /[A-Z]/.test(newPassword) },
    { label: 'Al menos un número', ok: /\d/.test(newPassword) },
  ];
  const allOk = requirements.every((r) => r.ok);
  const mustChange = !!(user as any)?.mustChangePassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!allOk) { setError('Tu nueva contraseña no cumple los requisitos mínimos.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas ingresadas no son iguales.'); return; }
    if (!firebaseUser || !user) return;

    setLoading(true);
    try {
      await updatePassword(firebaseUser, newPassword);
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
        mustChangePassword: false,
        passwordChangedAt: new Date().toISOString(),
      });
      // Full reload (not router.replace) so AuthContext re-reads the
      // Firestore profile with mustChangePassword already false — otherwise
      // the stale in-memory `user` would bounce straight back to this page.
      if (user.role === 'owner') window.location.href = '/owner';
      else if (user.role === 'store') window.location.href = '/store';
      else if (user.role === 'support') window.location.href = '/dashboard';
      else window.location.href = '/acceso';
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setError('Por seguridad, debes iniciar sesión nuevamente para cambiar tu contraseña.');
        setTimeout(() => router.replace('/acceso'), 2000);
      } else {
        setError(err.message || 'No se pudo actualizar la contraseña.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        {!mustChange && (
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
            ← Cancelar
          </button>
        )}

        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Crea tu nueva contraseña</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Por tu seguridad, debes crear una nueva contraseña para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value.replace(/\s/g, ''))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ''))}
              className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                confirmPassword && confirmPassword !== newPassword ? 'border-red-400' : 'border-gray-200'
              }`}
              placeholder="••••••••"
              required
            />
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-700 mb-2">Requisitos:</p>
            {requirements.map((req) => (
              <div key={req.label} className="flex items-center gap-2 text-sm mb-1">
                <span>{req.ok ? '✅' : '⭕'}</span>
                <span className={req.ok ? 'text-green-600' : 'text-gray-500'}>{req.label}</span>
              </div>
            ))}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !allOk || newPassword !== confirmPassword}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-xl py-3 transition active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
