'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();

interface Product { id: string; name: string; price: number; stock?: number; category?: string; }
interface Order { id: string; createdAt: string; total: number; status: string; }

export default function StorePortalPage() {
  const router = useRouter();
  const { user, loading, logOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/acceso');
    if (!loading && user && user.role !== 'store') router.replace('/acceso');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const storeSnap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user!.uid)));
        if (!storeSnap.empty) {
          const sid = storeSnap.docs[0].id;
          setStoreId(sid);
          const [productsSnap, ordersSnap] = await Promise.all([
            getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', sid))),
            getDocs(query(collection(db, COLLECTIONS.ORDERS), where('storeId', '==', sid))),
          ]);
          setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
          setOrders(
            ordersSnap.docs
              .map((d) => ({ id: d.id, ...d.data() } as Order))
              .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
              .slice(0, 10)
          );
        }
      } catch {}
      setDataLoading(false);
    }
    load();
  }, [user]);

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Cargando...</p></div>;

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-primary-700 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <span className="font-bold">JunglApp — Tienda</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/80">{user.name || user.email}</span>
          <button
            onClick={() => logOut().then(() => router.replace('/acceso'))}
            className="text-sm bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full transition"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Productos', value: products.length, icon: '📦' },
            { label: 'Pedidos totales', value: orders.length, icon: '🧾' },
            { label: 'Pedidos pendientes', value: pendingOrders, icon: '⏳' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <span className="text-3xl">{s.icon}</span>
              <p className="text-3xl font-extrabold text-primary-700 mt-2">{dataLoading ? '—' : s.value}</p>
              <p className="text-gray-500 text-sm">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Products */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Mis productos</h2>
          {dataLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl">📦</span>
              <p className="text-gray-500 mt-3">No tienes productos publicados.</p>
              <p className="text-gray-400 text-sm mt-1">Agrega productos desde la app móvil.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Producto</th>
                    <th className="px-5 py-3 text-left">Categoría</th>
                    <th className="px-5 py-3 text-right">Precio</th>
                    <th className="px-5 py-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3 text-gray-500">{p.category || '—'}</td>
                      <td className="px-5 py-3 text-right text-gray-900">${p.price?.toLocaleString('es-CL')}</td>
                      <td className="px-5 py-3 text-right text-gray-500">{p.stock ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pedidos recientes</h2>
          {dataLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl">🧾</span>
              <p className="text-gray-500 mt-3">No tienes pedidos todavía.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">ID</th>
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => {
                    const statusColor = o.status === 'delivered' ? 'text-green-600 bg-green-50' : o.status === 'pending' ? 'text-yellow-600 bg-yellow-50' : 'text-gray-500 bg-gray-100';
                    const statusLabel = o.status === 'delivered' ? 'Entregado' : o.status === 'pending' ? 'Pendiente' : o.status === 'cancelled' ? 'Cancelado' : o.status;
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{o.id.slice(0, 8)}…</td>
                        <td className="px-5 py-3 text-gray-600">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CL') : '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900">${o.total?.toLocaleString('es-CL')}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
