import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';

const { db } = initFirebase();

interface OwnerResult {
  uid: string;
  name: string;
  email: string;
  rut?: string;
  phone?: string;
  photoUrl?: string;
}

interface PetResult {
  id: string;
  name: string;
  species: string;
  breed: string;
  photos: string[];
}

const inputStyle = {
  height: 52,
  paddingHorizontal: 16,
  fontSize: 16,
  color: '#1F2937',
  textAlignVertical: 'center' as const,
};

export default function SearchOwnerScreen() {
  const router = useRouter();
  const [searchType, setSearchType] = useState<'email' | 'rut'>('email');
  const [searchValue, setSearchValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState<OwnerResult | null>(null);
  const [pets, setPets] = useState<PetResult[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    const value = searchValue.trim();
    if (!value) return;
    setLoading(true);
    setSearched(true);
    setOwner(null);
    setPets([]);

    try {
      const usersRef = collection(db, 'users');
      const field = searchType === 'email' ? 'email' : 'rut';
      const snap = await getDocs(query(usersRef, where(field, '==', value)));

      if (snap.empty) {
        setLoading(false);
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data() as OwnerResult;
      setOwner({ ...userData, uid: userDoc.id });

      // Fetch their pets by ownerEmail or ownerId
      const petsSnap = await getDocs(
        query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', userDoc.id))
      );

      const petList: PetResult[] = petsSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        species: d.data().species,
        breed: d.data().breed,
        photos: d.data().photos || [],
      }));
      setPets(petList);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="px-6" keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-6">
          <Text className="text-primary-500 text-base">← Volver</Text>
        </TouchableOpacity>

        <View className="mb-6">
          <Text className="text-2xl font-bold text-primary-700">🔎 Buscar dueño</Text>
          <Text className="text-gray-500 mt-1 text-sm">Encuentra un dueño y sus mascotas registradas</Text>
        </View>

        {/* Toggle email / RUT */}
        <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
          {(['email', 'rut'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              className={`flex-1 py-2.5 rounded-lg items-center ${searchType === t ? 'bg-white shadow-sm' : ''}`}
              onPress={() => { setSearchType(t); setSearchValue(''); setSearched(false); setOwner(null); setPets([]); }}
            >
              <Text className={`text-sm font-medium ${searchType === t ? 'text-primary-600' : 'text-gray-500'}`}>
                {t === 'email' ? '✉️  Correo' : '🪪  RUT'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search input */}
        <View className="flex-row gap-3 mb-6">
          <TextInput
            className="flex-1 border border-gray-200 rounded-xl bg-white"
            style={inputStyle}
            placeholder={searchType === 'email' ? 'correo@ejemplo.com' : '12.345.678-9'}
            placeholderTextColor="#9CA3AF"
            keyboardType={searchType === 'email' ? 'email-address' : 'default'}
            autoCapitalize="none"
            value={searchValue}
            onChangeText={setSearchValue}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            className="bg-primary-500 rounded-xl px-5 items-center justify-center"
            onPress={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-semibold text-base">Buscar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results */}
        {searched && !loading && !owner && (
          <View className="items-center py-10">
            <Text className="text-4xl mb-3">🐾</Text>
            <Text className="text-gray-500 text-base font-medium">Sin resultados</Text>
            <Text className="text-gray-400 text-sm mt-1">
              No se encontró ningún dueño con ese {searchType === 'email' ? 'correo' : 'RUT'}
            </Text>
          </View>
        )}

        {owner && (
          <View>
            {/* Owner card */}
            <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
              <View className="flex-row items-center gap-3">
                {owner.photoUrl ? (
                  <Image source={{ uri: owner.photoUrl }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
                ) : (
                  <View className="w-14 h-14 rounded-full bg-primary-100 items-center justify-center">
                    <Text className="text-2xl font-bold text-primary-600">
                      {owner.name?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-gray-900 font-semibold text-base">{owner.name}</Text>
                  <Text className="text-gray-500 text-sm">{owner.email}</Text>
                  {owner.rut && <Text className="text-gray-400 text-xs mt-0.5">RUT: {owner.rut}</Text>}
                  {owner.phone && <Text className="text-gray-400 text-xs">Tel: {owner.phone}</Text>}
                </View>
                <View className="bg-green-100 rounded-full px-3 py-1">
                  <Text className="text-green-700 text-xs font-semibold">Dueño</Text>
                </View>
              </View>
            </View>

            {/* Pets */}
            <Text className="text-sm font-semibold text-gray-600 mb-2 ml-1">
              Mascotas registradas ({pets.length})
            </Text>

            {pets.length === 0 ? (
              <View className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 py-8 items-center">
                <Text className="text-3xl mb-2">🐾</Text>
                <Text className="text-gray-400 text-sm">Sin mascotas registradas aún</Text>
              </View>
            ) : (
              <View className="gap-3 mb-10">
                {pets.map((pet) => (
                  <TouchableOpacity
                    key={pet.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-row"
                    onPress={() => router.push(`/(owner)/pets/${pet.id}` as any)}
                    activeOpacity={0.8}
                  >
                    {pet.photos[0] ? (
                      <Image
                        source={{ uri: pet.photos[0] }}
                        style={{ width: 80, height: 80 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="w-20 h-20 bg-primary-50 items-center justify-center">
                        <Text className="text-3xl">🐾</Text>
                      </View>
                    )}
                    <View className="flex-1 px-4 justify-center">
                      <Text className="text-gray-900 font-semibold text-base">{pet.name}</Text>
                      <Text className="text-gray-500 text-sm capitalize">{pet.species}</Text>
                      <Text className="text-gray-400 text-xs mt-0.5">{pet.breed}</Text>
                    </View>
                    <View className="pr-4 justify-center">
                      <Text className="text-gray-300 text-xl">›</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
