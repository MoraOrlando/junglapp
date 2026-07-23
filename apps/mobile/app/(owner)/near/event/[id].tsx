import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, Linking, TextInput, Modal } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../../context/AuthContext';
import type { CommunityEvent, ContentReport } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#0E7490';

function openInMaps(query: string) {
  const url = Platform.select({
    ios: `maps:0,0?q=${encodeURIComponent(query)}`,
    android: `geo:0,0?q=${encodeURIComponent(query)}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  });
  Linking.openURL(url as string).catch(() => {});
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.EVENTS, id));
        if (snap.exists()) setEvent({ id: snap.id, ...snap.data() } as CommunityEvent);
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  function confirmDelete() {
    if (!event) return;
    Alert.alert('Eliminar evento', `¿Seguro que quieres eliminar "${event.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await deleteDoc(doc(db, COLLECTIONS.EVENTS, event.id));
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  async function submitReport() {
    if (!user || !event || !reportReason.trim()) {
      Alert.alert('Falta información', 'Cuéntanos brevemente qué encontraste inapropiado.');
      return;
    }
    setSubmittingReport(true);
    try {
      const report: Omit<ContentReport, 'id'> = {
        reporterId: user.uid,
        reportedUserId: event.createdBy,
        reportedUserName: event.createdByName,
        eventId: event.id,
        eventName: event.name,
        reason: reportReason.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, COLLECTIONS.REPORTS), report);
      setReportOpen(false);
      setReportReason('');
      Alert.alert('Gracias', 'Tu reporte fue enviado. Lo revisaremos dentro de 24 horas.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReport(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 15 }}>No encontramos este evento.</Text>
      </SafeAreaView>
    );
  }

  const canManage = user?.uid === event.createdBy || user?.role === 'support';
  const formattedDate = new Date(event.eventDate + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isPast = event.expiresAt < new Date().toISOString();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GREEN }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 19, fontWeight: '800', color: GREEN, flexShrink: 1 }} numberOfLines={1}>📅 {event.name}</Text>
        </View>
        {canManage ? (
          <TouchableOpacity onPress={confirmDelete} disabled={deleting} hitSlop={10}>
            {deleting ? <ActivityIndicator color="#EF4444" /> : <Text style={{ fontSize: 20 }}>🗑️</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setReportOpen(true)} hitSlop={10}>
            <Text style={{ fontSize: 20 }}>🚩</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {event.photoUrl ? (
          <Image source={{ uri: event.photoUrl }} style={{ width: '100%', height: 200, borderRadius: 18, marginTop: 8, marginBottom: 16 }} contentFit="cover" />
        ) : (
          <View style={{ width: '100%', height: 140, borderRadius: 18, marginTop: 8, marginBottom: 16, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40 }}>🐾</Text>
          </View>
        )}

        {isPast && (
          <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, marginBottom: 14 }}>
            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Este evento ya finalizó.</Text>
          </View>
        )}

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 16 }}>📅</Text>
            <Text style={{ color: '#1E293B', fontSize: 14, fontWeight: '600', textTransform: 'capitalize', flex: 1 }}>{formattedDate}</Text>
          </View>
          <TouchableOpacity
            onPress={() => openInMaps(`${event.place}, ${event.address}`)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}
          >
            <Text style={{ fontSize: 16 }}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1E293B', fontSize: 14, fontWeight: '600' }}>{event.place}</Text>
              {!!event.address && <Text style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>{event.address}</Text>}
              <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>{event.region}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {!!event.description && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginBottom: 6 }}>Consideraciones</Text>
            <Text style={{ color: '#475569', fontSize: 14, lineHeight: 20 }}>{event.description}</Text>
          </View>
        )}

        <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>Creado por {event.createdByName}</Text>
      </ScrollView>

      <Modal visible={reportOpen} transparent animationType="fade" onRequestClose={() => setReportOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937', marginBottom: 8 }}>🚩 Reportar evento</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
              Cuéntanos qué encontraste inapropiado sobre "{event.name}". Revisamos todos los reportes dentro de 24 horas.
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
              placeholder="Describe el problema..."
              placeholderTextColor="#9CA3AF"
              multiline
              value={reportReason}
              onChangeText={setReportReason}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setReportOpen(false); setReportReason(''); }}
                style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#374151', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReport}
                disabled={submittingReport}
                style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: submittingReport ? 0.7 : 1 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{submittingReport ? 'Enviando...' : 'Reportar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
