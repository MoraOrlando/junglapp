import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: '#ECFDF5', text: '#059669', label: '✅ Aprobado' },
  pending:  { bg: '#FFFBEB', text: '#D97706', label: '⏳ Pendiente' },
  rejected: { bg: '#FEF2F2', text: '#EF4444', label: '❌ Rechazado' },
};

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#1F2937', fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

function RejectModal({ visible, onConfirm, onCancel }: { visible: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937', marginBottom: 8 }}>❌ Rechazar veterinario</Text>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Indica el motivo. El veterinario recibirá esta información.</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
            placeholder="Ej: Credencial no válida, datos incompletos..."
            placeholderTextColor="#9CA3AF"
            multiline
            value={reason}
            onChangeText={setReason}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={onCancel} style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#374151', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (!reason.trim()) { Alert.alert('', 'Ingresa un motivo de rechazo'); return; } onConfirm(reason.trim()); setReason(''); }}
              style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function VetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);

  async function load() {
    if (!id) return;
    const snap = await getDoc(doc(db, COLLECTIONS.VETERINARIANS, id));
    if (snap.exists()) setVet({ id: snap.id, ...snap.data() } as Veterinarian);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function approve() {
    if (!vet) return;
    await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vet.id), { status: 'approved', rejectionReason: null });
    setVet({ ...vet, status: 'approved' });
  }

  async function rejectWithReason(reason: string) {
    if (!vet) return;
    await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vet.id), { status: 'rejected', rejectionReason: reason });
    setVet({ ...vet, status: 'rejected', rejectionReason: reason } as any);
    setRejecting(false);
  }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  if (!vet) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Text style={{ color: '#9CA3AF' }}>No se encontró este veterinario.</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: PURPLE, fontWeight: '700' }}>Volver</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const isClinic = (vet as any).isClinic ?? false;
  const sc = STATUS_COLORS[vet.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: PURPLE }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: PURPLE }}>{isClinic ? 'Detalle de veterinaria' : 'Detalle de veterinario'}</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          {vet.photoUrl ? (
            <Image source={{ uri: vet.photoUrl }} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE' }} />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 34 }}>{isClinic ? '🏥' : '🩺'}</Text>
            </View>
          )}
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginTop: 10 }}>{isClinic ? vet.name : `Dr. ${vet.name}`}</Text>
          <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 }}>
            <Text style={{ color: sc.text, fontSize: 12, fontWeight: '600' }}>{sc.label}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginBottom: 6 }}>Datos profesionales</Text>
          <InfoRow label="RUT" value={vet.rut} />
          <InfoRow label="N° licencia" value={vet.licenseNumber} />
          <InfoRow label="Correo" value={vet.email} />
          <InfoRow label="Teléfono" value={vet.phone} />
          <InfoRow label="Dirección" value={vet.address} />
          <InfoRow label="Ciudad / Región" value={vet.city && vet.region ? `${vet.city}, ${vet.region}` : undefined} />
          <InfoRow label="Valor consulta" value={vet.consultationFee ? `$${vet.consultationFee.toLocaleString('es-CL')}` : undefined} />
          {vet.specialties?.length > 0 && (
            <View style={{ paddingTop: 8 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 6 }}>Especialidades</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {vet.specialties.map((s) => (
                  <View key={s} style={{ backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: PURPLE, fontSize: 12 }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {vet.credentialUrl && (
            <Text style={{ color: PURPLE, fontSize: 12, marginTop: 10 }}>🔗 Credencial cargada</Text>
          )}
          {(vet as any).rejectionReason && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>Motivo de rechazo: {(vet as any).rejectionReason}</Text>
          )}
        </View>

        {vet.status === 'pending' ? (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 40 }}>
            <TouchableOpacity onPress={approve} style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#059669', fontWeight: '700' }}>✅ Aprobar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRejecting(true)} style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#EF4444', fontWeight: '700' }}>❌ Rechazar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => vet.status === 'approved' ? setRejecting(true) : approve()}
            style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40, backgroundColor: vet.status === 'approved' ? '#FEF2F2' : '#ECFDF5' }}
          >
            <Text style={{ fontWeight: '700', fontSize: 14, color: vet.status === 'approved' ? '#EF4444' : '#059669' }}>
              {vet.status === 'approved' ? '🔴 Bloquear (revocar aprobación)' : '🟢 Reactivar'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <RejectModal visible={rejecting} onConfirm={rejectWithReason} onCancel={() => setRejecting(false)} />
    </SafeAreaView>
  );
}
