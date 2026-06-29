import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata: Metadata = {
  title: 'JunglApp — La app para el cuidado de tus mascotas',
  description: 'Conectamos a dueños de mascotas con veterinarios, tiendas, paseadores y más. Descarga JunglApp gratis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
