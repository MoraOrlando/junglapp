'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Product } from '@junglapp/types';

const { db } = initFirebase();

interface PromoProduct extends Product {
  storeName: string;
}

export default function PromotionsPage() {
  const [products, setProducts] = useState<PromoProduct[]>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.PRODUCTS), where('promotionStatus', 'in', ['pending', 'approved', 'rejected']))
      );
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      const storeIds = [...new Set(raw.map((p) => p.storeId))];
      const storeNameById = new Map<string, string>();
      await Promise.all(
        storeIds.map(async (sid) => {
          const sDoc = await getDoc(doc(db, COLLECTIONS.STORES, sid));
          if (sDoc.exists()) storeNameById.set(sid, (sDoc.data() as any).name ?? 'Tienda');
        })
      );
      setProducts(raw.map((p) => ({ ...p, storeName: storeNameById.get(p.storeId) ?? 'Tienda' })));
    } catch (e: any) {
      console.error('Error cargando promociones:', e);
      setError(e?.message ?? 'Error al cargar promociones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function setStatus(product: Product, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { promotionStatus: status });
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, promotionStatus: status } : p)));
  }

  const filtered = filter === 'all' ? products : products.filter((p) => p.promotionStatus === filter);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Promociones 🎉</h1>
      <p className="text-gray-500 mb-6">Aprueba o retira productos del banner "Cerca de ti"</p>

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

      {error ? (
        <p className="text-red-500">Error al cargar: {error}</p>
      ) : loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => {
            const discountPct = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
            return (
              <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-primary-50 overflow-hidden flex items-center justify-center shrink-0">
                      {p.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">{p.name}</h3>
                      <p className="text-gray-500 text-sm">{p.storeName}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                    p.promotionStatus === 'approved' ? 'bg-green-100 text-green-700' :
                    p.promotionStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {p.promotionStatus === 'approved' ? 'Aprobada' : p.promotionStatus === 'pending' ? 'Pendiente' : 'Rechazada'}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="font-bold text-primary-700">${p.price.toLocaleString('es-CL')}</span>
                  {p.originalPrice ? <span className="text-gray-400 text-sm line-through">${p.originalPrice.toLocaleString('es-CL')}</span> : null}
                  {discountPct > 0 && <span className="text-xs font-semibold bg-red-50 text-red-600 px-2 py-0.5 rounded-full">-{discountPct}%</span>}
                </div>

                {p.promotionStatus === 'pending' && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setStatus(p, 'approved')}
                      className="flex-1 bg-primary-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-primary-600 transition active:scale-[0.97]"
                    >
                      ✅ Aprobar
                    </button>
                    <button
                      onClick={() => setStatus(p, 'rejected')}
                      className="flex-1 bg-red-50 text-red-500 rounded-xl py-2 text-sm font-medium border border-red-200 hover:bg-red-100 transition active:scale-[0.97]"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                )}
                {p.promotionStatus === 'approved' && (
                  <button
                    onClick={() => setStatus(p, 'rejected')}
                    className="w-full mt-4 bg-red-50 text-red-500 rounded-xl py-2 text-sm font-medium border border-red-200 hover:bg-red-100 transition active:scale-[0.97]"
                  >
                    🚫 Quitar de Cerca de ti
                  </button>
                )}
                {p.promotionStatus === 'rejected' && (
                  <button
                    onClick={() => setStatus(p, 'approved')}
                    className="w-full mt-4 bg-primary-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-primary-600 transition active:scale-[0.97]"
                  >
                    ✅ Aprobar de todos modos
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="text-gray-400 col-span-2 text-center py-8">No hay promociones en esta categoría</p>}
        </div>
      )}
    </div>
  );
}
