'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { LostPet } from '@junglapp/types';

const { db } = initFirebase();

export default function LostPetsPage() {
  const [lostPets, setLostPets] = useState<LostPet[]>([]);
  const [showFound, setShowFound] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const snap = await getDocs(collection(db, COLLECTIONS.LOST_PETS));
    setLostPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LostPet)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markFound(lp: LostPet) {
    await updateDoc(doc(db, COLLECTIONS.LOST_PETS, lp.id), { isFound: true });
    setLostPets((prev) => prev.map((p) => p.id === lp.id ? { ...p, isFound: true } : p));
  }

  const filtered = lostPets.filter((lp) => showFound ? true : !lp.isFound);

  // Group by region for summary
  const byRegion: Record<string, number> = {};
  lostPets.filter((lp) => !lp.isFound).forEach((lp) => {
    byRegion[lp.region] = (byRegion[lp.region] || 0) + 1;
  });

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Mascotas Extraviadas 🔍</h1>
      <p className="text-gray-500 mb-6">Monitorea las mascotas perdidas por región</p>

      {/* Region summary */}
      <div className="flex flex-wrap gap-3 mb-6">
        {Object.entries(byRegion).map(([region, count]) => (
          <div key={region} className="bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            <span className="text-red-600 font-semibold text-sm">{region}: {count}</span>
          </div>
        ))}
        {Object.keys(byRegion).length === 0 && (
          <p className="text-gray-400 text-sm">No hay mascotas extraviadas activas 🎉</p>
        )}
      </div>

      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={showFound} onChange={(e) => setShowFound(e.target.checked)} />
        <span className="text-sm text-gray-600">Mostrar también las encontradas</span>
      </label>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lp) => (
            <div key={lp.id} className={`bg-white rounded-2xl p-5 shadow-sm border ${lp.isFound ? 'border-green-200 opacity-70' : 'border-red-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-3xl">🐾</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${lp.isFound ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {lp.isFound ? '✅ Encontrada' : '🔍 Extraviada'}
                </span>
              </div>
              <h3 className="font-bold text-gray-800">{lp.region} — {lp.state}</h3>
              <p className="text-gray-600 text-sm mt-1">{lp.description}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-400">
                <p>📍 Última vez visto: {lp.lastSeenLocation}</p>
                <p>📅 {lp.lastSeenDate}</p>
                <p>📞 {lp.contactPhone}</p>
              </div>
              {!lp.isFound && (
                <button onClick={() => markFound(lp)}
                  className="w-full mt-3 bg-green-50 text-green-600 border border-green-200 rounded-xl py-2 text-sm font-medium">
                  Marcar como encontrada
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 col-span-3 text-center py-8">No hay registros</p>}
        </div>
      )}
    </div>
  );
}
