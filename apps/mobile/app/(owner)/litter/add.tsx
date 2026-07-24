import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImage, uploadImages } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';

interface AnimalEntry {
  // Starts undecided so the photo/sex/description fields stay hidden until
  // the owner actually picks Regalar or Vender for this animal, instead of
  // showing every field at once with a silently pre-selected "Regalar".
  decided: boolean;
  isGift: boolean;
  price: string;
  sex: 'M' | 'F' | '';
  photo: string | null;
  description: string;
  available: boolean;
}

function makeAnimal(): AnimalEntry {
  return { decided: false, isGift: true, price: '', sex: '', photo: null, description: '', available: true };
}

export default function AddLitterScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [animals, setAnimals] = useState<AnimalEntry[]>([makeAnimal()]);
  const [loading, setLoading] = useState(false);
  const [loadingPets, setLoadingPets] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))).then((snap) => {
      setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
      setLoadingPets(false);
    }).catch(() => { setLoadingPets(false); });
  }, [user?.uid]);

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos([...photos, ...result.assets.map((a) => a.uri)]);
  }

  function removeAnimal(index: number) {
    if (animals.length === 1) return;
    setAnimals(animals.filter((_, i) => i !== index));
  }

  function updateAnimal(index: number, patch: Partial<AnimalEntry>) {
    setAnimals(animals.map((a, i) => i === index ? { ...a, ...patch } : a));
  }

  // Quick "total de camada" stepper — grows/shrinks the animal list instead
  // of clicking "+ Agregar" one by one. New slots start undecided just like
  // makeAnimal(); shrinking trims from the end.
  function setLitterTotal(n: number) {
    const clamped = Math.max(1, Math.min(30, n));
    setAnimals((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped > prev.length) return [...prev, ...Array.from({ length: clamped - prev.length }, makeAnimal)];
      return prev.slice(0, clamped);
    });
  }

  async function pickAnimalPhoto(index: number) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled && result.assets[0]) updateAnimal(index, { photo: result.assets[0].uri });
  }

  async function handlePublish() {
    if (!selectedPet) { Alert.alert('Falta info', 'Selecciona el padre o madre de la camada.'); return; }
    if (photos.length === 0) { Alert.alert('Falta info', 'Agrega al menos una foto de los animales.'); return; }
    if (!user) return;

    const undecided = animals.some((a) => !a.decided);
    if (undecided) { Alert.alert('Falta info', 'Indica si cada animal se regala o se vende.'); return; }
    const invalidSale = animals.some((a) => !a.isGift && (!a.price.trim() || isNaN(Number(a.price))));
    if (invalidSale) { Alert.alert('Falta info', 'Ingresa el precio de los animales en venta.'); return; }

    setLoading(true);
    try {
      const photoUrls = await uploadImages(photos);
      const animalPhotoUrls = await Promise.all(
        animals.map((a) => (a.photo ? uploadImage(a.photo) : Promise.resolve(null)))
      );
      await addDoc(collection(db, COLLECTIONS.LITTERS), {
        ownerId: user.uid,
        ownerName: user.name || 'Usuario',
        parentPetId: selectedPet.id,
        parentPetName: selectedPet.name,
        species: selectedPet.species,
        breed: selectedPet.breed || '',
        photos: photoUrls,
        description: description.trim(),
        animals: animals.map((a, i) => ({
          isGift: a.isGift,
          price: a.isGift ? 0 : Number(a.price),
          sex: a.sex || null,
          photoUrl: animalPhotoUrls[i],
          description: a.description.trim(),
          available: true,
        })),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      Alert.alert('¡Publicado! 🎉', 'Tu camada ya está visible para la comunidad.', [
        { text: 'Ver camadas', onPress: () => router.replace('/(owner)/litter' as any) },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 8 }}>
            <Text style={{ color: GREEN, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN, marginBottom: 4 }}>🐣 Publicar camada</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 20 }}>
            Comparte con la comunidad los animales disponibles para adopción o venta
          </Text>

          {/* Seleccionar mascota padre/madre */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>
            Padre o madre de la camada *
          </Text>
          {loadingPets ? (
            <ActivityIndicator color={GREEN} />
          ) : pets.length === 0 ? (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 14, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: '#92400E', fontSize: 13 }}>
                Primero registra tus mascotas en la sección "Mis Mascotas".
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {pets.map((pet) => {
                  const selected = selectedPet?.id === pet.id;
                  return (
                    <TouchableOpacity
                      key={pet.id}
                      onPress={() => setSelectedPet(pet)}
                      style={{
                        borderRadius: 16, padding: 12, alignItems: 'center', width: 90,
                        borderWidth: 2,
                        backgroundColor: selected ? '#D8F3DC' : '#fff',
                        borderColor: selected ? GREEN : '#E5E7EB',
                      }}
                    >
                      {pet.photos?.[0] ? (
                        <Image source={{ uri: pet.photos[0] }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#D8F3DC', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? GREEN : '#6B7280', marginTop: 6, textAlign: 'center' }} numberOfLines={1}>
                        {pet.name}
                      </Text>
                      {selected && <Text style={{ fontSize: 14, color: GREEN, marginTop: 2 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Fotos de los animales */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>
            Fotos de los animales *
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {photos.map((uri, i) => (
                <View key={i} style={{ position: 'relative' }}>
                  <Image source={{ uri }} style={{ width: 90, height: 90, borderRadius: 14 }} contentFit="cover" />
                  <TouchableOpacity
                    onPress={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#EF4444', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={pickPhotos}
                style={{ width: 90, height: 90, borderWidth: 2, borderStyle: 'dashed', borderColor: GREEN, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' }}
              >
                <Text style={{ fontSize: 26 }}>📷</Text>
                <Text style={{ color: GREEN, fontSize: 10, marginTop: 2, fontWeight: '600' }}>Agregar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Descripción general */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 }}>Descripción</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 }}
            placeholder="Ej: Camada de 4 cachorros labrador, vacunados y desparasitados, listos en 4 semanas..."
            multiline
            value={description}
            onChangeText={setDescription}
          />

          {/* Total de camada */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>
            Total de animales en la camada *
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => setLitterTotal(animals.length - 1)}
              disabled={animals.length <= 1}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', opacity: animals.length <= 1 ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#374151' }}>−</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: '800', color: GREEN, minWidth: 32, textAlign: 'center' }}>
              {animals.length}
            </Text>
            <TouchableOpacity
              onPress={() => setLitterTotal(animals.length + 1)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#D8F3DC', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: GREEN }}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Animales individuales */}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 }}>
            Detalle de cada animal
          </Text>

          {animals.map((animal, i) => (
            <View key={i} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontWeight: '700', color: '#374151' }}>Animal #{i + 1}</Text>
                {animals.length > 1 && (
                  <TouchableOpacity onPress={() => removeAnimal(i)}>
                    <Text style={{ color: '#EF4444', fontSize: 13 }}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Regalar vs vender — deciding one reveals photo/sexo/descripción below */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => updateAnimal(i, { isGift: true, decided: true })}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 2,
                    backgroundColor: animal.decided && animal.isGift ? '#FEF3C7' : '#fff',
                    borderColor: animal.decided && animal.isGift ? '#F59E0B' : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🎁</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: animal.decided && animal.isGift ? '#92400E' : '#9CA3AF', marginTop: 2 }}>Regalar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateAnimal(i, { isGift: false, decided: true })}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 2,
                    backgroundColor: animal.decided && !animal.isGift ? '#ECFDF5' : '#fff',
                    borderColor: animal.decided && !animal.isGift ? GREEN : '#E5E7EB',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>💰</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: animal.decided && !animal.isGift ? GREEN : '#9CA3AF', marginTop: 2 }}>Vender</Text>
                </TouchableOpacity>
              </View>

              {animal.decided && !animal.isGift && (
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14, marginBottom: 10 }}
                  placeholder="Precio (CLP)"
                  keyboardType="number-pad"
                  value={animal.price}
                  onChangeText={(v) => updateAnimal(i, { price: v })}
                />
              )}

              {animal.decided && (
                <>
                  {/* Foto individual */}
                  <TouchableOpacity onPress={() => pickAnimalPhoto(i)} style={{ marginBottom: 10 }}>
                    {animal.photo ? (
                      <Image source={{ uri: animal.photo }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>📷</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Sexo */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <TouchableOpacity
                      onPress={() => updateAnimal(i, { sex: 'M' })}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 2, backgroundColor: animal.sex === 'M' ? '#EFF6FF' : '#fff', borderColor: animal.sex === 'M' ? '#3B82F6' : '#E5E7EB' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: animal.sex === 'M' ? '#3B82F6' : '#9CA3AF' }}>♂ Macho</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateAnimal(i, { sex: 'F' })}
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', borderWidth: 2, backgroundColor: animal.sex === 'F' ? '#FDF2F8' : '#fff', borderColor: animal.sex === 'F' ? '#EC4899' : '#E5E7EB' }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: animal.sex === 'F' ? '#EC4899' : '#9CA3AF' }}>♀ Hembra</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14 }}
                    placeholder="Descripción opcional (color, personalidad, etc.)"
                    value={animal.description}
                    onChangeText={(v) => updateAnimal(i, { description: v })}
                  />
                </>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={{
              backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', marginTop: 8, marginBottom: 40,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={handlePublish}
            disabled={loading || loadingPets}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>🌱 Publicar camada</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
