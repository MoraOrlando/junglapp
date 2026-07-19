'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

const screens = [
  {
    key: 'home',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
        <div style={{ background: 'linear-gradient(135deg,#16A34A,#15803D)', padding: '36px 16px 20px', borderRadius: '0 0 24px 24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 2 }}>Buenos días 👋</p>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Bienvenido a JunglApp</p>
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🔍</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Buscar servicios...</span>
          </div>
        </div>
        <div style={{ padding: '14px 12px', flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: '#1E293B', marginBottom: 10 }}>Próxima cita</p>
          <div style={{ background: '#fff', borderRadius: 14, padding: 12, border: '1px solid #E2E8F0', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🩺</div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 12, color: '#1E293B' }}>Dr. Martínez</p>
                <p style={{ fontSize: 10, color: '#64748B' }}>Hoy 15:30 · Revisión general</p>
              </div>
              <span style={{ marginLeft: 'auto', background: '#DCFCE7', color: '#16A34A', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>Confirmada</span>
            </div>
          </div>
          <p style={{ fontWeight: 700, fontSize: 12, color: '#1E293B', marginBottom: 8 }}>Mis mascotas</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ e: '🐶', n: 'Max' }, { e: '🐱', n: 'Luna' }].map((p) => (
              <div key={p.n} style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', border: '1px solid #E2E8F0', textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 22 }}>{p.e}</div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#1E293B', marginTop: 4 }}>{p.n}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'near',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
        <div style={{ padding: '36px 14px 12px' }}>
          <p style={{ fontWeight: 800, fontSize: 17, color: '#1D4ED8' }}>Cerca de ti</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EFF6FF', borderRadius: 8, padding: '4px 10px', marginTop: 6 }}>
            <span style={{ fontSize: 11 }}>📍</span>
            <span style={{ color: '#1D4ED8', fontSize: 11, fontWeight: 600 }}>Santiago</span>
            <span style={{ color: '#93C5FD', fontSize: 10 }}>▼</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', overflowX: 'hidden' }}>
          {['✨ Todos', '🩺 Vets', '🛒 Tiendas'].map((c, i) => (
            <div key={c} style={{ background: i === 0 ? '#1D4ED8' : '#fff', borderRadius: 20, padding: '4px 10px', fontSize: 10, color: i === 0 ? '#fff' : '#64748B', fontWeight: 600, border: `1px solid ${i === 0 ? '#1D4ED8' : '#E2E8F0'}`, whiteSpace: 'nowrap' }}>{c}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { e: '🏥', n: 'Clínica VetCare', d: 'Providencia · 0.8 km', r: '⭐ 4.9' },
            { e: '🩺', n: 'Dr. Salinas', d: 'Santiago Centro · 1.2 km', r: '⭐ 4.7' },
            { e: '🛒', n: 'PetStore CL', d: 'Ñuñoa · 1.5 km', r: '⭐ 4.8' },
          ].map((v) => (
            <div key={v.n} style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{v.e}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12, color: '#1E293B' }}>{v.n}</p>
                <p style={{ fontSize: 10, color: '#94A3B8' }}>{v.d}</p>
              </div>
              <span style={{ fontSize: 10, color: '#64748B', flexShrink: 0 }}>{v.r}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    key: 'booking',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
        <div style={{ background: 'linear-gradient(135deg,#1D4ED8,#1E40AF)', padding: '36px 16px 20px', borderRadius: '0 0 24px 24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>Agenda tu cita</p>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Dr. Martínez 🩺</p>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 }}>Clínica VetCare · Providencia</p>
        </div>
        <div style={{ padding: '14px 14px', flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 11, color: '#1E293B', marginBottom: 8 }}>Selecciona fecha</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['Lun\n1', 'Mar\n2', 'Mié\n3', 'Jue\n4'].map((d, i) => (
              <div key={d} style={{ flex: 1, background: i === 1 ? '#1D4ED8' : '#fff', border: `1px solid ${i === 1 ? '#1D4ED8' : '#E2E8F0'}`, borderRadius: 10, padding: '6px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: i === 1 ? 'rgba(255,255,255,0.7)' : '#94A3B8' }}>{d.split('\n')[0]}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: i === 1 ? '#fff' : '#1E293B' }}>{d.split('\n')[1]}</p>
              </div>
            ))}
          </div>
          <p style={{ fontWeight: 700, fontSize: 11, color: '#1E293B', marginBottom: 8 }}>Horarios disponibles</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {['09:00', '10:30', '11:00', '15:30', '16:00'].map((t, i) => (
              <div key={t} style={{ background: i === 2 ? '#DCFCE7' : '#fff', border: `1px solid ${i === 2 ? '#16A34A' : '#E2E8F0'}`, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: i === 2 ? '#16A34A' : '#374151' }}>{t}</div>
            ))}
          </div>
          <div className="confirm-pulse-btn" style={{ background: '#16A34A', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Confirmar cita</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'chat',
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '36px 14px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🩺</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#1E293B' }}>Dr. Martínez</p>
            <p style={{ fontSize: 10, color: '#16A34A' }}>● En línea</p>
          </div>
        </div>
        <div style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'hidden' }}>
          <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px 14px 14px 4px', padding: '8px 12px', maxWidth: '75%' }}>
            <p style={{ fontSize: 11, color: '#1E293B' }}>Hola, ¿en qué le puedo ayudar con su mascota?</p>
            <p style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>10:20</p>
          </div>
          <div style={{ alignSelf: 'flex-end', background: '#16A34A', borderRadius: '14px 14px 4px 14px', padding: '8px 12px', maxWidth: '75%' }}>
            <p style={{ fontSize: 11, color: '#fff' }}>Mi perro tiene tos desde ayer 🐶</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>10:22</p>
          </div>
          <div style={{ alignSelf: 'flex-start', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px 14px 14px 4px', padding: '8px 12px', maxWidth: '75%' }}>
            <p style={{ fontSize: 11, color: '#1E293B' }}>Agendemos una revisión para hoy 🩺</p>
            <p style={{ fontSize: 9, color: '#94A3B8', marginTop: 3 }}>10:23</p>
          </div>
        </div>
        <div style={{ background: '#fff', borderTop: '1px solid #E2E8F0', padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 20, padding: '8px 14px', fontSize: 11, color: '#94A3B8' }}>Escribe un mensaje...</div>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>➤</div>
        </div>
      </div>
    ),
  },
];

export default function IPhoneMockup() {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const interval = setInterval(() => {
        setCurrent((prev) => (prev + 1) % screens.length);
      }, 3000);
      return () => clearInterval(interval);
    }
    const interval = setInterval(() => {
      setDirection('out');
      setAnimating(true);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % screens.length);
        setDirection('in');
        setTimeout(() => setAnimating(false), 350);
      }, 350);
    }, 3000);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const slideStyle: React.CSSProperties = reducedMotion
    ? { position: 'absolute', inset: 0, overflow: 'hidden' }
    : {
        position: 'absolute',
        inset: 0,
        transition: 'transform 350ms cubic-bezier(0.4,0,0.2,1), opacity 350ms ease',
        transform: animating && direction === 'out'
          ? 'translateX(-100%)'
          : animating && direction === 'in'
          ? 'translateX(100%)'
          : 'translateX(0)',
        opacity: animating ? 0 : 1,
        overflow: 'hidden',
      };

  return (
    <div style={{ position: 'relative', width: 260, height: 530 }}>
      {/* Titanium outer frame — z:1, sits behind the screen (z:2); only visible as the 5px border */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: 52,
        background: 'linear-gradient(145deg, #5a5a5e 0%, #2c2c2e 40%, #3a3a3c 70%, #1c1c1e 100%)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        zIndex: 1,
        pointerEvents: 'none',
      }} />

      {/* Screen area — z:2, sits on top of the frame */}
      <div style={{
        position: 'absolute', inset: 5,
        borderRadius: 48,
        background: '#fff',
        overflow: 'hidden',
        zIndex: 2,
      }}>
        {/* Dynamic Island */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 100, height: 30, background: '#000', borderRadius: 20,
          zIndex: 10,
        }} />

        {/* Animated screen content */}
        <div style={slideStyle}>
          {screens[current].content}
        </div>
      </div>

      {/* Side buttons — z:3, visible over screen edges */}
      <div style={{ position: 'absolute', left: -3, top: 70, width: 3, height: 28, background: 'linear-gradient(180deg,#4a4a4c,#2c2c2e)', borderRadius: '2px 0 0 2px', zIndex: 3 }} />
      <div style={{ position: 'absolute', left: -3, top: 110, width: 3, height: 34, background: 'linear-gradient(180deg,#4a4a4c,#2c2c2e)', borderRadius: '2px 0 0 2px', zIndex: 3 }} />
      <div style={{ position: 'absolute', left: -3, top: 154, width: 3, height: 34, background: 'linear-gradient(180deg,#4a4a4c,#2c2c2e)', borderRadius: '2px 0 0 2px', zIndex: 3 }} />
      <div style={{ position: 'absolute', right: -3, top: 120, width: 3, height: 60, background: 'linear-gradient(180deg,#4a4a4c,#2c2c2e)', borderRadius: '0 2px 2px 0', zIndex: 3 }} />

      {/* Screen indicator dots */}
      <div style={{ position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 4 }}>
        {screens.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            style={{
              width: 6, height: 6,
              borderRadius: 3,
              background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
              border: 'none', cursor: 'pointer', padding: 0,
              transformOrigin: 'left center',
              transform: i === current ? 'scaleX(3)' : 'scaleX(1)',
              transition: 'transform 200ms cubic-bezier(0.77, 0, 0.175, 1), background-color 200ms ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
