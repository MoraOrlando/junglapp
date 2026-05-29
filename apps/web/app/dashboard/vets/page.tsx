'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

export default function VetsPage() {
  const [vets, setVets] = useState<Veterinarian[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);

  async function load() {
    const snap = await getDocs(collection(db, COLLECTIONS.VETERINARIANS));
    setVets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Veterinarian)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(vet: Veterinarian, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vet.id), { status });
    setVets((prev) => prev.map((v) => v.id === vet.id ? { ...v, status } : v));
  }

  const filtered = filter === 'all' ? vets : vets.filter((v) => v.status === filter);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Veterinarios 🩺</h1>
      <p className="text-gray-500 mb-6">Valida y gestiona los veterinarios</p>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobados' : f === 'rejected' ? 'Rechazados' : 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((vet) => (
            <div key={vet.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
                    <span className="text-2xl">🩺</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">Dr. {vet.name}</h3>
                    <p className="text-gray-500 text-sm">{vet.email}</p>
                    <p className="text-gray-400 text-xs">RUT: {vet.rut}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  vet.status === 'approved' ? 'bg-green-100 text-green-700' :
                  vet.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                }`}>
                  {vet.status === 'approved' ? 'Aprobado' : vet.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <p>📋 Registro: {vet.licenseNumber}</p>
                <p>📍 {vet.address}</p>
                <p>📞 {vet.phone}</p>
                <p>💰 Consulta: ${vet.consultationFee?.toLocaleString()}</p>
              </div>

              {vet.credentialUrl && (
                <a href={vet.credentialUrl} target="_blank" rel="noreferrer"
                  className="inline-block mt-3 text-blue-500 text-sm hover:underline">
                  📄 Ver credencial profesional
                </a>
              )}

              {vet.status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStatus(vet, 'approved')}
                    className="flex-1 bg-primary-500 text-white rounded-xl py-2 text-sm font-medium">
                    ✅ Aprobar
                  </button>
                  <button onClick={() => setStatus(vet, 'rejected')}
                    className="flex-1 bg-red-50 text-red-500 rounded-xl py-2 text-sm font-medium border border-red-200">
                    ✕ Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 col-span-2 text-center py-8">No hay veterinarios en esta categoría</p>}
        </div>
      )}
    </div>
  );
}
