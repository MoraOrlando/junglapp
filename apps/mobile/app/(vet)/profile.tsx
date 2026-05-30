import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type WeekDay = (typeof WEEK_DAYS)[number];

export default function VetProfileScreen() {
  const { user, logOut } = useAuth();
  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [vetDocId, setVetDocId] = useState<string | null>(null);

  // Availability days
  const [activeDays, setActiveDays] = useState<Set<WeekDay>>(new Set());

  // Consultation hours
  const [slots, setSlots] = useState<string[]>([]);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState('');

  // Base fee
  const [fee, setFee] = useState('');

  useEffect(() => {
    if (!user) return;
    getDocs(
      query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))
    ).then((snap) => {
      if (!snap.empty) {
        const v = { id: snap.docs[0].id, ...snap.docs[0].data() } as Veterinarian;
        setVet(v);
        setVetDocId(snap.docs[0].id);
        setFee(String(v.consultationFee ?? ''));

        // Load availability days from vetProfile.availability (object with day keys)
        const avail = (v as any).availability || {};
        const days = new Set<WeekDay>(
          WEEK_DAYS.filter((d) => avail[d] === true || avail[d] === 'true')
        );
        setActiveDays(days);

        // Load consultation hours slots
        const savedSlots: string[] = (v as any).consultationSlots || [];
        setSlots(savedSlots);
      }
    });
  }, [user]);

  async function toggleDay(day: WeekDay) {
    if (!vetDocId) return;
    const next = new Set(activeDays);
    if (next.has(day)) {
      next.delete(day);
    } else {
      next.add(day);
    }
    setActiveDays(next);

    const availability: Record<string, boolean> = {};
    WEEK_DAYS.forEach((d) => {
      availability[d] = next.has(d);
    });
    try {
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), { availability });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function removeSlot(slot: string) {
    if (!vetDocId) return;
    const next = slots.filter((s) => s !== slot);
    setSlots(next);
    try {
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), {
        consultationSlots: next,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function addSlot() {
    const trimmed = newSlot.trim();
    if (!trimmed || !vetDocId) return;
    const next = [...slots, trimmed];
    setSlots(next);
    setNewSlot('');
    setShowAddSlot(false);
    try {
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), {
        consultationSlots: next,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function saveFee() {
    if (!vetDocId) return;
    const numFee = Number(fee);
    if (isNaN(numFee)) {
      Alert.alert('Error', 'Ingresa un valor numérico válido.');
      return;
    }
    try {
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), {
        consultationFee: numFee,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  if (!vet) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-400">Cargando perfil...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={{ backgroundColor: '#1B4332' }} className="px-5 pt-5 pb-7">
          <Text className="text-white text-2xl font-bold">Vet Console</Text>
          <Text className="text-white/70 text-sm mt-1">
            Manage your clinic's digital presence and booking flow.
          </Text>
        </View>

        <View className="px-4 -mt-2">
          {/* ── Weekly Availability ── */}
          <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-gray-800 font-bold text-base">Weekly Availability</Text>
              <View style={{ backgroundColor: '#D8F3DC' }} className="rounded-full px-3 py-1">
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                  Auto-updating
                </Text>
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {WEEK_DAYS.map((day) => {
                const active = activeDays.has(day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => toggleDay(day)}
                    className="rounded-xl px-4 py-2.5"
                    style={
                      active
                        ? { backgroundColor: '#2D6A4F' }
                        : { borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' }
                    }
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: active ? '#FFFFFF' : '#6B7280' }}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Standard Consultation Hours ── */}
          <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-800 font-bold text-base mb-4">
              Standard Consultation Hours
            </Text>

            {slots.length === 0 && (
              <Text className="text-gray-400 text-sm mb-3">No hay horarios configurados aún.</Text>
            )}

            <View className="gap-2 mb-3">
              {slots.map((slot) => (
                <View
                  key={slot}
                  className="flex-row items-center bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                >
                  <Text className="text-base mr-2">🕐</Text>
                  <Text className="flex-1 text-gray-700 text-sm font-medium">{slot}</Text>
                  <TouchableOpacity onPress={() => removeSlot(slot)} className="px-1">
                    <Text className="text-gray-400 text-base font-bold">✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <TouchableOpacity
              className="flex-row items-center justify-center border border-dashed border-gray-300 rounded-xl py-3 gap-2"
              onPress={() => setShowAddSlot(true)}
            >
              <Text className="font-semibold" style={{ color: '#2D6A4F' }}>
                + Add Slot
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Base Fee ── */}
          <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-800 font-bold text-base mb-1">Base Fee</Text>
            <Text className="text-gray-400 text-xs mb-4">Per 30-minute standard consultation</Text>
            <View className="flex-row items-center border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
              <View
                className="px-4 py-3.5 border-r border-gray-200"
                style={{ backgroundColor: '#F3F4F6' }}
              >
                <Text className="text-gray-500 font-semibold text-base">$</Text>
              </View>
              <TextInput
                className="flex-1 px-4 py-3.5 text-base text-gray-800 bg-gray-50"
                value={fee}
                onChangeText={setFee}
                keyboardType="number-pad"
                placeholder="25000"
                placeholderTextColor="#9CA3AF"
                returnKeyType="done"
                onBlur={saveFee}
                onSubmitEditing={saveFee}
              />
            </View>
          </View>

          {/* ── Profile Info ── */}
          <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-800 font-bold text-base mb-4">Información</Text>
            {[
              { label: 'RUT', value: vet.rut },
              { label: 'Registro profesional', value: vet.licenseNumber },
              { label: 'Dirección', value: vet.address },
              { label: 'Teléfono', value: vet.phone },
            ].map((item) => (
              <View
                key={item.label}
                className="flex-row justify-between py-2.5 border-b border-gray-50"
              >
                <Text className="text-gray-400 text-sm">{item.label}</Text>
                <Text className="text-gray-700 text-sm font-medium">{item.value}</Text>
              </View>
            ))}
          </View>

          {/* ── Sign out ── */}
          <TouchableOpacity
            className="bg-red-50 border border-red-100 rounded-2xl py-4 items-center mb-10"
            onPress={logOut}
          >
            <Text className="text-red-500 font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Add Slot Modal ── */}
      <Modal
        visible={showAddSlot}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddSlot(false)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="bg-white rounded-2xl p-6 w-full shadow-lg">
            <Text className="text-gray-800 font-bold text-lg mb-4">Agregar horario</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 bg-gray-50 mb-4"
              placeholder="Ej: 09:00 - 09:30 AM"
              placeholderTextColor="#9CA3AF"
              value={newSlot}
              onChangeText={setNewSlot}
              autoFocus
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 border border-gray-200 rounded-xl py-3 items-center"
                onPress={() => {
                  setShowAddSlot(false);
                  setNewSlot('');
                }}
              >
                <Text className="text-gray-500 font-semibold">Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl py-3 items-center"
                style={{ backgroundColor: '#2D6A4F' }}
                onPress={addSlot}
              >
                <Text className="text-white font-semibold">Agregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
