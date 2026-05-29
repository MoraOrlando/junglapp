'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { AdminStats, User, Pet, Veterinarian, Store, LostPet } from '@junglapp/types';

const { db } = initFirebase();

const COLORS = ['#2D6A4F', '#52B788', '#95D5B2', '#74C69D', '#1B4332', '#40916C'];

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
        </div>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}>
          <span className="text-2xl">{icon}</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [usersSnap, petsSnap, vetsSnap, storesSnap, lostSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.USERS)),
        getDocs(collection(db, COLLECTIONS.PETS)),
        getDocs(collection(db, COLLECTIONS.VETERINARIANS)),
        getDocs(collection(db, COLLECTIONS.STORES)),
        getDocs(collection(db, COLLECTIONS.LOST_PETS)),
      ]);

      const vets = vetsSnap.docs.map((d) => d.data() as Veterinarian);
      const stores = storesSnap.docs.map((d) => d.data() as Store);
      const pets = petsSnap.docs.map((d) => d.data() as Pet);
      const users = usersSnap.docs.map((d) => d.data() as User);
      const lostPets = lostSnap.docs.map((d) => d.data() as LostPet);

      // Lost pets by region
      const lostByRegion: Record<string, number> = {};
      lostPets.forEach((lp) => {
        if (!lp.isFound) lostByRegion[lp.region] = (lostByRegion[lp.region] || 0) + 1;
      });

      // Users by month
      const usersByMonth: Record<string, number> = {};
      users.forEach((u) => {
        if (u.createdAt) {
          const month = new Date(u.createdAt).toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
          usersByMonth[month] = (usersByMonth[month] || 0) + 1;
        }
      });

      // Pets by species
      const petsBySpecies: Record<string, number> = {};
      pets.forEach((p) => {
        const sp = p.species || 'other';
        petsBySpecies[sp] = (petsBySpecies[sp] || 0) + 1;
      });

      setStats({
        totalUsers: users.length,
        totalPets: pets.length,
        totalVets: vets.length,
        totalStores: stores.length,
        pendingVets: vets.filter((v) => v.status === 'pending').length,
        pendingStores: stores.filter((s) => s.status === 'pending').length,
        lostPets: lostPets.filter((lp) => !lp.isFound).length,
        lostPetsByRegion: lostByRegion,
        usersByMonth,
        petsBySpecies,
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading || !stats) {
    return <p className="text-gray-400">Cargando analíticas...</p>;
  }

  const speciesLabels: Record<string, string> = { dog: 'Perros', cat: 'Gatos', other: 'Otros' };
  const speciesData = Object.entries(stats.petsBySpecies).map(([k, v]) => ({ name: speciesLabels[k] || k, value: v }));
  const regionData = Object.entries(stats.lostPetsByRegion).map(([k, v]) => ({ region: k, count: v }));
  const usersData = Object.entries(stats.usersByMonth).map(([k, v]) => ({ month: k, usuarios: v }));

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-1">Dashboard 📊</h1>
      <p className="text-gray-500 mb-8">Resumen general de JunglApp</p>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Usuarios totales" value={stats.totalUsers} icon="👥" color="bg-primary-100" />
        <StatCard label="Mascotas registradas" value={stats.totalPets} icon="🐾" color="bg-green-100" />
        <StatCard label="Veterinarios" value={stats.totalVets} icon="🩺" color="bg-blue-100" />
        <StatCard label="Tiendas" value={stats.totalStores} icon="🏪" color="bg-amber-100" />
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
          <p className="text-yellow-700 font-semibold">⏳ {stats.pendingVets} veterinarios por validar</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-amber-700 font-semibold">⏳ {stats.pendingStores} tiendas por validar</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-red-600 font-semibold">🔍 {stats.lostPets} mascotas extraviadas</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4">Crecimiento de usuarios</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={usersData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="usuarios" stroke="#2D6A4F" strokeWidth={3} dot={{ fill: '#52B788' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-700 mb-4">Mascotas por especie</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={speciesData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {speciesData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-semibold text-gray-700 mb-4">Mascotas extraviadas por región</h3>
          {regionData.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">No hay mascotas extraviadas registradas 🎉</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={regionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="region" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="#2D6A4F" radius={[8, 8, 0, 0]} name="Extraviadas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
