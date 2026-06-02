import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

const HOBBIES = [
  { id: 'jugar', label: '🎾 Jugar' },
  { id: 'correr', label: '🏃 Correr' },
  { id: 'nadar', label: '🏊 Nadar' },
  { id: 'dormir', label: '😴 Dormir' },
  { id: 'pasear', label: '🌳 Pasear' },
  { id: 'socializar', label: '🐾 Socializar' },
  { id: 'morder', label: '🦴 Morder cosas' },
  { id: 'comer', label: '🍖 Comer' },
  { id: 'explorar', label: '🔍 Explorar' },
  { id: 'abrazar', label: '🤗 Abrazar' },
];

const LOOKING_FOR = [
  { id: 'love', emoji: '❤️', label: 'Amor verdadero', desc: 'Busca una pareja estable y duradera' },
  { id: 'play', emoji: '🎾', label: 'Solo jugar', desc: 'Le gusta tener amigos de juego' },
  { id: 'touch', emoji: '🔥', label: 'Touch & Go', desc: 'Citas cortas, sin compromiso' },
];

const PERSONALITY = [
  { id: 'energetic', label: '⚡ Energético' },
  { id: 'calm', label: '😌 Tranquilo' },
  { id: 'playful', label: '🎠 Juguetón' },
  { id: 'shy', label: '🙈 Tímido' },
  { id: 'dominant', label: '👑 Dominante' },
  { id: 'gentle', label: '🌸 Gentil' },
  { id: 'protective', label: '🛡️ Protector' },
  { id: 'curious', label: '🔭 Curioso' },
];

export default function MatchProfileScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state — stored in pet.matchProfile
  const [about, setAbout] = useState('');
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [personality, setPersonality] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<string>('');

  useEffect(() => {
    if (!petId) return;
    getDoc(doc(db, COLLECTIONS.PETS, petId)).then((snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Pet & { matchProfile?: any };
        setPet(data);
        const mp = (data as any).matchProfile;
        if (mp) {
          setAbout(mp.about || '');
          setHobbies(mp.hobbies || []);
          setPersonality(mp.personality || []);
          setLookingFor(mp.lookingFor || '');
        }
      }
      setLoading(false);
    });
  }, [petId]);

  function toggleChip(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function handleSave() {
    if (!lookingFor) { Alert.alert('Falta info', 'Selecciona qué está buscando tu mascota.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.PETS, petId!), {
        lookingForPartner: true,
        matchProfile: { about, hobbies, personality, lookingFor, updatedAt: new Date().toISOString() },
      });
      Alert.alert('¡Listo! 🔥', `${pet?.name} ya está en modo Match. ¡Buena suerte!`, [
        { text: 'Ver Match', onPress: () => router.replace('/(owner)/match' as any) },
        { text: 'Volver', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Header */}
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-2">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <View className="mb-6">
            <Text className="text-3xl font-bold text-primary-700">💕 Perfil de Match</Text>
            <Text className="text-gray-500 mt-1">
              Cuéntanos sobre <Text className="font-semibold text-gray-700">{pet?.name}</Text> para encontrar la pareja perfecta
            </Text>
          </View>

          {/* Sección 1: Cuéntanos de ti */}
          <View className="mb-6">
            <Text className="text-base font-bold text-gray-800 mb-1">🐾 Cuéntanos de {pet?.name}</Text>
            <Text className="text-gray-400 text-xs mb-3">¿Cómo es su personalidad? ¿Qué lo hace especial?</Text>

            <TextInput
              className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-base text-gray-800 mb-4"
              placeholder={`Describe a ${pet?.name}... ej: Es muy cariñoso y le encanta conocer nuevos amigos 🐾`}
              multiline
              numberOfLines={4}
              value={about}
              onChangeText={setAbout}
              style={{ minHeight: 90, textAlignVertical: 'top' }}
            />

            <Text className="text-sm font-semibold text-gray-700 mb-2">Personalidad</Text>
            <View className="flex-row flex-wrap gap-2">
              {PERSONALITY.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => toggleChip(personality, setPersonality, p.id)}
                  className={`rounded-full px-4 py-2 border ${personality.includes(p.id) ? 'bg-primary-500 border-primary-500' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`text-sm font-medium ${personality.includes(p.id) ? 'text-white' : 'text-gray-600'}`}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sección 2: Hobbies */}
          <View className="mb-6">
            <Text className="text-base font-bold text-gray-800 mb-1">🎉 Hobbies</Text>
            <Text className="text-gray-400 text-xs mb-3">¿Qué le gusta hacer? Selecciona todos los que apliquen</Text>
            <View className="flex-row flex-wrap gap-2">
              {HOBBIES.map((h) => (
                <TouchableOpacity
                  key={h.id}
                  onPress={() => toggleChip(hobbies, setHobbies, h.id)}
                  className={`rounded-full px-4 py-2 border ${hobbies.includes(h.id) ? 'bg-pink-500 border-pink-500' : 'bg-white border-gray-200'}`}
                >
                  <Text className={`text-sm font-medium ${hobbies.includes(h.id) ? 'text-white' : 'text-gray-600'}`}>
                    {h.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sección 3: ¿Qué buscas? */}
          <View className="mb-8">
            <Text className="text-base font-bold text-gray-800 mb-1">💭 ¿Qué está buscando?</Text>
            <Text className="text-gray-400 text-xs mb-3">Sé honesto/a 😄</Text>
            <View className="gap-3">
              {LOOKING_FOR.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setLookingFor(opt.id)}
                  className={`rounded-2xl p-4 border-2 flex-row items-center gap-4 ${lookingFor === opt.id ? 'bg-pink-50 border-pink-400' : 'bg-white border-gray-100'}`}
                >
                  <Text className="text-3xl">{opt.emoji}</Text>
                  <View className="flex-1">
                    <Text className={`font-bold text-base ${lookingFor === opt.id ? 'text-pink-600' : 'text-gray-800'}`}>
                      {opt.label}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-0.5">{opt.desc}</Text>
                  </View>
                  {lookingFor === opt.id && <Text className="text-pink-500 text-xl">✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            className={`bg-pink-500 rounded-2xl py-4 items-center ${saving ? 'opacity-70' : ''}`}
            onPress={handleSave}
            disabled={saving}
          >
            <Text className="text-white font-bold text-base">
              {saving ? 'Guardando...' : '🔥 ¡Activar Match!'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
