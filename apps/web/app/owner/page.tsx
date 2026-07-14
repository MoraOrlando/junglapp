'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();

interface Pet { id: string; name: string; species: string; breed: string; birthDate?: string; }
interface Appointment { id: string; date: string; vetName?: string; reason?: string; status: string; }

export default function OwnerPortalPage() {
  const router = useRouter();
  const { user, loading, logOut } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/acceso');
    if (!loading && user && user.role !== 'owner') router.replace('/acceso');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      // Fetched independently: an error in one query (e.g. a missing Firestore
      // index for appointments) must not blank out the other's results.
      try {
        const petsSnap = await getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user!.uid)));
        setPets(petsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
      } catch {}
      try {
        // Filtering by status !== 'cancelled' in Firestore needs a composite
        // index; filter client-side instead, matching the mobile app.
        const aptsSnap = await getDocs(query(collection(db, COLLECTIONS.APPOINTMENTS), where('ownerId', '==', user!.uid)));
        setAppointments(
          aptsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Appointment))
            .filter((a) => a.status !== 'cancelled')
            .sort((a, b) => (b.date > a.date ? 1 : -1))
            .slice(0, 5)
        );
      } catch {}
      setDataLoading(false);
    }
    load();
  }, [user]);

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Cargando...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-primary-700 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐾</span>
          <span className="font-bold">JunglApp</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">Hola, {user.name || user.email}</span>
          <button
            onClick={() => logOut().then(() => router.replace('/acceso'))}
            className="text-sm bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full transition"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi perfil</h1>
          <div className="mt-4 bg-white rounded-2xl p-6 shadow-sm grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Nombre</p>
              <p className="font-semibold text-gray-800 mt-0.5">{user.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Correo</p>
              <p className="font-semibold text-gray-800 mt-0.5">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Ciudad</p>
              <p className="font-semibold text-gray-800 mt-0.5">{user.city || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Región</p>
              <p className="font-semibold text-gray-800 mt-0.5">{user.region || '—'}</p>
            </div>
          </div>
        </div>

        {/* Pets */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Mis mascotas</h2>
          {dataLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : pets.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl">🐶</span>
              <p className="text-gray-500 mt-3">No tienes mascotas registradas aún.</p>
              <p className="text-gray-400 text-sm mt-1">Usa la app móvil para agregar tus mascotas.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {pets.map((pet) => (
                <div key={pet.id} className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-3">
                    <span className="text-2xl">{pet.species === 'cat' ? '🐱' : '🐶'}</span>
                  </div>
                  <p className="font-bold text-gray-900">{pet.name}</p>
                  <p className="text-gray-500 text-sm">{pet.breed || pet.species}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent appointments */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Últimas citas</h2>
          {dataLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : appointments.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl">🩺</span>
              <p className="text-gray-500 mt-3">No tienes citas registradas.</p>
              <p className="text-gray-400 text-sm mt-1">Agenda en la app móvil.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((apt) => {
                const statusColor = apt.status === 'confirmed' ? 'text-green-600 bg-green-50' : apt.status === 'pending' ? 'text-yellow-600 bg-yellow-50' : 'text-gray-500 bg-gray-100';
                const statusLabel = apt.status === 'confirmed' ? 'Confirmada' : apt.status === 'pending' ? 'Pendiente' : apt.status;
                return (
                  <div key={apt.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{apt.vetName || 'Veterinario'}</p>
                      <p className="text-gray-400 text-sm">{apt.date ? new Date(apt.date).toLocaleDateString('es-CL') : '—'}</p>
                      {apt.reason && <p className="text-gray-500 text-sm">{apt.reason}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Download CTA */}
        <div className="bg-primary-500 rounded-2xl p-6 text-white text-center">
          <p className="font-bold text-lg">¿Quieres acceder a todas las funciones?</p>
          <p className="text-white/80 text-sm mt-1 mb-4">Descarga JunglApp en tu iPhone para una experiencia completa.</p>
          <a
            href="https://apps.apple.com/cl/app/junglapp/id6780333739"
            target="_blank"
            rel="noreferrer"
            className="inline-block bg-white text-primary-700 font-bold px-6 py-3 rounded-xl hover:bg-gray-50 transition"
          >
            🍎 Descargar en App Store
          </a>
        </div>
      </main>
    </div>
  );
}
