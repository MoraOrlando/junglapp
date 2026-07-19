'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Store } from '@junglapp/types';

const { db } = initFirebase();

export default function StoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);

  async function load() {
    const snap = await getDocs(collection(db, COLLECTIONS.STORES));
    setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Store)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setStatus(store: Store, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, COLLECTIONS.STORES, store.id), { status });
    setStores((prev) => prev.map((s) => s.id === store.id ? { ...s, status } : s));
  }

  const filtered = filter === 'all' ? stores : stores.filter((s) => s.status === filter);

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-3xl font-bold text-gray-800">Tiendas 🏪</h1>
        <button
          onClick={() => router.push('/dashboard/stores/import')}
          className="bg-amber-50 border border-amber-200 text-amber-800 font-semibold px-4 py-2 rounded-xl hover:bg-amber-100 transition active:scale-[0.97] text-sm"
        >
          📊 Importar productos Excel
        </button>
      </div>
      <p className="text-gray-500 mb-6">Valida y gestiona las tiendas</p>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-[0.97] ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            {f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobadas' : f === 'rejected' ? 'Rechazadas' : 'Todas'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((store) => (
            <div key={store.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
                    <span className="text-2xl">🏪</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800">{store.name}</h3>
                    <p className="text-gray-500 text-sm">{store.email}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  store.status === 'approved' ? 'bg-green-100 text-green-700' :
                  store.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                }`}>
                  {store.status === 'approved' ? 'Aprobada' : store.status === 'pending' ? 'Pendiente' : 'Rechazada'}
                </span>
              </div>

              <p className="text-gray-600 text-sm mt-3">{store.description}</p>
              <div className="mt-2 space-y-1 text-sm text-gray-500">
                <p>📍 {store.address}</p>
                <p>📞 {store.phone}</p>
              </div>

              {store.status === 'pending' && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStatus(store, 'approved')}
                    className="flex-1 bg-primary-500 text-white rounded-xl py-2 text-sm font-medium">
                    ✅ Aprobar
                  </button>
                  <button onClick={() => setStatus(store, 'rejected')}
                    className="flex-1 bg-red-50 text-red-500 rounded-xl py-2 text-sm font-medium border border-red-200">
                    ✕ Rechazar
                  </button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 col-span-2 text-center py-8">No hay tiendas en esta categoría</p>}
        </div>
      )}
    </div>
  );
}
