import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Trainer } from '@junglapp/types';

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
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937', marginBottom: 8 }}>❌ Rechazar adiestrador</Text>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Indica el motivo. El adiestrador recibirá esta información.</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
            placeholder="Ej: Cédula no coincide, datos incompletos..."
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

export default function TrainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);

  async function load() {
    if (!id) return;
    const snap = await getDoc(doc(db, COLLECTIONS.TRAINERS, id));
    if (snap.exists()) setTrainer({ id: snap.id, ...snap.data() } as Trainer);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function approve() {
    if (!trainer) return;
    await updateDoc(doc(db, COLLECTIONS.TRAINERS, trainer.id), { status: 'approved', rejectionReason: null });
    setTrainer({ ...trainer, status: 'approved' });
  }

  async function rejectWithReason(reason: string) {
    if (!trainer) return;
    await updateDoc(doc(db, COLLECTIONS.TRAINERS, trainer.id), { status: 'rejected', rejectionReason: reason });
    setTrainer({ ...trainer, status: 'rejected', rejectionReason: reason } as any);
    setRejecting(false);
  }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  if (!trainer) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Text style={{ color: '#9CA3AF' }}>No se encontró este adiestrador.</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: PURPLE, fontWeight: '700' }}>Volver</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const sc = STATUS_COLORS[trainer.status] || STATUS_COLORS.pending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: PURPLE }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: PURPLE }}>Detalle de adiestrador</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          {trainer.photoUrl ? (
            <Image source={{ uri: trainer.photoUrl }} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE' }} />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 34 }}>🐕</Text>
            </View>
          )}
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginTop: 10 }}>{trainer.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: sc.text, fontSize: 12, fontWeight: '600' }}>{sc.label}</Text>
            </View>
            {trainer.rating != null && (
              <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '600' }}>⭐ {trainer.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginBottom: 6 }}>Datos del adiestrador</Text>
          <InfoRow label="RUT" value={trainer.rut} />
          <InfoRow label="Correo" value={trainer.email} />
          <InfoRow label="Teléfono" value={trainer.phone} />
          <InfoRow label="Dirección" value={trainer.address} />
          <InfoRow label="Ciudad / Región" value={trainer.city && trainer.region ? `${trainer.city}, ${trainer.region}` : undefined} />
          <InfoRow label="Zona de servicio" value={trainer.serviceArea} />
          <InfoRow label="Experiencia" value={trainer.experience} />
          <InfoRow label="Valor consulta" value={trainer.consultationFee ? `$${trainer.consultationFee.toLocaleString('es-CL')}` : undefined} />
          {trainer.specialties?.length > 0 && (
            <View style={{ paddingTop: 8 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 6 }}>Especialidades</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {trainer.specialties.map((s) => (
                  <View key={s} style={{ backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: PURPLE, fontSize: 12 }}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {trainer.certifications?.length > 0 && (
            <View style={{ paddingTop: 8 }}>
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 6 }}>Certificaciones</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {trainer.certifications.map((c) => (
                  <View key={c} style={{ backgroundColor: '#F5F3FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: PURPLE, fontSize: 12 }}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {trainer.idImageUrl && (
            <Text style={{ color: PURPLE, fontSize: 12, marginTop: 10 }}>🔗 Cédula de identidad cargada</Text>
          )}
          {(trainer as any).rejectionReason && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>Motivo de rechazo: {(trainer as any).rejectionReason}</Text>
          )}
        </View>

        {trainer.status === 'pending' ? (
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
            onPress={() => trainer.status === 'approved' ? setRejecting(true) : approve()}
            style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40, backgroundColor: trainer.status === 'approved' ? '#FEF2F2' : '#ECFDF5' }}
          >
            <Text style={{ fontWeight: '700', fontSize: 14, color: trainer.status === 'approved' ? '#EF4444' : '#059669' }}>
              {trainer.status === 'approved' ? '🔴 Bloquear (revocar aprobación)' : '🟢 Reactivar'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <RejectModal visible={rejecting} onConfirm={rejectWithReason} onCancel={() => setRejecting(false)} />
    </SafeAreaView>
  );
}
