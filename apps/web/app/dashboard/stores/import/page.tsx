'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import * as XLSX from 'xlsx';
import type { Store } from '@junglapp/types';

const { db } = initFirebase();

const CATEGORIES = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud', 'Ropa', 'Transporte', 'Camas'];

interface ProductRow {
  row: number;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  error?: string;
}

function validateRow(raw: Record<string, any>, index: number): ProductRow {
  const nombre = String(raw['nombre'] ?? raw['Nombre'] ?? '').trim();
  const descripcion = String(raw['descripcion'] ?? raw['Descripción'] ?? raw['Descripcion'] ?? '').trim();
  const precioRaw = raw['precio'] ?? raw['Precio'] ?? raw['precio (CLP)'] ?? '';
  const stockRaw = raw['stock'] ?? raw['Stock'] ?? '';
  const categoriaRaw = String(raw['categoria'] ?? raw['Categoría'] ?? raw['Categoria'] ?? '').trim();

  const precio = Number(String(precioRaw).replace(/[^0-9.]/g, ''));
  const stock = Number(String(stockRaw).replace(/[^0-9]/g, ''));

  const errors: string[] = [];
  if (!nombre) errors.push('nombre vacío');
  if (!precio || isNaN(precio) || precio <= 0) errors.push('precio inválido');
  if (isNaN(stock) || stock < 0) errors.push('stock inválido');

  const categoriaMatch = CATEGORIES.find((c) => c.toLowerCase() === categoriaRaw.toLowerCase());

  return {
    row: index + 2,
    nombre,
    descripcion,
    precio: isNaN(precio) ? 0 : precio,
    stock: isNaN(stock) ? 0 : stock,
    categoria: categoriaMatch ?? 'Alimentos',
    error: errors.length ? errors.join(', ') : undefined,
  };
}

export default function ImportProductsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getDocs(collection(db, COLLECTIONS.STORES)).then((snap) => {
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Store)));
    });
  }, []);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['nombre', 'descripcion', 'precio', 'stock', 'categoria'],
      ['Croquetas Premium 10kg', 'Alimento balanceado para perros adultos', 25000, 50, 'Alimentos'],
      ['Pelota de goma', 'Juguete resistente para perros', 4990, 100, 'Juguetes'],
      ['Correa retráctil 5m', 'Correa extensible hasta 5 metros', 12990, 30, 'Accesorios'],
    ]);
    ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'plantilla_productos.xlsx');
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      if (!data) return;
      const wb = XLSX.read(data, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (raw.length === 0) { alert('El archivo no tiene filas de datos.'); return; }
      setRows(raw.map((r, i) => validateRow(r, i)));
      setDone(false);
      setProgress(0);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  async function startImport() {
    if (!selectedStoreId) { alert('Selecciona una tienda antes de importar.'); return; }
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) { alert('No hay productos válidos para importar.'); return; }

    const store = stores.find((s) => s.id === selectedStoreId)!;
    setImporting(true);
    setProgress(0);

    let saved = 0;
    for (const row of valid) {
      try {
        await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
          storeId: selectedStoreId,
          userId: store.userId,
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
        setProgress(Math.round((saved / valid.length) * 100));
      } catch {
        // continue on individual row failure
      }
    }

    setImporting(false);
    setDone(true);
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.filter((r) => !!r.error).length;
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition text-sm">
          ← Volver
        </button>
      </div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Importar Productos 📊</h1>
      <p className="text-gray-500 mb-8">Carga productos en masa desde un archivo Excel (.xlsx)</p>

      {/* Paso 1: Plantilla */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-4">
        <h2 className="font-bold text-gray-800 text-lg mb-1">1 — Descarga la plantilla</h2>
        <p className="text-gray-500 text-sm mb-4">
          Completa las columnas: <strong>nombre, descripcion, precio, stock, categoria</strong>.<br />
          Categorías válidas: {CATEGORIES.join(', ')}.
        </p>
        <button
          onClick={downloadTemplate}
          className="bg-amber-50 border border-amber-200 text-amber-800 font-semibold px-5 py-2.5 rounded-xl hover:bg-amber-100 transition text-sm"
        >
          📥 Descargar plantilla Excel
        </button>
      </div>

      {/* Paso 2: Seleccionar tienda */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-4">
        <h2 className="font-bold text-gray-800 text-lg mb-1">2 — Selecciona la tienda</h2>
        <p className="text-gray-500 text-sm mb-4">Los productos se importarán al catálogo de esta tienda.</p>
        <select
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">— Seleccionar tienda —</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
          ))}
        </select>
        {selectedStore && (
          <p className="text-xs text-gray-400 mt-2">📧 {selectedStore.email} · {selectedStore.address}</p>
        )}
      </div>

      {/* Paso 3: Subir archivo */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-4">
        <h2 className="font-bold text-gray-800 text-lg mb-1">3 — Sube el archivo</h2>
        <p className="text-gray-500 text-sm mb-4">Selecciona el archivo .xlsx con tus productos.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={onFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-gray-800 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-700 transition text-sm"
        >
          📂 Elegir archivo .xlsx
        </button>
      </div>

      {/* Vista previa */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 text-lg">Vista previa — {rows.length} filas</h2>
            <div className="flex gap-2">
              {validCount > 0 && (
                <span className="bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                  ✓ {validCount} ok
                </span>
              )}
              {errorCount > 0 && (
                <span className="bg-red-50 text-red-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                  ✕ {errorCount} con error
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
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
                {rows.map((row) => (
                  <tr key={row.row} className={`border-b border-gray-50 ${row.error ? 'bg-red-50' : ''}`}>
                    <td className="py-2 text-gray-400">{row.row}</td>
                    <td className="py-2 font-medium text-gray-800 max-w-[180px] truncate">{row.nombre || '—'}</td>
                    <td className="py-2 text-gray-600">${row.precio.toLocaleString()}</td>
                    <td className="py-2 text-gray-600">{row.stock}</td>
                    <td className="py-2 text-gray-600">{row.categoria}</td>
                    <td className="py-2">
                      {row.error
                        ? <span className="text-red-500 text-xs">⚠️ {row.error}</span>
                        : <span className="text-green-600 text-xs font-medium">✓ ok</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paso 4: Importar */}
      {rows.length > 0 && !done && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-4">
          <h2 className="font-bold text-gray-800 text-lg mb-2">4 — Importar al catálogo</h2>
          {errorCount > 0 && (
            <p className="text-amber-600 text-sm mb-4">
              Las {errorCount} fila(s) con errores serán omitidas. Se importarán {validCount} productos válidos.
            </p>
          )}

          {importing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Importando...</span>
                <span className="font-bold text-amber-600">{progress}%</span>
              </div>
              <div className="w-full bg-amber-50 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Producto {Math.ceil(progress * validCount / 100)} de {validCount}…
              </p>
            </div>
          ) : (
            <button
              onClick={startImport}
              disabled={!selectedStoreId}
              className="bg-green-700 text-white font-bold px-6 py-3 rounded-xl hover:bg-green-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🚀 Importar {validCount} producto{validCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="font-bold text-green-800 text-lg">Importación completa</p>
          <p className="text-green-700 text-sm mt-1">
            Se importaron {rows.filter((r) => !r.error).length} productos a <strong>{selectedStore?.name}</strong>.
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => { setRows([]); setDone(false); setProgress(0); }}
              className="border border-green-300 text-green-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-100 transition"
            >
              Importar otro archivo
            </button>
            <button
              onClick={() => router.push('/dashboard/stores')}
              className="bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-800 transition"
            >
              Ver tiendas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
