import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

const ALL_TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00',
];

function getNextDays(n: number) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export default function VetCalendarScreen() {
  const { user } = useAuth();
  const [vetId, setVetId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [consultationFee, setConsultationFee] = useState('');
  const [saving, setSaving] = useState(false);

  const days = getNextDays(14);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const vet = snap.docs[0].data() as Veterinarian;
        setVetId(snap.docs[0].id);
        setAvailability(vet.availability || {});
        if (vet.consultationFee) setConsultationFee(String(vet.consultationFee));
      }
    });
  }, [user]);

  function toggleSlot(slot: string) {
    const current = availability[selectedDate] || [];
    const updated = current.includes(slot)
      ? current.filter((s) => s !== slot)
      : [...current, slot];
    setAvailability({ ...availability, [selectedDate]: updated });
  }

  async function saveAll() {
    if (!vetId) return;
    setSaving(true);
    try {
      const fee = parseFloat(consultationFee.replace(/\./g, '').replace(',', '.'));
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetId), {
        availability,
        ...(isNaN(fee) ? {} : { consultationFee: fee }),
      });
      Alert.alert('✅', 'Agenda guardada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const currentSlots = availability[selectedDate] || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#1D4ED8', marginBottom: 2 }}>
          Mi Agenda 🗓️
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 13 }}>
          Gestiona tu disponibilidad y tarifa
        </Text>
      </View>

      {/* Consultation fee */}
      <View style={{ marginHorizontal: 24, marginBottom: 16, backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#BFDBFE' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D4ED8', marginBottom: 8 }}>
          💰 Tarifa de consulta (CLP)
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 18, marginRight: 6 }}>$</Text>
          <TextInput
            value={consultationFee}
            onChangeText={setConsultationFee}
            keyboardType="numeric"
            placeholder="25000"
            placeholderTextColor="#CBD5E1"
            style={{ flex: 1, fontSize: 18, fontWeight: '600', color: '#1E293B' }}
          />
          <Text style={{ color: '#94A3B8', fontSize: 12 }}>CLP</Text>
        </View>
      </View>

      {/* 14-day date strip */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 90 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
      >
        {days.map((day) => {
          const d = new Date(day + 'T00:00:00');
          const isSelected = day === selectedDate;
          const hasSlots = (availability[day] || []).length > 0;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDate(day)}
              style={{
                width: 56,
                borderRadius: 16,
                padding: 10,
                alignItems: 'center',
                borderWidth: 2,
                borderColor: isSelected ? '#1D4ED8' : '#E2E8F0',
                backgroundColor: isSelected ? '#1D4ED8' : '#FFFFFF',
              }}
            >
              <Text style={{ fontSize: 11, color: isSelected ? '#BFDBFE' : '#94A3B8' }}>
                {d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}
              </Text>
              <Text style={{ fontWeight: '700', fontSize: 16, color: isSelected ? '#FFFFFF' : '#1E293B' }}>
                {d.getDate()}
              </Text>
              {hasSlots ? (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? '#93C5FD' : '#1D4ED8', marginTop: 2 }} />
              ) : (
                <View style={{ width: 6, height: 6, marginTop: 2 }} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Slot grid */}
      <ScrollView style={{ flex: 1, paddingHorizontal: 24, marginTop: 16 }}>
        <Text style={{ color: '#475569', fontWeight: '600', fontSize: 14, marginBottom: 4 }}>
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 12 }}>
          Verde = disponible para pacientes · Gris = no disponible
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {ALL_TIME_SLOTS.map((slot) => {
            const isAvailable = currentSlots.includes(slot);
            return (
              <TouchableOpacity
                key={slot}
                onPress={() => toggleSlot(slot)}
                style={{
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderWidth: 2,
                  borderColor: isAvailable ? '#16A34A' : '#E2E8F0',
                  backgroundColor: isAvailable ? '#DCFCE7' : '#F8FAFC',
                  alignItems: 'center',
                  minWidth: 72,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: isAvailable ? '#16A34A' : '#94A3B8' }}>
                  {slot}
                </Text>
                <Text style={{ fontSize: 12, marginTop: 2 }}>{isAvailable ? '✅' : '○'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#16A34A' }} />
            <Text style={{ color: '#64748B', fontSize: 12 }}>Disponible</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#CBD5E1' }} />
            <Text style={{ color: '#64748B', fontSize: 12 }}>No disponible</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={saveAll}
          disabled={saving}
          style={{
            backgroundColor: saving ? '#93C5FD' : '#1D4ED8',
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 40,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
