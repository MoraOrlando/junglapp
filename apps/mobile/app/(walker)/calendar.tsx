import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Walker } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';
const DURATIONS: Array<30 | 45 | 60> = [30, 45, 60];
const DAY_START_MIN = 8 * 60; // 08:00
const DAY_END_MIN = 18 * 60; // 18:00
const STRIP_DAYS = 14;
const WEEK_DAYS = 7;
const MONTH_DAYS = 30;

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function generateSlots(duration: number): string[] {
  const slots: string[] = [];
  for (let t = DAY_START_MIN; t < DAY_END_MIN; t += duration) {
    slots.push(minutesToLabel(t));
  }
  return slots;
}

// `toISOString()` converts to UTC first, which rolls the date over to the next
// day once local time is past (24 - |UTC offset|) hours — e.g. any time after
// 20:00 in Chile (UTC-4). Format from local date parts instead.
function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDates(count: number) {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dates.push(toLocalDateString(d));
  }
  return dates;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

export default function WalkerCalendarScreen() {
  const { user } = useAuth();
  const [walker, setWalker] = useState<Walker | null>(null);
  const [walkerDocId, setWalkerDocId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [slotDuration, setSlotDuration] = useState<30 | 45 | 60>(30);
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));
  const [saving, setSaving] = useState(false);
  const dates = getDates(STRIP_DAYS);
  const slots = generateSlots(slotDuration);
  const today = toLocalDateString(new Date());

  async function loadData() {
    if (!user) return;
    const snap = await getDocs(query(collection(db, COLLECTIONS.WALKERS), where('userId', '==', user.uid)));
    if (!snap.empty) {
      const w = { id: snap.docs[0].id, ...snap.docs[0].data() } as Walker;
      setWalker(w);
      setWalkerDocId(snap.docs[0].id);
      setAvailability(w.availability || {});
      setSlotDuration(w.slotDuration || 30);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  function isPastSlot(date: string, slot: string): boolean {
    return date === today && slotToMinutes(slot) <= nowMinutes();
  }

  function toggleSlot(slot: string) {
    if (isPastSlot(selectedDate, slot)) return;
    setAvailability((prev) => {
      const cur = prev[selectedDate] || [];
      const next = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
      return { ...prev, [selectedDate]: next };
    });
  }

  function changeDuration(next: 30 | 45 | 60) {
    if (next === slotDuration) return;
    Alert.alert(
      'Cambiar duración de bloque',
      'Esto reiniciará los horarios seleccionados para todos los días, ya que cambian los bloques disponibles. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => { setSlotDuration(next); setAvailability({}); } },
      ]
    );
  }

  function applyToRange(days: number, label: string) {
    const template = availability[selectedDate] || [];
    if (template.length === 0) {
      Alert.alert('Selecciona horarios', 'Primero elige al menos un horario en el día actual para poder replicarlo.');
      return;
    }
    const targetDates = getDates(days);
    Alert.alert(
      `Aplicar a ${label}`,
      `Se usarán los ${template.length} horario(s) seleccionados de hoy (${selectedDate}) para los próximos ${days} días. Esto reemplaza la disponibilidad existente en esos días. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar', onPress: () => {
            setAvailability((prev) => {
              const next = { ...prev };
              for (const d of targetDates) {
                // Never mark a past slot as available for today.
                next[d] = d === today ? template.filter((s) => !isPastSlot(d, s)) : [...template];
              }
              return next;
            });
          },
        },
      ]
    );
  }

  async function save() {
    if (!walkerDocId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.WALKERS, walkerDocId), { availability, slotDuration });
      Alert.alert('✅', 'Horarios guardados correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedSlots = availability[selectedDate] || [];
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ backgroundColor: GREEN, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Gestión de horarios</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>📅 Mis Disponibilidades</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* Slot duration picker */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 }}>Duración de cada bloque</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {DURATIONS.map((d) => {
              const active = d === slotDuration;
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => changeDuration(d)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                    backgroundColor: active ? GREEN : '#fff',
                    borderWidth: 1.5, borderColor: active ? GREEN : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : '#6B7280' }}>{d} min</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 20 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24 }}>
            {dates.map((date) => {
              const d = new Date(date + 'T12:00:00');
              const isSelected = date === selectedDate;
              const hasSlots = (availability[date] || []).length > 0;
              return (
                <TouchableOpacity
                  key={date}
                  onPress={() => setSelectedDate(date)}
                  style={{
                    width: 54, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
                    backgroundColor: isSelected ? GREEN : '#fff',
                    borderWidth: 1, borderColor: isSelected ? GREEN : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.8)' : '#9CA3AF' }}>
                    {date === today ? 'Hoy' : dayNames[d.getDay()]}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: isSelected ? '#fff' : '#1F2937', marginTop: 2 }}>{d.getDate()}</Text>
                  {hasSlots && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : GREEN, marginTop: 4 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Slots */}
        <View style={{ paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 }}>
            Horarios disponibles · {selectedSlots.length} seleccionados
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {slots.map((slot) => {
              const active = selectedSlots.includes(slot);
              const past = isPastSlot(selectedDate, slot);
              return (
                <TouchableOpacity
                  key={slot}
                  onPress={() => toggleSlot(slot)}
                  disabled={past}
                  style={{
                    width: '30%', paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                    backgroundColor: past ? '#F3F4F6' : active ? '#ECFDF5' : '#fff',
                    borderWidth: 1.5, borderColor: past ? '#E5E7EB' : active ? '#10B981' : '#E5E7EB',
                    opacity: past ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: past ? '#9CA3AF' : active ? '#059669' : '#6B7280' }}>
                    {past ? '⛔' : active ? '✅' : '○'} {slot}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Bulk apply */}
        <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Aplicar a varios días</Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>
            Usa los horarios seleccionados del día actual ({selectedDate}) y replícalos.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => applyToRange(WEEK_DAYS, 'toda la semana')}
              style={{ flex: 1, borderWidth: 1.5, borderColor: GREEN, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F0FDF4' }}
            >
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>📆 Toda la semana</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyToRange(MONTH_DAYS, 'todo el mes')}
              style={{ flex: 1, borderWidth: 1.5, borderColor: GREEN, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F0FDF4' }}
            >
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>🗓️ Todo el mes</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', margin: 24, opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Guardando...' : 'Guardar disponibilidad'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
