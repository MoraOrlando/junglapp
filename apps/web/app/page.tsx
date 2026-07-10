import Link from 'next/link';
import Image from 'next/image';
import IPhoneMockup from '../components/IPhoneMockup';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="JunglApp" width={180} height={56} className="h-14 w-auto" />
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/acceso" className="text-sm font-medium text-gray-600 hover:text-primary-600 transition">
              Acceder
            </Link>
            <Link
              href="https://apps.apple.com/cl/app/junglapp/id6780333739"
              className="bg-primary-500 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-primary-600 transition"
              target="_blank"
            >
              Descargar
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-500 to-primary-700 text-white py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
              🇨🇱 Disponible en Chile ¡por el momento!
            </span>
            <h1 className="text-5xl font-extrabold leading-tight mb-4">
              Todo el cuidado de tu mascota, en un solo lugar
            </h1>
            <p className="text-white/80 text-lg mb-8">
              Agenda veterinarios, encuentra paseadores, compra en tiendas de mascotas y conecta con la comunidad de dueños.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="https://apps.apple.com/cl/app/junglapp/id6780333739"
                target="_blank"
                className="bg-white text-primary-700 font-bold px-8 py-4 rounded-2xl text-base hover:bg-gray-50 transition flex items-center gap-2"
              >
                🍎 Descargar en App Store
              </Link>
              <Link
                href="/acceso"
                className="border-2 border-white text-white font-semibold px-8 py-4 rounded-2xl text-base hover:bg-white/10 transition"
              >
                Acceder como empresa →
              </Link>
            </div>
          </div>
          <div className="flex justify-center pb-8">
            <IPhoneMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Todo lo que tu mascota necesita</h2>
            <p className="text-gray-500 mt-2 text-lg">Una plataforma completa para dueños responsables</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🩺', title: 'Veterinarios', desc: 'Agenda citas y mantén el historial médico de tu mascota al día.' },
              { icon: '🛒', title: 'Tiendas', desc: 'Compra alimentos, accesorios y productos especializados.' },
              { icon: '🦮', title: 'Paseadores', desc: 'Encuentra paseadores verificados cerca de ti.' },
              { icon: '🐾', title: 'Comunidad', desc: 'Comparte, adopta y conecta con otros dueños en tu ciudad.' },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition">
                <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
                  <span className="text-3xl">{f.icon}</span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business CTA */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-primary-500 to-primary-600 rounded-3xl p-10 text-center text-white">
          <h2 className="text-3xl font-bold mb-3">¿Tienes una tienda o negocio pet?</h2>
          <p className="text-white/80 text-lg mb-8">
            Registra tu negocio en JunglApp y llega a miles de dueños de mascotas en Chile.
          </p>
          <Link
            href="/acceso"
            className="inline-block bg-white text-primary-700 font-bold px-8 py-4 rounded-2xl hover:bg-gray-50 transition"
          >
            Acceder a mi cuenta →
          </Link>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">¿Cómo funciona?</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Descarga la app', desc: 'Disponible gratis en App Store para iPhone.' },
              { step: '02', title: 'Crea tu perfil', desc: 'Registra tu cuenta y agrega a tus mascotas.' },
              { step: '03', title: 'Conéctate', desc: 'Agenda veterinarios, compra y explora la comunidad.' },
            ].map((s) => (
              <div key={s.step} className="flex gap-4 items-start">
                <span className="text-4xl font-extrabold text-primary-200">{s.step}</span>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{s.title}</h3>
                  <p className="text-gray-500 text-sm">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-700 text-white py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="JunglApp" width={100} height={34} className="h-8 w-auto brightness-0 invert" />
          </div>
          <div className="flex gap-6 text-sm text-white/70">
            <Link href="https://mora-orlando.github.io/junglapp-privacy-policy/" target="_blank" className="hover:text-white transition">
              Política de Privacidad
            </Link>
            <Link href="/acceso" className="hover:text-white transition">
              Acceso Empresas
            </Link>
            <Link href="/soporte" className="hover:text-white transition text-white/30 text-xs">
              Soporte
            </Link>
          </div>
          <p className="text-white/40 text-xs">© 2026 JunglApp. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
