'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/users', label: 'Usuarios', icon: '👥' },
  { href: '/dashboard/vets', label: 'Veterinarios', icon: '🩺' },
  { href: '/dashboard/stores', label: 'Tiendas', icon: '🏪' },
  { href: '/dashboard/promotions', label: 'Promociones', icon: '🎉' },
  { href: '/dashboard/lost-pets', label: 'Mascotas Extraviadas', icon: '🔍' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logOut } = useAuth();

  async function handleLogout() {
    await logOut();
    router.replace('/');
  }

  return (
    <aside className="w-64 bg-primary-700 text-white min-h-screen flex flex-col fixed">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-2xl">🐾</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">JunglApp</h1>
            <p className="text-white/60 text-xs">Soporte</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                active ? 'bg-white/20 font-semibold' : 'hover:bg-white/10 text-white/80'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <p className="text-white/60 text-xs mb-2 px-2">{user?.name}</p>
        <button
          onClick={handleLogout}
          className="w-full bg-white/10 hover:bg-white/20 rounded-xl py-2 text-sm transition"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
