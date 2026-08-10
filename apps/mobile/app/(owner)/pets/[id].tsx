import { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Animated, Modal, Linking, TextInput, KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  doc, getDoc, updateDoc, deleteField, collection, query, where, getDocs, onSnapshot
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import YearCalendar from '../../../components/YearCalendar';
import CompleteReminderModal from '../../../components/CompleteReminderModal';
import { getVisitSection, SECTION_META, SECTION_ORDER, VISIT_REASON_ICONS, type VisitSection } from '../../../lib/visitReasons';
import type { Pet, Reminder } from '@junglapp/types';

// deceasedAt is stored as YYYY-MM-DD, shown to the user as DD-MM-YYYY.
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
}

const { db } = initFirebase();

interface VisitEntry {
  id: string;
  date: string;
  vetName: string;
  source: 'owner' | 'vet';
  visitReason?: string;
  notes?: string;
  diagnosis?: string;
  treatment?: string;
  prescriptionUrl?: string | null;
  nextControlDate?: string | null;
}

const DESC_CHIPS = [
  { emoji: '👑', text: 'Se cree el/la dueño/a de la casa' },
  { emoji: '😴', text: 'Experto/a en siestas épicas' },
  { emoji: '🎾', text: 'Rey/Reina del parque' },
  { emoji: '🍕', text: 'Come más que toda la familia' },
  { emoji: '🐾', text: 'Especialista en robar calcetines' },
  { emoji: '🎭', text: 'Actor/actriz dramático/a de nivel Oscar' },
  { emoji: '🛋️', text: 'El sofá es su trono oficial' },
  { emoji: '🌧️', text: 'Odia la lluvia con toda su alma' },
  { emoji: '🤗', text: 'Reparte abrazos gratis todo el día' },
  { emoji: '🔔', text: 'Avisa cuando llega alguien (o cuando no)' },
];

const DescChips = memo(function DescChips({ onSelect }: { onSelect: (text: string, emoji: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {DESC_CHIPS.map(({ emoji, text }) => (
          <TouchableOpacity
            key={text}
            onPress={() => onSelect(text, emoji)}
            style={{ backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ fontSize: 16 }}>{emoji}</Text>
            <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
});

export default function PetDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [visits, setVisits] = useState<VisitEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLost, setIsLost] = useState(false);
  const [showDeceasedCalendar, setShowDeceasedCalendar] = useState(false);
  const [showFlame, setShowFlame] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<VisitEntry | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [editingPhysical, setEditingPhysical] = useState(false);
  const [physSex, setPhysSex] = useState<'M' | 'F' | ''>('');
  const [physWeight, setPhysWeight] = useState('');
  const [physAllergic, setPhysAllergic] = useState(false);
  const [physAllergyNotes, setPhysAllergyNotes] = useState('');
  const [savingPhysical, setSavingPhysical] = useState(false);

  const flameScale = useRef(new Animated.Value(0)).current;
  const flameOpacity = useRef(new Animated.Value(0)).current;

  const handleChipSelect = useCallback((text: string, emoji: string) => {
    setDescInput((prev) => prev ? `${prev} ${emoji} ${text}` : `${emoji} ${text}`);
  }, []);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.PETS, id)).then((snap) => {
      if (snap.exists()) setPet({ id: snap.id, ...snap.data() } as Pet);
      setLoading(false);
    }).catch(() => setLoading(false));
    // Live listener, not a one-shot read — the "extraviada" badge must stay
    // in sync if the report is cancelled/found from another screen or a
    // stale mount, otherwise it can keep showing (or hiding) the wrong state.
    const unsubLost = onSnapshot(
      query(collection(db, COLLECTIONS.LOST_PETS), where('petId', '==', id)),
      (snap) => setIsLost(snap.docs.some((d) => d.data().isFound === false)),
      () => {}
    );
    return unsubLost;
  }, [id]);

  // Pending vaccine/control reminders for this pet — same source the home
  // banner reads from, so "marcar como realizada" from either screen stays in sync.
  useEffect(() => {
    if (!id || !user) return;
    const unsub = onSnapshot(
      query(collection(db, COLLECTIONS.REMINDERS), where('petId', '==', id), where('ownerId', '==', user.uid)),
      (snap) => setReminders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reminder)).filter((r) => !r.done)),
      () => {}
    );
    return unsub;
  }, [id, user?.uid]);

  // Reload visit history every time this screen comes into focus (e.g. after adding a visit).
  useFocusEffect(useCallback(() => {
    if (!id || !user) return;
    let cancelled = false;

    async function loadVisits() {
      const ownerVisits: VisitEntry[] = [];
      const vetVisits: VisitEntry[] = [];

      // Medical visits registered by the owner
      try {
        const visitsSnap = await getDocs(query(
          collection(db, COLLECTIONS.MEDICAL_VISITS),
          where('petId', '==', id),
          where('ownerId', '==', user!.uid),
        ));
        visitsSnap.docs.forEach((d) => {
          const v = d.data();
          ownerVisits.push({
            id: d.id, source: 'owner',
            date: v.date ?? '', vetName: v.vetName ?? 'Veterinario',
            visitReason: v.visitReason,
            notes: v.notes, prescriptionUrl: v.prescriptionUrl,
            nextControlDate: v.nextControlDate,
          });
        });
      } catch (e: any) {
        if (__DEV__) console.log('medicalVisits query error:', e.code, e.message);
      }

      // Completed vet appointments that include a consultation record
      try {
        const apptsSnap = await getDocs(query(
          collection(db, COLLECTIONS.APPOINTMENTS),
          where('petId', '==', id),
          where('ownerId', '==', user!.uid),
        ));
        apptsSnap.docs
          .filter((d) => d.data().status === 'completed' && d.data().consultation)
          .forEach((d) => {
            const a = d.data();
            vetVisits.push({
              id: d.id, source: 'vet',
              date: a.date ?? '', vetName: a.vetName ?? 'Veterinario JunglApp',
              visitReason: a.consultation?.visitReason,
              diagnosis: a.consultation?.diagnosis,
              treatment: a.consultation?.treatmentDone || a.consultation?.treatment,
              prescriptionUrl: a.consultation?.prescriptionImageUrl,
            });
          });
      } catch (e: any) {
        if (__DEV__) console.log('appointments query error:', e.code, e.message);
      }

      if (!cancelled) {
        setVisits([...ownerVisits, ...vetVisits].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));
      }
    }

    loadVisits();
    return () => { cancelled = true; };
  }, [id, user?.uid]));

  function triggerFlameAndNavigate() {
    setShowFlame(true);
    flameScale.setValue(0);
    flameOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(flameScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.timing(flameOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.delay(700),
      Animated.timing(flameOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      setShowFlame(false);
      router.push(`/(owner)/pets/match-profile?petId=${id}` as any);
    });
  }

  async function handleHeartPress() {
    if (!pet || !id) return;
    if (pet.lookingForPartner) {
      // Already active — ask to deactivate
      Alert.alert(
        '💔 Dejar de buscar pareja',
        `¿Deseas que ${pet.name} deje de aparecer en Match?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sí, desactivar',
            style: 'destructive',
            onPress: async () => {
              await updateDoc(doc(db, COLLECTIONS.PETS, id), { lookingForPartner: false });
              setPet({ ...pet, lookingForPartner: false });
            },
          },
        ]
      );
    } else {
      const updates: any = { lookingForPartner: true };
      // Denormalize the owner's location/regionKey/phone onto the pet so Match
      // candidates (readable by any owner) can show a distance badge, be
      // filtered by region, and let a matched owner see a contact number —
      // all without exposing the owner's full profile (users/{uid} isn't
      // readable owner-to-owner, see firestore.rules).
      if ((user as any)?.location) updates.location = (user as any).location;
      if ((user as any)?.regionKey) updates.regionKey = (user as any).regionKey;
      if (user?.phone) updates.ownerPhone = user.phone;
      await updateDoc(doc(db, COLLECTIONS.PETS, id), updates);
      setPet({ ...pet, ...updates });
      triggerFlameAndNavigate();
    }
  }

  // Change main photo or add a new one to the pet gallery
  function changePhoto() {
    if (!pet || !id) return;
    Alert.alert('📷 Foto de mascota', '¿Qué deseas hacer?', [
      {
        text: 'Tomar foto', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!r.canceled) await savePhoto(r.assets[0].uri);
        },
      },
      {
        text: 'Elegir de galería', onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!r.canceled) await savePhoto(r.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function savePhoto(uri: string) {
    if (!pet || !id) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(uri);
      // New photo becomes the main photo; previous ones stay in the gallery
      const photos = [url, ...(pet.photos ?? [])];
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { photos });
      setPet({ ...pet, photos });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handleLostReport() {
    if (isLost) {
      Alert.alert('🔍 Ya reportada', `${pet?.name} ya está publicada como extraviada. ¿Deseas cancelar el reporte?`, [
        { text: 'Mantener reporte', style: 'cancel' },
        {
          text: 'Cancelar reporte', style: 'destructive',
          onPress: async () => {
            const snap = await getDocs(query(
              collection(db, COLLECTIONS.LOST_PETS),
              where('petId', '==', id)
            ));
            for (const d of snap.docs.filter((d) => !d.data().isFound)) {
              await updateDoc(doc(db, COLLECTIONS.LOST_PETS, d.id), { isFound: true });
            }
            setIsLost(false);
          },
        },
      ]);
    } else {
      router.push(`/(owner)/lost/report?petId=${id}` as any);
    }
  }

  function handleDeceasedPress() {
    if (pet?.deceasedAt) {
      Alert.alert(
        '🕊️ Fallecimiento registrado',
        `Falleció el ${toDisplayDate(pet.deceasedAt)}. Mientras esté registrado, no aparecerá disponible para agendar citas médicas.`,
        [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Editar fecha', onPress: () => setShowDeceasedCalendar(true) },
          { text: 'Quitar registro', style: 'destructive', onPress: clearDeceased },
        ]
      );
    } else {
      setShowDeceasedCalendar((v) => !v);
    }
  }

  async function saveDeceasedDate(dateString: string) {
    if (!id || !pet) return;
    setShowDeceasedCalendar(false);
    try {
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { deceasedAt: dateString });
      setPet({ ...pet, deceasedAt: dateString });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function clearDeceased() {
    if (!id || !pet) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { deceasedAt: deleteField() });
      setPet({ ...pet, deceasedAt: undefined });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || !id || !pet) return;
    setSavingName(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { name: trimmed });
      setPet({ ...pet, name: trimmed });
      setEditingName(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingName(false);
    }
  }

  async function saveDescription() {
    if (!id || !pet) return;
    const trimmed = descInput.trim();
    setSavingDesc(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { description: trimmed });
      setPet({ ...pet, description: trimmed });
      setEditingDesc(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingDesc(false);
    }
  }

  async function savePhysical() {
    if (!id || !pet) return;
    setSavingPhysical(true);
    try {
      const updates: Record<string, any> = {
        sex: physSex || null,
        weight: physWeight ? parseFloat(physWeight) : null,
        allergic: physAllergic,
        allergyNotes: physAllergic ? physAllergyNotes : '',
      };
      await updateDoc(doc(db, COLLECTIONS.PETS, id), updates);
      setPet({ ...pet, ...updates });
      setEditingPhysical(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPhysical(false);
    }
  }

  function openPhysicalEdit() {
    if (!pet) return;
    setPhysSex((pet.sex as 'M' | 'F' | '') ?? '');
    setPhysWeight(pet.weight != null ? String(pet.weight) : '');
    setPhysAllergic(pet.allergic ?? false);
    setPhysAllergyNotes(pet.allergyNotes ?? '');
    setEditingPhysical(true);
  }

  if (loading) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );
  if (!pet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Mascota no encontrada</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Flame overlay */}
      <Modal transparent visible={showFlame} animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text style={{
            fontSize: 120,
            transform: [{ scale: Animated.multiply(flameScale, new Animated.Value(1.5)) }],
            opacity: flameOpacity,
          }}>
            🔥
          </Animated.Text>
          <Animated.Text style={{ fontSize: 22, color: '#fff', fontWeight: 'bold', marginTop: 12, opacity: flameOpacity }}>
            ¡A buscar pareja!
          </Animated.Text>
        </View>
      </Modal>

      {/* Visit detail modal */}
      <Modal
        visible={!!selectedVisit}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedVisit(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>
                🩺 Detalle de consulta
              </Text>
              <TouchableOpacity onPress={() => setSelectedVisit(null)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedVisit && (
                <View style={{ gap: 12 }}>
                  {/* Vet + date */}
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 2 }}>Veterinario</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B' }}>{selectedVisit.vetName}</Text>
                    <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{selectedVisit.date}</Text>
                    <Text style={{ fontSize: 11, color: selectedVisit.source === 'vet' ? '#3B82F6' : '#94A3B8', marginTop: 2 }}>
                      {selectedVisit.source === 'vet' ? 'Consulta agendada vía JunglApp ✓' : 'Registrada por ti'}
                    </Text>
                  </View>

                  {/* Reason */}
                  {selectedVisit.visitReason ? (
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 18 }}>{VISIT_REASON_ICONS[selectedVisit.visitReason] ?? '📋'}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{selectedVisit.visitReason}</Text>
                    </View>
                  ) : null}

                  {/* Diagnosis */}
                  {selectedVisit.diagnosis ? (
                    <View style={{ backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12 }}>
                      <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600', marginBottom: 4 }}>Diagnóstico</Text>
                      <Text style={{ fontSize: 14, color: '#1E293B' }}>{selectedVisit.diagnosis}</Text>
                    </View>
                  ) : null}

                  {/* Treatment */}
                  {selectedVisit.treatment ? (
                    <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12 }}>
                      <Text style={{ fontSize: 12, color: '#16A34A', fontWeight: '600', marginBottom: 4 }}>Tratamiento</Text>
                      <Text style={{ fontSize: 14, color: '#1E293B' }}>{selectedVisit.treatment}</Text>
                    </View>
                  ) : null}

                  {/* Notes */}
                  {selectedVisit.notes ? (
                    <View style={{ backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 }}>Notas</Text>
                      <Text style={{ fontSize: 14, color: '#1E293B' }}>{selectedVisit.notes}</Text>
                    </View>
                  ) : null}

                  {/* Next control */}
                  {selectedVisit.nextControlDate ? (
                    <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
                      <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '600', marginBottom: 4 }}>📅 Próximo control</Text>
                      <Text style={{ fontSize: 14, color: '#92400E', fontWeight: '700' }}>{selectedVisit.nextControlDate}</Text>
                    </View>
                  ) : null}

                  {/* Prescription */}
                  {selectedVisit.prescriptionUrl ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(selectedVisit.prescriptionUrl!)}
                      style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#BBF7D0' }}
                    >
                      <Text style={{ fontSize: 24 }}>📄</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#166534', fontSize: 14 }}>Ver receta médica</Text>
                        <Text style={{ fontSize: 11, color: '#4ADE80', marginTop: 2 }}>Toca para abrir el archivo</Text>
                      </View>
                      <Text style={{ color: '#4ADE80', fontSize: 18 }}>›</Text>
                    </TouchableOpacity>
                  ) : null}

                  {!selectedVisit.visitReason && !selectedVisit.diagnosis && !selectedVisit.treatment && !selectedVisit.notes && !selectedVisit.prescriptionUrl && (
                    <Text style={{ color: '#94A3B8', textAlign: 'center', paddingVertical: 16 }}>Sin detalles adicionales registrados</Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit name modal */}
      <Modal visible={editingName} animationType="slide" transparent onRequestClose={() => setEditingName(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>✏️ Editar nombre</Text>
              <TouchableOpacity onPress={() => setEditingName(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#2D6A4F', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 16 }}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={saveName}
              placeholder="Nombre de tu mascota"
            />
            <TouchableOpacity
              onPress={saveName}
              disabled={savingName || !nameInput.trim()}
              style={{ backgroundColor: savingName || !nameInput.trim() ? '#9CA3AF' : '#2D6A4F', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{savingName ? 'Guardando...' : '✅ Guardar nombre'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit description modal */}
      <Modal visible={editingDesc} animationType="slide" transparent onRequestClose={saveDescription}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>🐾 Cuéntanos sobre {pet?.name}</Text>
              <TouchableOpacity onPress={saveDescription} style={{ padding: 4 }}>
                <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>Toca una frase para agregarla o escribe tu propia descripción</Text>
            <DescChips onSelect={handleChipSelect} />
            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#2D6A4F', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1E293B', minHeight: 100, textAlignVertical: 'top', marginBottom: 16 }}
              value={descInput}
              onChangeText={setDescInput}
              multiline
              placeholder="Escribe algo especial sobre tu mascota..."
              autoFocus
            />
            <TouchableOpacity
              onPress={saveDescription}
              disabled={savingDesc}
              style={{ backgroundColor: savingDesc ? '#9CA3AF' : '#2D6A4F', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{savingDesc ? 'Guardando...' : '✅ Guardar descripción'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit physical data modal */}
      <Modal visible={editingPhysical} animationType="slide" transparent onRequestClose={() => setEditingPhysical(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>📋 Datos físicos</Text>
              <TouchableOpacity onPress={() => setEditingPhysical(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Sex */}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Sexo</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[{ id: 'M', label: '♂ Macho' }, { id: 'F', label: '♀ Hembra' }].map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: physSex === s.id ? '#2D6A4F' : '#E5E7EB', backgroundColor: physSex === s.id ? '#2D6A4F' : 'white', alignItems: 'center' }}
                  onPress={() => setPhysSex(s.id as 'M' | 'F')}
                >
                  <Text style={{ fontWeight: '600', color: physSex === s.id ? 'white' : '#6B7280' }}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Weight */}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Peso (kg)</Text>
            <TextInput
              style={{ height: 48, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: '#1F2937', backgroundColor: 'white', marginBottom: 16 }}
              placeholder="4.5"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              value={physWeight}
              onChangeText={setPhysWeight}
            />

            {/* Allergic */}
            <View style={{ backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FCA5A5', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', color: '#1F2937', fontSize: 15 }}>⚠️ Es alérgico/a</Text>
                <Switch
                  value={physAllergic}
                  onValueChange={setPhysAllergic}
                  trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
                  thumbColor={physAllergic ? '#EF4444' : '#F3F4F6'}
                />
              </View>
              {physAllergic && (
                <TextInput
                  style={{ marginTop: 10, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#1F2937', textAlignVertical: 'top', minHeight: 64, backgroundColor: 'white' }}
                  placeholder="Describe las alergias conocidas..."
                  placeholderTextColor="#FCA5A5"
                  multiline
                  maxLength={120}
                  value={physAllergyNotes}
                  onChangeText={setPhysAllergyNotes}
                />
              )}
              {physAllergic && (
                <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 }}>{physAllergyNotes.length}/120</Text>
              )}
            </View>

            <TouchableOpacity
              onPress={savePhysical}
              disabled={savingPhysical}
              style={{ backgroundColor: savingPhysical ? '#9CA3AF' : '#2D6A4F', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{savingPhysical ? 'Guardando...' : '✅ Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView className="flex-1">
        {/* Header photo — explicit pixel height so the image also renders on web */}
        <View
          className={`items-center justify-center ${isLost ? 'bg-red-400' : 'bg-primary-500'}`}
          style={{ height: 256 }}
        >
          {pet.photos && pet.photos.length > 0 ? (
            <Image source={{ uri: pet.photos[0] }} style={{ width: '100%', height: 256 }} contentFit="cover" />
          ) : (
            <Text className="text-8xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
          )}
          {isLost && (
            <View className="absolute bottom-4 bg-red-600 px-4 py-1.5 rounded-full">
              <Text className="text-white text-xs font-bold">🔍 EXTRAVIADA — Publicada</Text>
            </View>
          )}
          {/* Change / upload photo */}
          <TouchableOpacity
            onPress={changePhoto}
            disabled={uploadingPhoto}
            style={{
              position: 'absolute', bottom: 12, right: 12,
              backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 16 }}>📷</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2D6A4F' }}>
              {uploadingPhoto ? 'Subiendo...' : pet.photos?.length ? 'Cambiar foto' : 'Subir foto'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="absolute top-10 left-4 bg-white/90 rounded-full p-3"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}
          onPress={() => from === 'home' ? router.navigate('/(owner)' as any) : router.back()}
          hitSlop={12}
        >
          <Text className="text-primary-700 text-2xl leading-none px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-6">
          {/* Name card */}
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 mr-4">
                <TouchableOpacity
                  onPress={() => { setNameInput(pet.name); setEditingName(true); }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text className="text-3xl font-bold text-gray-800">{pet.name}</Text>
                  <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 4 }}>✏️</Text>
                </TouchableOpacity>
                <Text className="text-gray-500 mt-1">{pet.breed} · {pet.color}</Text>
              </View>
              {/* Heart / Match button */}
              <TouchableOpacity
                style={{
                  borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
                  backgroundColor: pet.lookingForPartner ? '#fdf2f8' : '#f9fafb',
                  borderWidth: 2,
                  borderColor: pet.lookingForPartner ? '#f9a8d4' : '#e5e7eb',
                }}
                onPress={handleHeartPress}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 30 }}>{pet.lookingForPartner ? '❤️' : '🤍'}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', marginTop: 4, color: pet.lookingForPartner ? '#ec4899' : '#9ca3af' }}>
                  {pet.lookingForPartner ? 'En Match' : 'Buscar pareja'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Photo gallery */}
          {pet.photos && pet.photos.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {pet.photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 12 }} contentFit="cover" />
                ))}
              </View>
            </ScrollView>
          )}

          {/* Lost report button */}
          <TouchableOpacity
            className={`rounded-2xl py-4 px-5 mb-4 flex-row items-center gap-3 ${isLost ? 'bg-red-50 border-2 border-red-300' : 'bg-orange-50 border-2 border-orange-200'}`}
            onPress={handleLostReport}
          >
            <Text className="text-3xl">{isLost ? '🔍' : '🚨'}</Text>
            <View className="flex-1">
              <Text className={`font-bold text-base ${isLost ? 'text-red-600' : 'text-orange-600'}`}>
                {isLost ? 'Extraviada — Publicada' : 'Reportar como Extraviada'}
              </Text>
              <Text className={`text-xs mt-0.5 ${isLost ? 'text-red-400' : 'text-orange-400'}`}>
                {isLost ? 'Toca para cancelar el reporte' : 'Notifica a usuarios cercanos'}
              </Text>
            </View>
            <Text className={isLost ? 'text-red-400' : 'text-orange-400'}>›</Text>
          </TouchableOpacity>

          {/* Deceased pet registration */}
          <TouchableOpacity
            className={`rounded-2xl py-4 px-5 mb-2 flex-row items-center gap-3 ${pet.deceasedAt ? 'bg-gray-100 border-2 border-gray-300' : 'bg-gray-50 border-2 border-gray-200'}`}
            onPress={handleDeceasedPress}
          >
            <Text className="text-3xl">🕊️</Text>
            <View className="flex-1">
              <Text className={`font-bold text-base ${pet.deceasedAt ? 'text-gray-600' : 'text-gray-500'}`}>
                {pet.deceasedAt ? `Falleció el ${toDisplayDate(pet.deceasedAt)}` : 'Registrar fallecimiento'}
              </Text>
              <Text className="text-xs mt-0.5 text-gray-400">
                {pet.deceasedAt ? 'Toca para editar o quitar el registro' : 'Deja de estar disponible para agendar citas médicas'}
              </Text>
            </View>
            <Text className="text-gray-400">›</Text>
          </TouchableOpacity>

          {showDeceasedCalendar && (
            <View className="mb-4 rounded-2xl overflow-hidden border border-gray-200">
              <YearCalendar
                onDayPress={(day) => saveDeceasedDate(day.dateString)}
                maxDate={new Date().toISOString().slice(0, 10)}
                initialDate={pet.deceasedAt || undefined}
                markedDates={pet.deceasedAt ? { [pet.deceasedAt]: { selected: true, selectedColor: '#6B7280' } } : {}}
                color="#6B7280"
              />
            </View>
          )}

          {/* Info grid */}
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">Nacimiento</Text>
              <Text className="font-semibold text-gray-800 mt-1">{pet.birthDate}</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">En familia desde</Text>
              <Text className="font-semibold text-gray-800 mt-1">{pet.familyDate}</Text>
            </View>
          </View>

          {/* Sex / Weight / Allergic row */}
          <TouchableOpacity
            onPress={openPhysicalEdit}
            activeOpacity={0.75}
            style={{ backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F0FDF4', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ color: '#6B7280', fontSize: 12 }}>Datos físicos</Text>
              <Text style={{ fontSize: 12, color: '#2D6A4F', fontWeight: '600' }}>✏️ Editar</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>Sexo</Text>
                <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginTop: 2 }}>
                  {pet.sex === 'M' ? '♂ Macho' : pet.sex === 'F' ? '♀ Hembra' : '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>Peso</Text>
                <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginTop: 2 }}>
                  {pet.weight != null ? `${pet.weight} kg` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>Alérgico</Text>
                <Text style={{ fontWeight: '700', color: pet.allergic ? '#EF4444' : '#1F2937', fontSize: 14, marginTop: 2 }}>
                  {pet.allergic == null ? '—' : pet.allergic ? 'Sí ⚠️' : 'No'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {pet.allergic && pet.allergyNotes ? (
            <View style={{ backgroundColor: '#FFF5F5', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>⚠️ Alergias declaradas</Text>
              <Text style={{ color: '#7F1D1D', fontSize: 14 }}>{pet.allergyNotes}</Text>
            </View>
          ) : null}

          {pet.chipNumber && (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">Número de Chip</Text>
              <Text className="font-semibold text-gray-800 mt-1 font-mono">{pet.chipNumber}</Text>
            </View>
          )}

          {pet.instagram && (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">Instagram</Text>
              <Text className="font-semibold text-gray-800 mt-1">
                📸 {pet.instagram.replace(/^@/, '')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => { setDescInput(pet.description ?? ''); setEditingDesc(true); }}
            activeOpacity={0.75}
            className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100"
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text className="text-gray-400 text-xs">Descripción</Text>
              <Text style={{ fontSize: 12, color: '#2D6A4F', fontWeight: '600' }}>✏️ Editar</Text>
            </View>
            {pet.description ? (
              <Text className="text-gray-700">{pet.description}</Text>
            ) : (
              <Text style={{ color: '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>Toca para contar algo especial sobre {pet.name} 🐾</Text>
            )}
          </TouchableOpacity>

          {/* Medical record */}
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-700 font-semibold text-base">Ficha Médica 🏥</Text>
            <TouchableOpacity
              className="bg-primary-500 rounded-xl px-4 py-2"
              onPress={() => router.push(`/(owner)/pets/add-visit?petId=${id}` as any)}
            >
              <Text className="text-white text-xs font-semibold">+ Registrar visita</Text>
            </TouchableOpacity>
          </View>

          {(pet.medicalRecord?.allergies ?? []).length > 0 && (
            <View className="bg-red-50 rounded-2xl p-4 mb-4 border border-red-100">
              <Text className="text-red-500 text-xs mb-2 font-medium">⚠️ Alergias</Text>
              <Text className="text-red-700">{(pet.medicalRecord?.allergies ?? []).join(', ')}</Text>
            </View>
          )}

          {(pet.medicalRecord?.conditions ?? []).length > 0 && (
            <View className="bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-100">
              <Text className="text-amber-600 text-xs mb-2 font-medium">📋 Condiciones</Text>
              <Text className="text-amber-700">{(pet.medicalRecord?.conditions ?? []).join(', ')}</Text>
            </View>
          )}

          {/* Visit history, grouped into Vacunas / Control antiparasitario / Consultas generales */}
          {SECTION_ORDER.map((section) => {
            const sectionVisits = visits.filter((v) => getVisitSection(v.visitReason) === section);
            const sectionReminder = reminders
              .filter((r) => getVisitSection(r.visitReason) === section)
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            const meta = SECTION_META[section as VisitSection];
            const todayStr = new Date().toISOString().split('T')[0];

            return (
              <View key={section} className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
                  <Text className="text-gray-700 font-semibold text-sm">{meta.title}</Text>
                  <Text className="text-gray-400 text-xs">({sectionVisits.length})</Text>
                </View>

                {sectionReminder && (
                  <TouchableOpacity
                    onPress={() => setActiveReminder(sectionReminder)}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: sectionReminder.date < todayStr ? '#FEF2F2' : '#FFFBEB',
                      borderWidth: 1, borderColor: sectionReminder.date < todayStr ? '#FECACA' : '#FDE68A',
                      borderRadius: 12, padding: 10, marginBottom: 10,
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>🔔</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 12, color: sectionReminder.date < todayStr ? '#DC2626' : '#92400E' }}>
                        Próxima dosis: {sectionReminder.date}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Toca para marcar como realizada</Text>
                    </View>
                    <Text style={{ color: '#D1D5DB', fontSize: 16 }}>›</Text>
                  </TouchableOpacity>
                )}

                {sectionVisits.length === 0 ? (
                  <View className="items-center py-4">
                    <Text className="text-gray-300 text-4xl mb-2">{meta.emoji}</Text>
                    <Text className="text-gray-400 text-sm">Sin registros aún</Text>
                  </View>
                ) : (
                  sectionVisits.map((v) => (
                    <TouchableOpacity
                      key={`${v.source}-${v.id}`}
                      onPress={() => setSelectedVisit(v)}
                      activeOpacity={0.7}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 13 }}>🩺 {v.vetName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ color: '#94A3B8', fontSize: 12 }}>{v.date}</Text>
                          <Text style={{ color: '#CBD5E1', fontSize: 16 }}>›</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, marginTop: 2, color: v.source === 'vet' ? '#3B82F6' : '#94A3B8' }}>
                        {v.source === 'vet' ? 'Consulta agendada vía JunglApp ✓' : 'Registrada por ti'}
                      </Text>
                      {v.visitReason ? (
                        <Text style={{ color: '#374151', fontSize: 11, marginTop: 2, fontWeight: '600' }}>
                          {VISIT_REASON_ICONS[v.visitReason] ?? '📋'} {v.visitReason}
                        </Text>
                      ) : null}
                      {v.diagnosis ? <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }} numberOfLines={1}>Diagnóstico: {v.diagnosis}</Text> : null}
                      {v.prescriptionUrl ? <Text style={{ color: '#059669', fontSize: 11, marginTop: 2 }}>📎 Ver receta</Text> : null}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            );
          })}

          {pet.medicalRecord?.notes && (
            <View className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs mb-1">Notas médicas</Text>
              <Text className="text-gray-700">{pet.medicalRecord.notes}</Text>
            </View>
          )}

          <View className="h-8" />
        </View>
      </ScrollView>

      <CompleteReminderModal
        visible={!!activeReminder}
        reminder={activeReminder}
        petName={pet.name}
        onClose={() => setActiveReminder(null)}
        onCompleted={() => setActiveReminder(null)}
      />
    </SafeAreaView>
  );
}
