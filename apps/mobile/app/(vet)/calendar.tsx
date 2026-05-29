import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '14:00', '14:30', '15:00',
  '15:30', '16:00', '16:30', '17:00', '17:30',
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
  const [saving, setSaving] = useState(false);

  const days = getNextDays(14);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const vet = snap.docs[0].data() as Veterinarian;
        setVetId(snap.docs[0].id);
        setAvailability(vet.availability || {});
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

  async function saveAvailability() {
    if (!vetId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetId), { availability });
      Alert.alert('✅', 'Disponibilidad guardada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const currentSlots = availability[selectedDate] || [];

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-blue-700 mb-1">Mi Disponibilidad 🗓️</Text>
        <Text className="text-gray-400 text-sm">Selecciona los horarios NO disponibles (bloqueados)</Text>
      </View>

      {/* Date picker */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 mb-4" style={{ maxHeight: 80 }}>
        {days.map((day) => {
          const d = new Date(day + 'T00:00:00');
          const isSelected = day === selectedDate;
          const hasBlocked = (availability[day] || []).length > 0;
          return (
            <TouchableOpacity
              key={day}
              className={`mr-2 rounded-2xl p-3 border-2 items-center w-16 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}
              onPress={() => setSelectedDate(day)}
            >
              <Text className="text-xs text-gray-500">{d.toLocaleDateString('es-CL', { weekday: 'short' })}</Text>
              <Text className={`font-bold ${isSelected ? 'text-blue-600' : 'text-gray-800'}`}>{d.getDate()}</Text>
              {hasBlocked && <View className="w-1.5 h-1.5 rounded-full bg-red-400 mt-0.5" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView className="flex-1 px-6">
        <Text className="text-gray-600 font-medium mb-3">
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text className="text-gray-400 text-xs mb-3">Toca un horario para bloquearlo/desbloquearlo</Text>

        <View className="flex-row flex-wrap gap-2 mb-6">
          {TIME_SLOTS.map((slot) => {
            const isBlocked = currentSlots.includes(slot);
            return (
              <TouchableOpacity
                key={slot}
                className={`rounded-xl px-4 py-3 border-2 ${isBlocked ? 'bg-red-100 border-red-300' : 'bg-green-50 border-green-200'}`}
                onPress={() => toggleSlot(slot)}
              >
                <Text className={`text-sm font-medium ${isBlocked ? 'text-red-600' : 'text-green-700'}`}>{slot}</Text>
                <Text className={`text-xs text-center ${isBlocked ? 'text-red-400' : 'text-green-400'}`}>
                  {isBlocked ? '🚫' : '✅'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View className="flex-row gap-4 mb-4">
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-green-400" />
            <Text className="text-gray-500 text-xs">Disponible</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-red-400" />
            <Text className="text-gray-500 text-xs">Bloqueado</Text>
          </View>
        </View>

        <TouchableOpacity
          className={`bg-blue-600 rounded-2xl py-4 items-center mb-10 ${saving ? 'opacity-70' : ''}`}
          onPress={saveAvailability}
          disabled={saving}
        >
          <Text className="text-white font-semibold text-base">
            {saving ? 'Guardando...' : '💾 Guardar Disponibilidad'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
