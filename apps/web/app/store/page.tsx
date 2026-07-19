'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { ProductRow, parseProductWorkbook, downloadProductTemplate } from '../../lib/productImport';

const { db } = initFirebase();

interface Product { id: string; name: string; price: number; stock?: number; category?: string; }

interface OrderItem { productId: string; productName: string; quantity: number; price: number; }
interface Order {
  id: string;
  createdAt: string;
  total: number;
  status: string;
  buyerName?: string;
  buyerPhone?: string;
  shippingAddress?: string;
  products?: OrderItem[];
  type?: string;
  service?: { serviceName: string; note?: string };
  alternativeMessage?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  alternative_offered: 'Alternativa enviada',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-600 bg-yellow-50',
  confirmed: 'text-blue-600 bg-blue-50',
  shipped: 'text-purple-600 bg-purple-50',
  delivered: 'text-green-600 bg-green-50',
  cancelled: 'text-gray-500 bg-gray-100',
  alternative_offered: 'text-yellow-600 bg-yellow-50',
};

export default function StorePortalPage() {
  const router = useRouter();
  const { user, loading, logOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importDone, setImportDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/acceso');
    if (!loading && user && user.role !== 'store') router.replace('/acceso');
  }, [user, loading, router]);

  async function loadStoreData(sid: string) {
    const [productsSnap, ordersSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', sid))),
      getDocs(query(collection(db, COLLECTIONS.ORDERS), where('storeId', '==', sid))),
    ]);
    setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    setOrders(
      ordersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
        .slice(0, 20)
    );
  }

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const storeSnap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user!.uid)));
        if (!storeSnap.empty) {
          const sid = storeSnap.docs[0].id;
          setStoreId(sid);
          await loadStoreData(sid);
        }
      } catch {}
      setDataLoading(false);
    }
    load();
  }, [user]);

  async function setOrderStatus(order: Order, status: string) {
    setUpdatingOrderId(order.id);
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), { status });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      if (!data) return;
      const parsed = parseProductWorkbook(data as string);
      if (parsed.length === 0) { alert('El archivo no tiene filas de datos.'); return; }
      setImportRows(parsed);
      setImportDone(false);
      setImportProgress(0);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  async function startImport() {
    if (!storeId || !user) return;
    const valid = importRows.filter((r) => !r.error);
    if (valid.length === 0) { alert('No hay productos válidos para importar.'); return; }

    setImporting(true);
    setImportProgress(0);
    let saved = 0;
    for (const row of valid) {
      try {
        await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
          storeId,
          userId: user.uid,
          name: row.nombre,
          description: row.descripcion,
          price: row.precio,
          stock: row.stock,
          category: row.categoria,
          photos: [],
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        saved++;
        setImportProgress(Math.round((saved / valid.length) * 100));
      } catch {
        // continue on individual row failure
      }
    }
    setImporting(false);
    setImportDone(true);
    await loadStoreData(storeId);
  }

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Cargando...</p></div>;

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const validImportCount = importRows.filter((r) => !r.error).length;
  const errorImportCount = importRows.filter((r) => !!r.error).length;

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
            className="text-sm bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full transition active:scale-[0.97]"
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Mis productos</h2>
            <div className="flex gap-2">
              <button
                onClick={downloadProductTemplate}
                className="text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full hover:bg-amber-100 transition"
              >
                📥 Plantilla Excel
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFileChange} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold bg-gray-800 text-white px-3 py-1.5 rounded-full hover:bg-gray-700 transition"
              >
                📂 Cargar Excel
              </button>
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-800">Vista previa — {importRows.length} filas</p>
                <div className="flex gap-2">
                  {validImportCount > 0 && <span className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">✓ {validImportCount} ok</span>}
                  {errorImportCount > 0 && <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">✕ {errorImportCount} con error</span>}
                </div>
              </div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-2 font-medium">Fila</th>
                      <th className="pb-2 font-medium">Nombre</th>
                      <th className="pb-2 font-medium">Precio</th>
                      <th className="pb-2 font-medium">Stock</th>
                      <th className="pb-2 font-medium">Categoría</th>
                      <th className="pb-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr key={row.row} className={`border-b border-gray-50 ${row.error ? 'bg-red-50' : ''}`}>
                        <td className="py-2 text-gray-400">{row.row}</td>
                        <td className="py-2 font-medium text-gray-800 max-w-[180px] truncate">{row.nombre || '—'}</td>
                        <td className="py-2 text-gray-600">${row.precio.toLocaleString()}</td>
                        <td className="py-2 text-gray-600">{row.stock}</td>
                        <td className="py-2 text-gray-600">{row.categoria}</td>
                        <td className="py-2">
                          {row.error ? <span className="text-red-500 text-xs">⚠️ {row.error}</span> : <span className="text-green-600 text-xs font-medium">✓ ok</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importDone ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="font-semibold text-green-800">✅ Se importaron {validImportCount} productos.</p>
                  <button
                    onClick={() => { setImportRows([]); setImportDone(false); setImportProgress(0); }}
                    className="mt-2 text-sm text-green-700 underline"
                  >
                    Cerrar
                  </button>
                </div>
              ) : importing ? (
                <div className="space-y-2">
                  <div className="w-full bg-amber-50 rounded-full h-2">
                    <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${importProgress}%` }} />
                  </div>
                  <p className="text-xs text-gray-400">Importando... {importProgress}%</p>
                </div>
              ) : (
                <button
                  onClick={startImport}
                  disabled={validImportCount === 0}
                  className="bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-green-800 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                >
                  🚀 Importar {validImportCount} producto{validImportCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {dataLoading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <span className="text-4xl">📦</span>
              <p className="text-gray-500 mt-3">No tienes productos publicados.</p>
              <p className="text-gray-400 text-sm mt-1">Agrégalos desde la app móvil o cargando un Excel arriba.</p>
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
            <div className="space-y-3">
              {orders.map((o) => {
                const isExpanded = expandedOrderId === o.id;
                const isUpdating = updatingOrderId === o.id;
                return (
                  <div key={o.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{o.buyerName || 'Cliente'}</p>
                        <p className="text-gray-400 text-xs">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('es-CL') : '—'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">${o.total?.toLocaleString('es-CL')}</span>
                        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_COLOR[o.status] || 'text-gray-500 bg-gray-100'}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                        <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-3">
                        {(o.buyerPhone || o.shippingAddress) && (
                          <div className="bg-gray-50 rounded-xl p-3 text-sm">
                            <p className="font-semibold text-gray-700 mb-1">👤 Cliente</p>
                            {o.buyerPhone && <p className="text-gray-600">📞 {o.buyerPhone}</p>}
                            {o.shippingAddress && <p className="text-gray-600">📍 {o.shippingAddress}</p>}
                          </div>
                        )}

                        <div className="text-sm">
                          <p className="font-semibold text-gray-700 mb-1">
                            {o.type === 'service' ? '🔧 Servicio' : '📦 Productos'}
                          </p>
                          {o.type === 'service' && o.service ? (
                            <div>
                              <p className="text-gray-700">{o.service.serviceName}</p>
                              {o.service.note && <p className="text-gray-500 text-xs">{o.service.note}</p>}
                            </div>
                          ) : (
                            (o.products || []).map((item, i) => (
                              <div key={i} className="flex justify-between text-gray-600">
                                <span>{item.quantity}x {item.productName}</span>
                                <span>${(item.price * item.quantity).toLocaleString('es-CL')}</span>
                              </div>
                            ))
                          )}
                        </div>

                        {o.alternativeMessage && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                            <p className="font-semibold text-amber-700">Alternativa ofrecida:</p>
                            <p className="text-gray-700">{o.alternativeMessage}</p>
                          </div>
                        )}

                        {o.status === 'pending' && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => setOrderStatus(o, 'confirmed')}
                              disabled={isUpdating}
                              className="flex-1 bg-green-50 text-green-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-green-100 transition disabled:opacity-50"
                            >
                              ✅ Confirmar
                            </button>
                            <button
                              onClick={() => setOrderStatus(o, 'cancelled')}
                              disabled={isUpdating}
                              className="flex-1 bg-red-50 text-red-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-red-100 transition disabled:opacity-50"
                            >
                              ❌ Rechazar
                            </button>
                          </div>
                        )}
                        {o.status === 'confirmed' && (
                          <button
                            onClick={() => setOrderStatus(o, 'shipped')}
                            disabled={isUpdating}
                            className="w-full bg-blue-50 text-blue-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-100 transition disabled:opacity-50"
                          >
                            🚚 Marcar como despachado
                          </button>
                        )}
                        {o.status === 'shipped' && (
                          <button
                            onClick={() => setOrderStatus(o, 'delivered')}
                            disabled={isUpdating}
                            className="w-full bg-green-50 text-green-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-green-100 transition disabled:opacity-50"
                          >
                            🎉 Marcar como entregado
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
