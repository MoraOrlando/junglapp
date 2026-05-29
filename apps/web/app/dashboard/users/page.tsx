'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { db } = initFirebase();

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Dueño', color: 'bg-green-100 text-green-700' },
  vet: { label: 'Veterinario', color: 'bg-blue-100 text-blue-700' },
  store: { label: 'Tienda', color: 'bg-amber-100 text-amber-700' },
  support: { label: 'Soporte', color: 'bg-purple-100 text-purple-700' },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [editing, setEditing] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(user: User) {
    if (!confirm(`¿Eliminar la cuenta de ${user.name}? Esta acción no se puede deshacer.`)) return;
    await deleteDoc(doc(db, COLLECTIONS.USERS, user.uid));
    setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await updateDoc(doc(db, COLLECTIONS.USERS, editing.uid), {
      name: editing.name,
      phone: editing.phone,
      address: editing.address,
      postalCode: editing.postalCode,
    });
    setUsers((prev) => prev.map((u) => u.uid === editing.uid ? editing : u));
    setEditing(null);
  }

  const filtered = users.filter((u) => {
    const matchesSearch = !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.rut?.includes(search);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Usuarios 👥</h1>
      <p className="text-gray-500 mb-6">Gestiona las cuentas de la plataforma</p>

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, email o RUT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 bg-white"
        >
          <option value="all">Todos los roles</option>
          <option value="owner">Dueños</option>
          <option value="vet">Veterinarios</option>
          <option value="store">Tiendas</option>
          <option value="support">Soporte</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <p className="text-gray-400 p-8 text-center">Cargando...</p>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">RUT</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Teléfono</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-gray-600">Rol</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const role = ROLE_LABELS[user.role] || { label: user.role, color: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={user.uid} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{user.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.rut}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.phone}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${role.color}`}>{role.label}</span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => setEditing(user)} className="text-blue-500 hover:underline text-sm">Editar</button>
                      <button onClick={() => handleDelete(user)} className="text-red-500 hover:underline text-sm">Eliminar</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 py-8">No se encontraron usuarios</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Editar usuario</h2>
            <div className="space-y-3">
              {[
                { label: 'Nombre', key: 'name' as const },
                { label: 'Teléfono', key: 'phone' as const },
                { label: 'Dirección', key: 'address' as const },
                { label: 'Código Postal', key: 'postalCode' as const },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm text-gray-600 mb-1">{f.label}</label>
                  <input
                    value={(editing[f.key] as string) || ''}
                    onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 bg-gray-100 rounded-xl py-2.5 text-gray-600">Cancelar</button>
              <button onClick={handleSaveEdit} className="flex-1 bg-primary-500 text-white rounded-xl py-2.5">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
