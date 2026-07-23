import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, FlatList } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../../context/AuthContext';
import { locationKeys } from '../../../../lib/locationKey';
import type { CommunityEvent } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#0E7490';

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Lightweight month calendar so we don't pull in react-native-calendars just
// for a single date picker — the event form only needs day selection, no
// range/availability logic like the vet-visit flow.
function SimpleMonthCalendar({ value, onSelect }: { value: string; onSelect: (date: string) => void }) {
  const [cursor, setCursor] = useState(() => {
    const base = value ? new Date(value + 'T00:00:00') : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const min = todayISO();

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setCursor(new Date(year, month - 1, 1))} hitSlop={10}>
          <Text style={{ fontSize: 18, color: GREEN }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontWeight: '700', color: '#1E293B', textTransform: 'capitalize' }}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => setCursor(new Date(year, month + 1, 1))} hitSlop={10}>
          <Text style={{ fontSize: 18, color: GREEN }}>›</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, idx) => {
          if (day == null) return <View key={idx} style={{ width: '14.28%', height: 36 }} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const disabled = dateStr < min;
          const selected = dateStr === value;
          return (
            <TouchableOpacity
              key={idx}
              disabled={disabled}
              onPress={() => onSelect(dateStr)}
              style={{
                width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                backgroundColor: selected ? GREEN : 'transparent',
              }}>
                <Text style={{ color: disabled ? '#CBD5E1' : selected ? '#fff' : '#1E293B', fontSize: 13, fontWeight: selected ? '700' : '400' }}>
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AddEventScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('Metropolitana');
  const [regionOpen, setRegionOpen] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      setPhotoUrl(url);
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { Alert.alert('Falta información', 'Ponle un nombre al evento.'); return; }
    if (!place.trim()) { Alert.alert('Falta información', 'Indica el lugar del evento.'); return; }
    if (!eventDate) { Alert.alert('Falta información', 'Selecciona la fecha del evento.'); return; }

    setSaving(true);
    try {
      const { regionKey } = locationKeys(undefined, region);
      const newEvent: Omit<CommunityEvent, 'id'> = {
        name: name.trim(),
        place: place.trim(),
        address: address.trim(),
        region,
        regionKey,
        ...(photoUrl ? { photoUrl } : {}),
        eventDate,
        expiresAt: new Date(eventDate + 'T23:59:59').toISOString(),
        ...(description.trim() ? { description: description.trim() } : {}),
        createdBy: user.uid,
        createdByName: user.name || 'Usuario',
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, COLLECTIONS.EVENTS), newEvent);
      router.replace(`/(owner)/near/event/${ref.id}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || uploadingPhoto;
  const formattedDate = eventDate
    ? new Date(eventDate + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GREEN }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: GREEN }}>+ Crear evento</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>
            Tu evento quedará visible para la comunidad hasta el fin del día en que se realiza.
          </Text>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Foto del evento (opcional)</Text>
          <TouchableOpacity
            onPress={pickPhoto}
            disabled={uploadingPhoto}
            style={{
              width: '100%', height: 160, borderRadius: 14, marginBottom: 18,
              borderWidth: 1, borderColor: '#E5E7EB', borderStyle: photoUrl ? 'solid' : 'dashed',
              backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={GREEN} />
            ) : photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>📷</Text>
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Toca para agregar una foto</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Nombre del evento</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ej: Corrida con mascotas"
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Lugar</Text>
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="Ej: Parque Bustamante"
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Dirección</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Ej: Av. Bustamante 123"
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Región</Text>
          <TouchableOpacity
            onPress={() => setRegionOpen(true)}
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}
          >
            <Text style={{ fontSize: 16, color: '#1F2937' }}>{region}</Text>
            <Text style={{ color: '#94A3B8' }}>▾</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Fecha del evento</Text>
          <TouchableOpacity
            onPress={() => setShowCalendar(!showCalendar)}
            style={{ borderWidth: 1, borderColor: eventDate ? GREEN : '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: showCalendar ? 8 : 16 }}
          >
            <Text style={{ fontSize: 16 }}>📅</Text>
            <Text style={{ fontSize: 15, color: eventDate ? '#1F2937' : '#9CA3AF', fontWeight: eventDate ? '600' : '400' }}>
              {formattedDate || 'Seleccionar fecha'}
            </Text>
          </TouchableOpacity>
          {showCalendar && (
            <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, backgroundColor: '#fff', marginBottom: 16, overflow: 'hidden' }}>
              <SimpleMonthCalendar value={eventDate} onSelect={(d) => { setEventDate(d); setShowCalendar(false); }} />
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Consideraciones (opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ej: Traer correa, agua para tu mascota, cupos limitados..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff', color: '#1F2937', minHeight: 80, textAlignVertical: 'top', marginBottom: 24 }}
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={busy}
            style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Crear evento</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={regionOpen} transparent animationType="slide" onRequestClose={() => setRegionOpen(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setRegionOpen(false)}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' }}>
              <FlatList
                data={REGIONS}
                keyExtractor={(r) => r}
                renderItem={({ item: r }) => (
                  <TouchableOpacity
                    onPress={() => { setRegion(r); setRegionOpen(false); }}
                    style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: region === r ? '#ECFEFF' : '#fff' }}
                  >
                    <Text style={{ fontSize: 16, color: region === r ? GREEN : '#374151', fontWeight: region === r ? '600' : '400' }}>{r}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
