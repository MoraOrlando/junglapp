import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Trainer } from '@junglapp/types';

const { db } = initFirebase();
const INDIGO = '#4F46E5';
const SLOTS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];

function getDates() {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default function TrainerCalendarScreen() {
  const { user } = useAuth();
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [trainerDocId, setTrainerDocId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);
  const dates = getDates();

  async function loadData() {
    if (!user) return;
    const snap = await getDocs(query(collection(db, COLLECTIONS.TRAINERS), where('userId', '==', user.uid)));
    if (!snap.empty) {
      const t = { id: snap.docs[0].id, ...snap.docs[0].data() } as Trainer;
      setTrainer(t);
      setTrainerDocId(snap.docs[0].id);
      setAvailability(t.availability || {});
      setFee(String(t.consultationFee || ''));
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  function toggleSlot(slot: string) {
    setAvailability((prev) => {
      const cur = prev[selectedDate] || [];
      const next = cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot];
      return { ...prev, [selectedDate]: next };
    });
  }

  async function save() {
    if (!trainerDocId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.TRAINERS, trainerDocId), {
        availability,
        consultationFee: Number(fee) || 0,
      });
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
      <View style={{ backgroundColor: INDIGO, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Gestión de horarios</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>📅 Mis Disponibilidades</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Fee */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Valor por sesión (CLP)</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14 }}>
            <Text style={{ color: '#6B7280', fontSize: 16, marginRight: 4 }}>$</Text>
            <TextInput
              style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: '#1F2937' }}
              placeholder="25000"
              keyboardType="number-pad"
              value={fee}
              onChangeText={setFee}
            />
          </View>
        </View>

        {/* Date strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 12 }}>
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
                    backgroundColor: isSelected ? INDIGO : '#fff',
                    borderWidth: 1, borderColor: isSelected ? INDIGO : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.8)' : '#9CA3AF' }}>{dayNames[d.getDay()]}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: isSelected ? '#fff' : '#1F2937', marginTop: 2 }}>{d.getDate()}</Text>
                  {hasSlots && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : INDIGO, marginTop: 4 }} />}
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
            {SLOTS.map((slot) => {
              const active = selectedSlots.includes(slot);
              return (
                <TouchableOpacity
                  key={slot}
                  onPress={() => toggleSlot(slot)}
                  style={{
                    width: '30%', paddingVertical: 10, borderRadius: 12, alignItems: 'center',
                    backgroundColor: active ? '#ECFDF5' : '#fff',
                    borderWidth: 1.5, borderColor: active ? '#10B981' : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#059669' : '#6B7280' }}>
                    {active ? '✅' : '○'} {slot}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: INDIGO, borderRadius: 16, paddingVertical: 16, alignItems: 'center', margin: 24, opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Guardando...' : 'Guardar disponibilidad'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
