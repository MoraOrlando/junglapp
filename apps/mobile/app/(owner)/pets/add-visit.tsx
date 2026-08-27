import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, Linking
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import YearCalendar from '../../../components/YearCalendar';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import {
  collection, addDoc, updateDoc, deleteDoc, query, where, getDocs, orderBy, limit, doc, getDoc
} from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { getSortedAvailableSlots } from '../../../lib/distance';
import { VISIT_REASONS, reminderTypeForReason } from '../../../lib/visitReasons';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)}>
          <Text className="text-3xl">{star <= value ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function AddVisitScreen() {
  const { petId, visitId } = useLocalSearchParams<{ petId: string; visitId?: string }>();
  const isEditMode = !!visitId;
  const router = useRouter();
  const { user } = useAuth();

  const [loadingVisit, setLoadingVisit] = useState(isEditMode);
  const [visitReason, setVisitReason] = useState('');
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);
  // Defaults to today, but the visit may have happened in the past — the
  // owner is logging it after the fact, not booking it, so any past date
  // must be selectable (only future dates are blocked below via maxDate).
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [showVisitCalendar, setShowVisitCalendar] = useState(false);
  const [vetName, setVetName] = useState('');
  const [vetEmail, setVetEmail] = useState('');
  const [vetSuggestions, setVetSuggestions] = useState<Veterinarian[]>([]);
  const [selectedVet, setSelectedVet] = useState<Veterinarian | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptionUri, setPrescriptionUri] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [nextControlDate, setNextControlDate] = useState('');
  const [vetAvailability, setVetAvailability] = useState<string[] | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reminderAdded, setReminderAdded] = useState(false);

  // Edit mode: load the existing owner-logged visit and prefill the form.
  // Rating/review aren't stored fields meant to be re-edited here (the
  // review lives in its own collection with a one-per-vet rule), so they're
  // left at their defaults and that section of the form is hidden below.
  useEffect(() => {
    if (!visitId) return;
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, COLLECTIONS.MEDICAL_VISITS, visitId));
      if (cancelled) return;
      if (snap.exists()) {
        const v = snap.data();
        setVisitReason(v.visitReason ?? '');
        setVisitDate(v.date ?? new Date().toISOString().split('T')[0]);
        setVetName(v.vetName ?? '');
        setNotes(v.notes ?? '');
        setNextControlDate(v.nextControlDate ?? '');
        if (v.prescriptionUrl) setPrescriptionUri(v.prescriptionUrl);
        if (v.vetId) {
          const vetSnap = await getDoc(doc(db, COLLECTIONS.VETERINARIANS, v.vetId));
          if (!cancelled && vetSnap.exists()) setSelectedVet({ id: vetSnap.id, ...vetSnap.data() } as Veterinarian);
        }
      } else if (!cancelled) {
        Alert.alert('No encontrada', 'Esta visita ya no existe.', [{ text: 'OK', onPress: () => router.back() }]);
      }
      if (!cancelled) setLoadingVisit(false);
    })();
    return () => { cancelled = true; };
  }, [visitId]);

  // Autocomplete: search registered vets by name or email as user types
  useEffect(() => {
    if (vetName.length < 2) { setVetSuggestions([]); setSelectedVet(null); return; }
    const lower = vetName.toLowerCase();
    getDocs(query(
      collection(db, COLLECTIONS.VETERINARIANS),
      where('status', '==', 'approved'),
      limit(5)
    )).then((snap) => {
      const matches = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Veterinarian))
        .filter((v) => v.name.toLowerCase().includes(lower) || v.email?.toLowerCase().includes(lower));
      setVetSuggestions(matches);
    });
  }, [vetName]);

  // Check vet availability when date is selected
  async function handleDateSelect(day: { dateString: string }) {
    setNextControlDate(day.dateString);
    setShowCalendar(false);
    setVetAvailability(null);
    setReminderAdded(false);
    if (!selectedVet) return;

    setCheckingAvailability(true);
    const snap = await getDoc(doc(db, COLLECTIONS.VETERINARIANS, selectedVet.id));
    if (snap.exists()) {
      const vetData = snap.data();
      const slots: string[] = getSortedAvailableSlots(vetData?.availability, day.dateString);
      setVetAvailability(slots);
    }
    setCheckingAvailability(false);
  }

  async function pickPrescription() {
    Alert.alert('Subir receta', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setPrescriptionUri(result.assets[0].uri);
        },
      },
      {
        text: 'Galería', onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
          if (!result.canceled) setPrescriptionUri(result.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  // Adds the next-control reminder to the device calendar. Returns true on success.
  async function addToDeviceCalendar(silent = false): Promise<boolean> {
    try {
      const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        if (!silent) Alert.alert('Permiso denegado', 'No se pudo acceder al calendario.');
        return false;
      }
      const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
      const defaultCal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
      if (!defaultCal) return false;

      const date = new Date(nextControlDate + 'T10:00:00');
      await ExpoCalendar.createEventAsync(defaultCal.id, {
        title: `Control veterinario ${vetName ? `— ${vetName}` : ''}`,
        startDate: date,
        endDate: new Date(date.getTime() + 60 * 60 * 1000),
        notes: `Recordatorio de control veterinario registrado en JunglApp`,
        alarms: [{ relativeOffset: -60 }, { relativeOffset: -24 * 60 }],
      });
      if (!silent) Alert.alert('✅ Listo', 'Recordatorio agregado a tu calendario.');
      return true;
    } catch (e: any) {
      if (!silent) Alert.alert('Error', e.message);
      return false;
    }
  }

  // Stores an invite so the vet can be contacted to join JunglApp,
  // and opens the mail composer if an email was provided.
  async function inviteVet() {
    try {
      await addDoc(collection(db, COLLECTIONS.VET_INVITES), {
        vetName: vetName.trim(),
        vetEmail: vetEmail.trim() || null,
        invitedBy: user?.uid ?? null,
        invitedByName: user?.name ?? null,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    } catch {}
    if (vetEmail.trim()) {
      const subject = encodeURIComponent('Te invito a unirte a JunglApp 🐾');
      const body = encodeURIComponent(
        `Hola ${vetName.trim()},\n\nTe invito a registrarte en JunglApp, la app donde los dueños de mascotas pueden agendar y registrar sus visitas veterinarias contigo.\n\n¡Únete y haz crecer tu consulta!\n\nSaludos,\n${user?.name ?? ''}`
      );
      Linking.openURL(`mailto:${vetEmail.trim()}?subject=${subject}&body=${body}`).catch(() => {});
    }
  }

  async function handleBookNow() {
    if (!selectedVet || !nextControlDate) return;
    router.push(`/(owner)/vets/${selectedVet.id}?bookDate=${nextControlDate}` as any);
  }

  function handleSave() {
    if (!petId) return;
    if (!visitReason) { Alert.alert('Faltan datos', 'Por favor selecciona el motivo de la visita.'); return; }
    if (!visitDate) { Alert.alert('Faltan datos', 'Por favor selecciona la fecha en que ocurrió la visita.'); return; }

    if (isEditMode) { doUpdate(); return; }

    if (rating === 0) { Alert.alert('Faltan datos', 'Por favor califica el servicio.'); return; }
    if (!reviewComment.trim()) { Alert.alert('Faltan datos', 'Escribe un comentario sobre la atención.'); return; }

    // Vet entered manually and not found among registered vets → offer to invite
    if (!selectedVet && vetName.trim().length > 0) {
      Alert.alert(
        '🩺 Veterinario no registrado',
        `"${vetName.trim()}" no está registrado en JunglApp. ¿Deseas invitarlo a ser parte de JunglApp?`,
        [
          { text: 'Sí, invitar', onPress: async () => { await inviteVet(); await doSave(); } },
          { text: 'Continuar sin invitar', onPress: () => doSave() },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
      return;
    }
    doSave();
  }

  async function doSave() {
    setSaving(true);
    try {
      let prescriptionUrl: string | undefined;
      if (prescriptionUri) prescriptionUrl = await uploadImage(prescriptionUri);

      const visitDoc = await addDoc(collection(db, COLLECTIONS.MEDICAL_VISITS), {
        petId,
        ownerId: user?.uid ?? null,
        date: visitDate,
        visitReason,
        vetName: selectedVet?.name || vetName,
        vetId: selectedVet?.id || null,
        rating,
        notes,
        prescriptionUrl: prescriptionUrl || null,
        nextControlDate: nextControlDate || null,
        createdAt: new Date().toISOString(),
      });

      // The star rating above only means something as a real review when
      // it's tied to a registered vet (there's no vetId to attach one to
      // otherwise) — mirrors the one-review-per-owner-per-vet rule already
      // enforced in (owner)/vets/[id].tsx's canReview, so a visit logged
      // for a vet the owner already reviewed doesn't create a duplicate.
      let reviewMsg = '';
      if (selectedVet && user) {
        try {
          const existingReview = await getDocs(query(
            collection(db, COLLECTIONS.REVIEWS),
            where('vetId', '==', selectedVet.id),
            where('ownerId', '==', user.uid),
          ));
          if (existingReview.empty) {
            await addDoc(collection(db, COLLECTIONS.REVIEWS), {
              vetId: selectedVet.id,
              ownerId: user.uid,
              ownerName: user.name || 'Usuario',
              rating,
              comment: reviewComment.trim(),
              createdAt: new Date().toISOString(),
            });
          } else {
            reviewMsg = '\n\nYa habías calificado a este veterinario antes, así que no se duplicó la reseña.';
          }
        } catch {}
      }

      let calendarMsg = '';
      if (nextControlDate) {
        // In-app reminder: home screen shows a banner when the control date is near
        await addDoc(collection(db, COLLECTIONS.REMINDERS), {
          ownerId: user?.uid ?? null,
          petId,
          type: reminderTypeForReason(visitReason),
          visitReason,
          date: nextControlDate,
          vetName: selectedVet?.name || vetName || null,
          done: false,
          sourceVisitId: visitDoc.id,
          createdAt: new Date().toISOString(),
        });
        // Device calendar reminder
        const added = await addToDeviceCalendar(true);
        calendarMsg = added
          ? '\n\n📅 Se agregó un recordatorio del próximo control a tu calendario y la app te avisará cuando se acerque la fecha.'
          : '\n\n🔔 La app te avisará cuando se acerque la fecha del próximo control.';
      }

      Alert.alert('✅ Visita registrada', `La visita quedó guardada en la ficha médica.${reviewMsg}${calendarMsg}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  // Corrects a visit the owner already logged (typo in the date, wrong vet
  // name, etc). Only touches the MEDICAL_VISITS doc itself — the rating and
  // review it may have produced at creation time live in their own
  // collection and aren't re-opened here.
  async function doUpdate() {
    if (!visitId) return;
    setSaving(true);
    try {
      let prescriptionUrl: string | null | undefined;
      if (prescriptionUri && !prescriptionUri.startsWith('http')) {
        prescriptionUrl = await uploadImage(prescriptionUri);
      }

      await updateDoc(doc(db, COLLECTIONS.MEDICAL_VISITS, visitId), {
        date: visitDate,
        visitReason,
        vetName: selectedVet?.name || vetName,
        vetId: selectedVet?.id || null,
        notes,
        nextControlDate: nextControlDate || null,
        ...(prescriptionUrl !== undefined ? { prescriptionUrl } : {}),
      });

      // Keep an un-completed reminder created from this visit in sync if the
      // control date changed, instead of leaving it pointing at a stale date.
      if (nextControlDate) {
        const reminders = await getDocs(query(
          collection(db, COLLECTIONS.REMINDERS),
          where('sourceVisitId', '==', visitId),
          where('done', '==', false),
        ));
        await Promise.all(reminders.docs.map((d) => updateDoc(d.ref, {
          date: nextControlDate,
          vetName: selectedVet?.name || vetName || null,
        })));
      }

      Alert.alert('✅ Cambios guardados', 'La visita quedó actualizada.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!visitId) return;
    Alert.alert('Eliminar visita', '¿Seguro que quieres eliminar este registro de la ficha médica? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await deleteDoc(doc(db, COLLECTIONS.MEDICAL_VISITS, visitId));
            const reminders = await getDocs(query(
              collection(db, COLLECTIONS.REMINDERS),
              where('sourceVisitId', '==', visitId),
              where('done', '==', false),
            ));
            await Promise.all(reminders.docs.map((d) => deleteDoc(d.ref)));
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  if (loadingVisit) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-gray-400">Cargando visita...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-4">
            <Text className="text-primary-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-primary-700 mb-6">
            {isEditMode ? '✏️ Editar Visita' : '🏥 Registrar Visita'}
          </Text>

          {/* Visit reason */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Motivo de la visita <Text className="text-red-400">*</Text></Text>
            <TouchableOpacity
              className={`bg-white border rounded-xl px-4 py-3 flex-row items-center justify-between ${visitReason ? 'border-primary-400' : 'border-gray-200'}`}
              onPress={() => setShowReasonDropdown(!showReasonDropdown)}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-xl">🏥</Text>
                <Text className={visitReason ? 'text-gray-800 font-semibold' : 'text-gray-400'}>
                  {visitReason || 'Seleccionar motivo...'}
                </Text>
              </View>
              <Text className="text-gray-400">{showReasonDropdown ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showReasonDropdown && (
              <View className="bg-white border border-gray-200 rounded-xl mt-1 overflow-hidden">
                {VISIT_REASONS.map((reason) => (
                  <TouchableOpacity
                    key={reason}
                    className={`px-4 py-3 border-b border-gray-50 flex-row items-center gap-3 ${visitReason === reason ? 'bg-primary-50' : ''}`}
                    onPress={() => { setVisitReason(reason); setShowReasonDropdown(false); }}
                  >
                    <Text className={`text-base ${visitReason === reason ? 'text-primary-700 font-semibold' : 'text-gray-700'}`}>{reason}</Text>
                    {visitReason === reason && <Text className="text-primary-500 ml-auto">✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Visit date — defaults to today, but past dates are allowed since
              owners often log visits that already happened a while ago. */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Fecha de la visita <Text className="text-red-400">*</Text></Text>
            <TouchableOpacity
              className="bg-white border border-primary-400 rounded-xl px-4 py-3 flex-row items-center gap-3"
              onPress={() => setShowVisitCalendar(!showVisitCalendar)}
            >
              <Text className="text-xl">📅</Text>
              <Text className="text-primary-700 font-semibold">{visitDate}</Text>
            </TouchableOpacity>

            {showVisitCalendar && (
              <View className="mt-2 rounded-2xl overflow-hidden border border-gray-200">
                <YearCalendar
                  onDayPress={(day) => { setVisitDate(day.dateString); setShowVisitCalendar(false); }}
                  maxDate={new Date().toISOString().split('T')[0]}
                  initialDate={visitDate}
                  markedDates={{ [visitDate]: { selected: true, selectedColor: '#2D6A4F' } }}
                />
              </View>
            )}
          </View>

          {/* Prescription photo */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Foto de la receta (opcional)</Text>
            <TouchableOpacity
              className="border-2 border-dashed border-primary-300 rounded-2xl overflow-hidden items-center justify-center bg-green-50"
              style={{ height: 120 }}
              onPress={pickPrescription}
            >
              {prescriptionUri ? (
                <Image source={{ uri: prescriptionUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View className="items-center">
                  <Text className="text-3xl mb-1">📄</Text>
                  <Text className="text-primary-600 text-sm font-medium">Subir foto de receta</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Vet name with autocomplete */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Veterinario que la atendió</Text>
            <View className="relative">
              <View className="border border-gray-200 rounded-xl bg-white flex-row items-center px-4">
                <Text className="text-lg mr-2">🩺</Text>
                <TextInput
                  className="flex-1 py-3 text-base text-gray-800"
                  placeholder="Nombre del veterinario..."
                  value={selectedVet ? `Dr. ${selectedVet.name}` : vetName}
                  onChangeText={(t) => { setVetName(t); setSelectedVet(null); }}
                />
                {selectedVet && <Text className="text-green-500 text-lg">✓</Text>}
              </View>

              {/* Suggestions dropdown */}
              {vetSuggestions.length > 0 && !selectedVet && (
                <View className="bg-white border border-gray-200 rounded-xl mt-1 overflow-hidden">
                  {vetSuggestions.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      className="px-4 py-3 border-b border-gray-50 flex-row items-center gap-3"
                      onPress={() => { setSelectedVet(v); setVetName(v.name); setVetSuggestions([]); }}
                    >
                      <View className="bg-blue-100 rounded-full w-8 h-8 items-center justify-center">
                        <Text className="text-sm">🩺</Text>
                      </View>
                      <View>
                        <Text className="font-semibold text-gray-800">Dr. {v.name}</Text>
                        <Text className="text-gray-400 text-xs">{v.address}</Text>
                      </View>
                      <Text className="text-green-500 text-xs ml-auto">Registrado ✓</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {selectedVet && (
                <View className="mt-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <Text className="text-blue-700 text-xs font-medium">✓ Veterinario registrado en JunglApp</Text>
                  <Text className="text-blue-500 text-xs mt-0.5">{selectedVet.address}</Text>
                </View>
              )}

              {/* Manual vet → optional email to send an invite */}
              {!selectedVet && vetName.trim().length >= 2 && (
                <View className="mt-2">
                  <Text className="text-gray-400 text-xs mb-1">Correo del veterinario (opcional, para invitarlo a JunglApp)</Text>
                  <View className="border border-gray-200 rounded-xl bg-white flex-row items-center px-4">
                    <Text className="text-lg mr-2">✉️</Text>
                    <TextInput
                      className="flex-1 py-3 text-base text-gray-800"
                      placeholder="correo@veterinario.cl"
                      value={vetEmail}
                      onChangeText={setVetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Rating — only asked when logging a new visit; editing a
              record afterward is for correcting facts, not re-reviewing
              (the review lives in its own collection with a one-per-vet rule). */}
          {!isEditMode && (
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">¿Cómo fue el servicio? <Text className="text-red-400">*</Text></Text>
            <View className="bg-white border border-gray-200 rounded-xl p-4">
              <StarRating value={rating} onChange={setRating} />
              {rating > 0 && (
                <Text className="text-gray-400 text-xs mt-2">
                  {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'][rating]}
                </Text>
              )}
              <TextInput
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 mt-3"
                placeholder="Cuéntanos cómo fue la atención..."
                multiline
                numberOfLines={3}
                value={reviewComment}
                onChangeText={setReviewComment}
                style={{ minHeight: 70, textAlignVertical: 'top' }}
              />
            </View>
          </View>
          )}

          {/* Notes */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Notas de la visita (opcional)</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-base"
              placeholder="Diagnóstico, medicamentos recetados, observaciones..."
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          {/* Next control date */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Próximo control (opcional)</Text>
            <TouchableOpacity
              className={`bg-white border rounded-xl px-4 py-3 flex-row items-center gap-3 ${nextControlDate ? 'border-primary-400' : 'border-gray-200'}`}
              onPress={() => setShowCalendar(!showCalendar)}
            >
              <Text className="text-xl">📅</Text>
              <Text className={nextControlDate ? 'text-primary-700 font-semibold' : 'text-gray-400'}>
                {nextControlDate || 'Seleccionar fecha'}
              </Text>
              {nextControlDate && (
                <TouchableOpacity className="ml-auto" onPress={() => { setNextControlDate(''); setVetAvailability(null); }}>
                  <Text className="text-gray-400 text-sm">✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showCalendar && (
              <View className="mt-2 rounded-2xl overflow-hidden border border-gray-200">
                <YearCalendar
                  onDayPress={handleDateSelect}
                  minDate={new Date().toISOString().split('T')[0]}
                  markedDates={nextControlDate ? { [nextControlDate]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                />
              </View>
            )}

            {/* Availability feedback */}
            {nextControlDate && (
              <View className="mt-3">
                {checkingAvailability ? (
                  <Text className="text-gray-400 text-sm text-center">Consultando agenda...</Text>
                ) : selectedVet && vetAvailability !== null ? (
                  vetAvailability.length > 0 ? (
                    <View className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <Text className="text-green-700 font-semibold text-sm">✅ Dr. {selectedVet.name} tiene disponibilidad el {nextControlDate}</Text>
                      <Text className="text-green-600 text-xs mt-1">Horarios: {vetAvailability.join(', ')}</Text>
                      <TouchableOpacity
                        className="bg-green-500 rounded-xl py-2 items-center mt-3"
                        onPress={handleBookNow}
                      >
                        <Text className="text-white font-semibold text-sm">📅 Agendar ahora</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <Text className="text-amber-700 font-semibold text-sm">📅 Dr. {selectedVet.name} no tiene horarios disponibles ese día</Text>
                      <Text className="text-amber-600 text-xs mt-1">Puedes contactarlo directamente o elegir otra fecha.</Text>
                    </View>
                  )
                ) : !selectedVet ? (
                  <View className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <Text className="text-blue-700 text-sm font-semibold">Veterinario no registrado en JunglApp</Text>
                    <Text className="text-blue-500 text-xs mt-1">¿Quieres agregar un recordatorio a tu calendario?</Text>
                    {reminderAdded ? (
                      <View className="bg-green-50 border border-green-200 rounded-xl py-2 items-center mt-3">
                        <Text className="text-green-700 font-semibold text-sm">✅ Recordatorio guardado</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        className="bg-blue-500 rounded-xl py-2 items-center mt-3"
                        onPress={async () => {
                          const ok = await addToDeviceCalendar();
                          if (ok) setReminderAdded(true);
                        }}
                      >
                        <Text className="text-white font-semibold text-sm">📲 Agregar recordatorio</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <TouchableOpacity
            className={`bg-primary-500 rounded-2xl py-4 items-center ${saving ? 'opacity-70' : ''}`}
            onPress={handleSave}
            disabled={saving}
          >
            <Text className="text-white font-bold text-base">
              {saving ? 'Guardando...' : isEditMode ? '✅ Guardar cambios' : '✅ Registrar Visita'}
            </Text>
          </TouchableOpacity>

          {isEditMode && (
            <TouchableOpacity className="py-4 items-center" onPress={handleDelete} disabled={saving}>
              <Text className="text-red-500 font-semibold text-sm">🗑️ Eliminar visita</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
