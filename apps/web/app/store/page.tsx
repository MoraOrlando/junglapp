'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection, query, where, getDocs, doc, updateDoc, addDoc,
  runTransaction, deleteField, onSnapshot,
} from 'firebase/firestore';
import { ref, onValue, push, set as rtdbSet } from 'firebase/database';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { ProductRow, PRODUCT_CATEGORIES, parseProductWorkbook, downloadProductTemplate } from '../../lib/productImport';
import { generateReceiptPdf } from '../../lib/receipt';

const { db, rtdb } = initFirebase();

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  purchasePrice?: number;
  originalPrice?: number;
  stock?: number;
  category?: string;
  photos?: string[];
  isActive?: boolean;
  lastSoldAt?: string;
}

interface OrderItem { productId: string; productName: string; quantity: number; price: number; }
interface Order {
  id: string;
  createdAt: string;
  total: number;
  status: string;
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  shippingAddress?: string;
  products?: OrderItem[];
  type?: string;
  service?: { serviceName: string; note?: string };
  alternativeMessage?: string;
}

interface PosSale {
  id: string;
  createdAt: string;
  total: number;
  neto?: number;
  iva?: number;
  paymentMethod?: string;
  items: OrderItem[];
}

interface ChatMessage { id: string; senderId: string; senderName: string; text: string; createdAt: string; }
interface ChatSummary {
  id: string;
  buyerId: string;
  buyerName: string;
  orderId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastReadAt?: Record<string, string>;
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

const FORTY_FIVE_DAYS_MS = 45 * 24 * 60 * 60 * 1000;
const TABS = [
  { key: 'resumen', label: 'Resumen', icon: '📊' },
  { key: 'inventario', label: 'Inventario', icon: '📦' },
  { key: 'pedidos', label: 'Pedidos', icon: '🧾' },
  { key: 'carrito', label: 'Carrito', icon: '🛒' },
  { key: 'chat', label: 'Chat', icon: '💬' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inDateRange(iso: string | undefined, start: string, end: string) {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
          <span className="text-xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

function ProductFormModal({
  title, initial, saving, onCancel, onSubmit,
}: {
  title: string;
  initial: { name: string; description: string; category: string; price: string; purchasePrice: string; originalPrice: string; stock: string; photoUrl?: string };
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; description: string; category: string; price: string; purchasePrice: string; originalPrice: string; stock: string; photoFile: File | null }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category || PRODUCT_CATEGORIES[0]);
  const [price, setPrice] = useState(initial.price);
  const [purchasePrice, setPurchasePrice] = useState(initial.purchasePrice);
  const [originalPrice, setOriginalPrice] = useState(initial.originalPrice);
  const [stock, setStock] = useState(initial.stock);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>(initial.photoUrl);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">📦</span>
            )}
          </div>
          <label className="text-xs font-semibold bg-gray-100 text-gray-700 px-3 py-2 rounded-full hover:bg-gray-200 transition active:scale-[0.97] cursor-pointer">
            📷 {preview ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400">
              {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Precio de venta</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Precio de compra (opcional)</label>
              <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Stock</label>
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Precio original (antes del descuento)</label>
            <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-primary-400" />
            <p className="text-xs text-gray-400 mt-1">Solo si el producto está en oferta — se mostrará tachado en la app.</p>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onCancel} disabled={saving} className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-xl hover:bg-gray-200 transition active:scale-[0.97] text-sm disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => onSubmit({ name, description, category, price, purchasePrice, originalPrice, stock, photoFile })}
            disabled={saving || !name || !price}
            className="flex-1 bg-primary-500 text-white font-semibold py-2.5 rounded-xl hover:bg-primary-600 transition active:scale-[0.97] text-sm disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StorePortalPage() {
  const router = useRouter();
  const { user, loading, logOut } = useAuth();
  const [tab, setTab] = useState<Tab>('resumen');

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [posSales, setPosSales] = useState<PosSale[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('JunglApp');
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | undefined>(undefined);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const today = toDateInputValue(new Date());
  const monthStart = toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<ProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importDone, setImportDone] = useState(false);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartSaving, setCartSaving] = useState(false);
  const [cartSearch, setCartSearch] = useState('');
  const [cartCategory, setCartCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/acceso');
    if (!loading && user && user.role !== 'store') router.replace('/acceso');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data() as any;
          if (data.chatType !== 'store') return null;
          const buyerId = (data.participants || []).find((p: string) => p !== user.uid);
          if (!buyerId) return null;
          return {
            id: d.id,
            buyerId,
            buyerName: data.participantNames?.[buyerId] || 'Cliente',
            orderId: data.orderId,
            lastMessage: data.lastMessage,
            lastMessageAt: data.lastMessageAt,
            lastReadAt: data.lastReadAt,
          } as ChatSummary;
        })
        .filter((c): c is ChatSummary => !!c)
        .sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
      setChats(list);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeChatId || !rtdb) { setMessages([]); return; }
    const chatId = activeChatId;
    const messagesRef = ref(rtdb, `messages/${chatId}`);
    const unsub = onValue(messagesRef, (snap) => {
      const val = snap.val() || {};
      const list: ChatMessage[] = Object.entries(val).map(([id, m]) => ({ id, ...(m as any) }));
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setMessages(list);
      // Keep lastReadAt current while this chat stays open, so new incoming
      // messages don't show as unread again after navigating away and back.
      if (list.length > 0 && user) {
        updateDoc(doc(db, COLLECTIONS.CHATS, chatId), { [`lastReadAt.${user.uid}`]: new Date().toISOString() }).catch(() => {});
      }
    });
    return () => unsub();
  }, [activeChatId]);

  async function loadStoreData(sid: string) {
    const [productsSnap, ordersSnap, posSalesSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', sid))),
      getDocs(query(collection(db, COLLECTIONS.ORDERS), where('storeId', '==', sid))),
      getDocs(query(collection(db, COLLECTIONS.POS_SALES), where('storeId', '==', sid))),
    ]);
    setProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    setOrders(
      ordersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    );
    setPosSales(
      posSalesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PosSale))
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    );
  }

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const storeSnap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user!.uid)));
        if (!storeSnap.empty) {
          const sid = storeSnap.docs[0].id;
          const storeData = storeSnap.docs[0].data() as any;
          setStoreId(sid);
          setStoreLogoUrl(storeData.photoUrl);
          if (storeData.name) setStoreName(storeData.name);
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

  async function submitAddProduct(values: { name: string; description: string; category: string; price: string; purchasePrice: string; originalPrice: string; stock: string; photoFile: File | null }) {
    if (!storeId || !user) return;
    setAddSaving(true);
    try {
      let photoUrl: string | undefined;
      if (values.photoFile) {
        photoUrl = await uploadImage(URL.createObjectURL(values.photoFile));
      }
      const price = Number(values.price) || 0;
      const originalPrice = Number(values.originalPrice) || 0;
      await addDoc(collection(db, COLLECTIONS.PRODUCTS), {
        storeId,
        userId: user.uid,
        name: values.name,
        description: values.description,
        category: values.category,
        price,
        ...(values.purchasePrice ? { purchasePrice: Number(values.purchasePrice) } : {}),
        ...(originalPrice > price ? { originalPrice } : {}),
        stock: Number(values.stock) || 0,
        photos: photoUrl ? [photoUrl] : [],
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      setShowAddProduct(false);
      await loadStoreData(storeId);
    } finally {
      setAddSaving(false);
    }
  }

  async function submitEditProduct(values: { name: string; description: string; category: string; price: string; purchasePrice: string; originalPrice: string; stock: string; photoFile: File | null }) {
    if (!storeId || !editingProduct) return;
    setEditSaving(true);
    try {
      let photos = editingProduct.photos;
      if (values.photoFile) {
        const url = await uploadImage(URL.createObjectURL(values.photoFile));
        photos = [url];
      }
      const price = Number(values.price) || 0;
      const originalPrice = Number(values.originalPrice) || 0;
      await updateDoc(doc(db, COLLECTIONS.PRODUCTS, editingProduct.id), {
        price,
        purchasePrice: values.purchasePrice ? Number(values.purchasePrice) : deleteField(),
        originalPrice: originalPrice > price ? originalPrice : deleteField(),
        stock: Number(values.stock) || 0,
        ...(photos ? { photos } : {}),
      });
      setEditingProduct(null);
      await loadStoreData(storeId);
    } finally {
      setEditSaving(false);
    }
  }

  function addToCart(productId: string) {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }
  function changeCartQty(productId: string, delta: number) {
    setCart((prev) => {
      const next = { ...prev };
      const qty = (next[productId] || 0) + delta;
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }

  async function confirmSale() {
    if (!storeId) return;
    const entries = Object.entries(cart);
    if (entries.length === 0) return;
    setCartSaving(true);
    try {
      const now = new Date().toISOString();
      let committedItems: OrderItem[] = [];
      let committedTotal = 0;

      await runTransaction(db, async (tx) => {
        const saleItems: OrderItem[] = [];
        const productRefs = entries.map(([productId]) => doc(db, COLLECTIONS.PRODUCTS, productId));
        const snaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

        snaps.forEach((snap, i) => {
          const [productId, qty] = entries[i];
          if (!snap.exists()) throw new Error('Un producto del carro ya no existe.');
          const data = snap.data() as Product;
          const currentStock = data.stock ?? 0;
          if (currentStock < qty) throw new Error(`Stock insuficiente para ${data.name}.`);
          tx.update(productRefs[i], { stock: currentStock - qty, lastSoldAt: now });
          saleItems.push({ productId, productName: data.name, quantity: qty, price: data.price });
        });

        const total = saleItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
        const neto = total / 1.19;
        const iva = total - neto;
        const saleRef = doc(collection(db, COLLECTIONS.POS_SALES));
        tx.set(saleRef, { storeId, items: saleItems, total, neto, iva, paymentMethod, createdAt: now });
        committedItems = saleItems;
        committedTotal = total;
      });

      setCart({});
      await loadStoreData(storeId);

      try {
        await generateReceiptPdf({
          storeName,
          storeLogoUrl,
          items: committedItems,
          neto: committedTotal / 1.19,
          iva: committedTotal - committedTotal / 1.19,
          total: committedTotal,
          paymentMethod,
          createdAt: now,
        });
      } catch {
        // The sale is already committed at this point — a PDF failure
        // (e.g. logo fetch blocked by CORS) must not look like a failed sale.
      }
    } catch (err: any) {
      alert(err?.message || 'No se pudo confirmar la venta.');
    } finally {
      setCartSaving(false);
    }
  }

  async function openChat(chatId: string) {
    setActiveChatId(chatId);
    if (!user || !rtdb) return;
    await rtdbSet(ref(rtdb, `chatMembers/${chatId}/${user.uid}`), true).catch(() => {});
    await updateDoc(doc(db, COLLECTIONS.CHATS, chatId), { [`lastReadAt.${user.uid}`]: new Date().toISOString() }).catch(() => {});
  }

  async function sendMessage() {
    if (!activeChatId || !user || !rtdb || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const now = new Date().toISOString();
      const text = messageText.trim();
      await push(ref(rtdb, `messages/${activeChatId}`), {
        senderId: user.uid,
        senderName: user.name || 'Tienda',
        text,
        createdAt: now,
      });
      await updateDoc(doc(db, COLLECTIONS.CHATS, activeChatId), {
        lastMessage: text,
        lastMessageAt: now,
        updatedAt: now,
        [`lastReadAt.${user.uid}`]: now,
      });
      setMessageText('');
    } finally {
      setSendingMessage(false);
    }
  }

  async function openChatWithOrder(order: Order) {
    if (!user || !order.buyerId) return;
    const existing = chats.find((c) => c.buyerId === order.buyerId);
    if (existing) {
      setTab('chat');
      openChat(existing.id);
      return;
    }
    const now = new Date().toISOString();
    const newChatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
      participants: [user.uid, order.buyerId],
      participantNames: { [user.uid]: user.name || 'Tienda', [order.buyerId]: order.buyerName || 'Cliente' },
      chatType: 'store',
      orderId: order.id,
      createdAt: now,
      updatedAt: now,
    });
    setTab('chat');
    openChat(newChatRef.id);
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !storeId) return;
    setUploadingLogo(true);
    try {
      const url = await uploadImage(URL.createObjectURL(file));
      await updateDoc(doc(db, COLLECTIONS.STORES, storeId), { photoUrl: url });
      setStoreLogoUrl(url);
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Cargando...</p></div>;

  const activeProducts = products.filter((p) => p.isActive);
  const staleProducts = activeProducts.filter((p) => !p.lastSoldAt || Date.now() - new Date(p.lastSoldAt).getTime() > FORTY_FIVE_DAYS_MS);
  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const ordersInRange = orders.filter((o) => inDateRange(o.createdAt, startDate, endDate));
  const posSalesInRange = posSales.filter((s) => inDateRange(s.createdAt, startDate, endDate));
  const cancelledInRange = ordersInRange.filter((o) => o.status === 'cancelled');
  const amountInRange =
    ordersInRange.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total || 0), 0) +
    posSalesInRange.reduce((sum, s) => sum + (s.total || 0), 0);

  const validImportCount = importRows.filter((r) => !r.error).length;
  const errorImportCount = importRows.filter((r) => !!r.error).length;

  const cartLines = Object.entries(cart).map(([productId, qty]) => {
    const product = products.find((p) => p.id === productId);
    return { productId, qty, product };
  }).filter((l) => l.product);
  const cartTotal = cartLines.reduce((sum, l) => sum + (l.product!.price * l.qty), 0);
  const cartQtyTotal = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const cartNeto = cartTotal / 1.19;
  const cartIva = cartTotal - cartNeto;
  const availableForCart = products
    .filter((p) => p.isActive && (p.stock ?? 0) > 0)
    .filter((p) => !cartCategory || p.category === cartCategory)
    .filter((p) => !cartSearch.trim() || p.name.toLowerCase().includes(cartSearch.trim().toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-primary-700 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/20 transition" title="Cambiar logo de la tienda">
            {uploadingLogo ? (
              <span className="text-xs animate-pulse">...</span>
            ) : storeLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storeLogoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl">🛒</span>
            )}
            <input type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
          </label>
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

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow-sm w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-[0.97] ${
                tab === t.key ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {(tab === 'resumen' || tab === 'pedidos') && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-500">Rango de fechas:</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm" />
            <span className="text-gray-400 text-sm">a</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm" />
          </div>
        )}

        {tab === 'resumen' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Productos activos" value={dataLoading ? '—' : activeProducts.length} icon="📦" color="bg-primary-100" />
            <StatCard label="Activos sin ventas en 45 días" value={dataLoading ? '—' : staleProducts.length} icon="🐌" color="bg-amber-100" />
            <StatCard label="Pedidos pendientes" value={dataLoading ? '—' : pendingOrders.length} icon="⏳" color="bg-yellow-100" />
            <StatCard label="Pedidos totales (rango)" value={dataLoading ? '—' : ordersInRange.length + posSalesInRange.length} icon="🧾" color="bg-blue-100" />
            <StatCard label="Monto vendido (rango)" value={dataLoading ? '—' : `$${amountInRange.toLocaleString('es-CL')}`} icon="💰" color="bg-green-100" />
            <StatCard label="Pedidos cancelados (rango)" value={dataLoading ? '—' : cancelledInRange.length} icon="❌" color="bg-red-100" />
          </div>
        )}

        {tab === 'inventario' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-bold text-gray-900">Inventario</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowAddProduct(true)} className="text-xs font-semibold bg-primary-500 text-white px-3 py-1.5 rounded-full hover:bg-primary-600 transition active:scale-[0.97]">
                  ➕ Agregar producto
                </button>
                <button onClick={downloadProductTemplate} className="text-xs font-semibold bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full hover:bg-amber-100 transition active:scale-[0.97]">
                  📥 Plantilla Excel
                </button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFileChange} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold bg-gray-800 text-white px-3 py-1.5 rounded-full hover:bg-gray-700 transition active:scale-[0.97]">
                  📂 Cargar Excel
                </button>
              </div>
            </div>

            {importRows.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
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
                    <button onClick={() => { setImportRows([]); setImportDone(false); setImportProgress(0); }} className="mt-2 text-sm text-green-700 underline">
                      Cerrar
                    </button>
                  </div>
                ) : importing ? (
                  <div className="space-y-2">
                    <div className="w-full bg-amber-50 rounded-full h-2 overflow-hidden">
                      <div className="bg-amber-500 h-2 rounded-full" style={{ width: '100%', transformOrigin: 'left center', transform: `scaleX(${importProgress / 100})`, transition: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)' }} />
                    </div>
                    <p className="text-xs text-gray-400">Importando... {importProgress}%</p>
                  </div>
                ) : (
                  <button onClick={startImport} disabled={validImportCount === 0} className="bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-green-800 transition active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed text-sm">
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
                <p className="text-gray-400 text-sm mt-1">Agrégalos con el botón de arriba, desde la app móvil, o cargando un Excel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setEditingProduct(p)}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-left hover:shadow-md transition active:scale-[0.97]"
                  >
                    <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {p.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">📦</span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                      <p className="text-gray-500 text-xs">{p.category || '—'}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-primary-700 text-sm">${p.price?.toLocaleString('es-CL')}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${(p.stock ?? 0) > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {p.stock ?? 0} stock
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'pedidos' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Pedidos</h2>
            {dataLoading ? (
              <p className="text-gray-400">Cargando...</p>
            ) : ordersInRange.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <span className="text-4xl">🧾</span>
                <p className="text-gray-500 mt-3">No hay pedidos en este rango de fechas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ordersInRange.map((o) => {
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

                          {o.buyerId && (
                            <button
                              onClick={() => openChatWithOrder(o)}
                              className="w-full bg-primary-50 text-primary-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-primary-100 transition active:scale-[0.97]"
                            >
                              💬 Chatear con el cliente
                            </button>
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
                              <button onClick={() => setOrderStatus(o, 'confirmed')} disabled={isUpdating} className="flex-1 bg-green-50 text-green-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-green-100 transition disabled:opacity-50">
                                ✅ Confirmar
                              </button>
                              <button onClick={() => setOrderStatus(o, 'cancelled')} disabled={isUpdating} className="flex-1 bg-red-50 text-red-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-red-100 transition disabled:opacity-50">
                                ❌ Rechazar
                              </button>
                            </div>
                          )}
                          {o.status === 'confirmed' && (
                            <button onClick={() => setOrderStatus(o, 'shipped')} disabled={isUpdating} className="w-full bg-blue-50 text-blue-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-100 transition disabled:opacity-50">
                              🚚 Marcar como despachado
                            </button>
                          )}
                          {o.status === 'shipped' && (
                            <button onClick={() => setOrderStatus(o, 'delivered')} disabled={isUpdating} className="w-full bg-green-50 text-green-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-green-100 transition disabled:opacity-50">
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
        )}

        {tab === 'carrito' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Venta en tienda física</h2>
              <div className="flex gap-2 mb-4">
                <input
                  value={cartSearch}
                  onChange={(e) => setCartSearch(e.target.value)}
                  placeholder="🔍 Buscar producto por nombre..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
                <select
                  value={cartCategory}
                  onChange={(e) => setCartCategory(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  <option value="">Todas las categorías</option>
                  {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {availableForCart.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                  <span className="text-4xl">📦</span>
                  <p className="text-gray-500 mt-3">
                    {cartSearch || cartCategory ? 'Ningún producto coincide con el filtro.' : 'No hay productos activos con stock disponible.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableForCart.map((p) => (
                    <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl">📦</span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                        <p className="text-primary-700 font-bold text-sm mb-2">${p.price?.toLocaleString('es-CL')}</p>
                        <button onClick={() => addToCart(p.id)} className="w-full bg-primary-500 text-white text-xs font-semibold py-2 rounded-xl hover:bg-primary-600 transition active:scale-[0.97]">
                          ➕ Agregar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">Carro</h2>
              <div className="bg-white rounded-2xl shadow-sm p-4">
                {cartLines.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Carro vacío.</p>
                ) : (
                  <div className="space-y-3">
                    {cartLines.map((l) => (
                      <div key={l.productId} className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{l.product!.name}</p>
                          <p className="text-gray-400 text-xs">${l.product!.price.toLocaleString('es-CL')} c/u</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => changeCartQty(l.productId, -1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 transition active:scale-[0.97] text-gray-600">−</button>
                          <span className="w-5 text-center">{l.qty}</span>
                          <button onClick={() => changeCartQty(l.productId, 1)} className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 transition active:scale-[0.97] text-gray-600">+</button>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Medio de pago</p>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {([
                          { key: 'efectivo', label: '💵 Efectivo' },
                          { key: 'tarjeta', label: '💳 Tarjeta' },
                          { key: 'transferencia', label: '🏦 Transferencia' },
                        ] as const).map((m) => (
                          <button
                            key={m.key}
                            onClick={() => setPaymentMethod(m.key)}
                            className={`text-xs font-semibold py-2 rounded-xl transition active:scale-[0.97] ${
                              paymentMethod === m.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <label className="text-xs font-medium text-gray-500">Correo del cliente (opcional)</label>
                      <input
                        type="email"
                        disabled
                        placeholder="correo@ejemplo.com"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mt-1 bg-gray-50 text-gray-400 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-gray-400 mt-1 mb-3">Enviar copia de la venta por correo — próximamente.</p>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between text-gray-500">
                          <span>Productos</span>
                          <span>{cartQtyTotal}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-500">
                          <span>Valor neto</span>
                          <span>${Math.round(cartNeto).toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex items-center justify-between text-gray-500">
                          <span>IVA (19%)</span>
                          <span>${Math.round(cartIva).toLocaleString('es-CL')}</span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100 mt-1">
                          <span>Total</span>
                          <span>${cartTotal.toLocaleString('es-CL')}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={confirmSale}
                      disabled={cartSaving}
                      className="w-full bg-green-700 text-white font-bold py-2.5 rounded-xl hover:bg-green-800 transition active:scale-[0.97] disabled:opacity-40 text-sm mt-3"
                    >
                      {cartSaving ? 'Generando boleta...' : '🖨️ Confirmar venta'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'chat' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden md:col-span-1">
              <div className="p-4 border-b border-gray-50">
                <h2 className="font-bold text-gray-900">Conversaciones</h2>
              </div>
              {chats.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8 px-4">
                  Todavía no tienes conversaciones. Aparecen acá cuando un cliente te escribe sobre un pedido, o podés iniciar una desde la pestaña Pedidos.
                </p>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
                  {chats.map((c) => {
                    const unread = !!c.lastMessageAt && (!c.lastReadAt?.[user.uid] || c.lastReadAt[user.uid] < c.lastMessageAt);
                    return (
                      <button
                        key={c.id}
                        onClick={() => openChat(c.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${activeChatId === c.id ? 'bg-gray-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900 text-sm truncate">{c.buyerName}</p>
                          {unread && <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />}
                        </div>
                        <p className="text-gray-400 text-xs truncate mt-0.5">{c.lastMessage || 'Sin mensajes todavía'}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm md:col-span-2 flex flex-col" style={{ minHeight: 500 }}>
              {!activeChatId ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  Selecciona una conversación
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.length === 0 && (
                      <p className="text-gray-400 text-sm text-center py-8">Sin mensajes todavía. Escribe el primero.</p>
                    )}
                    {messages.map((m) => {
                      const mine = m.senderId === user.uid;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                            <p>{m.text}</p>
                            <p className={`text-[10px] mt-0.5 ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                              {new Date(m.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-gray-50 p-3 flex gap-2">
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sendingMessage || !messageText.trim()}
                      className="bg-primary-500 text-white px-4 rounded-xl font-semibold text-sm hover:bg-primary-600 transition active:scale-[0.97] disabled:opacity-40"
                    >
                      Enviar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {showAddProduct && (
        <ProductFormModal
          title="Agregar producto"
          initial={{ name: '', description: '', category: PRODUCT_CATEGORIES[0], price: '', purchasePrice: '', originalPrice: '', stock: '' }}
          saving={addSaving}
          onCancel={() => setShowAddProduct(false)}
          onSubmit={submitAddProduct}
        />
      )}

      {editingProduct && (
        <ProductFormModal
          title="Editar producto"
          initial={{
            name: editingProduct.name,
            description: editingProduct.description || '',
            category: editingProduct.category || PRODUCT_CATEGORIES[0],
            price: String(editingProduct.price ?? ''),
            purchasePrice: editingProduct.purchasePrice != null ? String(editingProduct.purchasePrice) : '',
            originalPrice: editingProduct.originalPrice != null ? String(editingProduct.originalPrice) : '',
            stock: String(editingProduct.stock ?? ''),
            photoUrl: editingProduct.photos?.[0],
          }}
          saving={editSaving}
          onCancel={() => setEditingProduct(null)}
          onSubmit={submitEditProduct}
        />
      )}
    </div>
  );
}
