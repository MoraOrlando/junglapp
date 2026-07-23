import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Pet, User } from '@junglapp/types';

const { db, app } = initFirebase();
const fns = getFunctions(app, 'us-central1');
const PURPLE = '#7C3AED';

const ACCOUNT_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#ECFDF5', text: '#059669', label: 'Activo' },
  under_review: { bg: '#FFFBEB', text: '#D97706', label: 'En revisión' },
  blocked: { bg: '#FEF2F2', text: '#EF4444', label: 'Bloqueado' },
};

const SPECIES_LABELS: Record<string, string> = { dog: 'Perros', cat: 'Gatos', other: 'Otros' };

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#1F2937', fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [userSnap, petsSnap] = await Promise.all([
      getDoc(doc(db, COLLECTIONS.USERS, id)),
      getDocs(query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', id))),
    ]);
    if (userSnap.exists()) setUser({ ...(userSnap.data() as User), uid: userSnap.id });
    setPets(petsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function toggleBlocked() {
    if (!user) return;
    const isBlocked = user.accountStatus === 'blocked';
    const action = isBlocked ? 'reactivar' : 'bloquear';
    Alert.alert('Confirmar', `¿Deseas ${action} la cuenta de "${user.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: isBlocked ? 'default' : 'destructive',
        onPress: async () => {
          const newStatus = isBlocked ? 'active' : 'blocked';
          await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { accountStatus: newStatus });
          setUser({ ...user, accountStatus: newStatus as any });
        },
      },
    ]);
  }

  function confirmResetPassword() {
    if (!user) return;
    Alert.alert(
      'Restablecer contraseña',
      `Se generará una nueva contraseña temporal para "${user.name}" y su contraseña actual dejará de funcionar. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Generar', onPress: resetPassword },
      ]
    );
  }

  async function resetPassword() {
    if (!user) return;
    setResetting(true);
    try {
      const adminResetUserPassword = httpsCallable(fns, 'adminResetUserPassword');
      const result = await adminResetUserPassword({ targetUid: user.uid });
      setTempPassword((result.data as { tempPassword: string }).tempPassword);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo restablecer la contraseña.');
    } finally {
      setResetting(false);
    }
  }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  if (!user) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Text style={{ color: '#9CA3AF' }}>No se encontró este usuario.</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: PURPLE, fontWeight: '700' }}>Volver</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const accountStatus = user.accountStatus || 'active';
  const isBlocked = accountStatus === 'blocked';
  const sc = ACCOUNT_STATUS_COLORS[accountStatus] || ACCOUNT_STATUS_COLORS.active;

  const speciesCounts: Record<string, number> = {};
  pets.forEach((p) => {
    const sp = p.species || 'other';
    speciesCounts[sp] = (speciesCounts[sp] || 0) + 1;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: PURPLE }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: PURPLE }}>Detalle de usuario</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          {user.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE' }} />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 34 }}>👤</Text>
            </View>
          )}
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginTop: 10 }}>{user.name}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: PURPLE, fontSize: 12, fontWeight: '600' }}>{user.role}</Text>
            </View>
            <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: sc.text, fontSize: 12, fontWeight: '600' }}>{sc.label}</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginBottom: 6 }}>Contacto</Text>
          <InfoRow label="Correo" value={user.email} />
          <InfoRow label="Teléfono" value={user.phone} />
          <InfoRow label="Dirección" value={user.address} />
          <InfoRow label="Ciudad / Región" value={user.city && user.region ? `${user.city}, ${user.region}` : undefined} />
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginBottom: 12 }}>🐾 Mascotas registradas ({pets.length})</Text>
          {pets.length === 0 ? (
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Sin mascotas registradas.</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {Object.entries(speciesCounts).map(([sp, count]) => (
                  <View key={sp} style={{ backgroundColor: '#F5F3FF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontWeight: '800', color: PURPLE, fontSize: 16 }}>{count}</Text>
                    <Text style={{ color: '#7C3AED99', fontSize: 11 }}>{SPECIES_LABELS[sp] || sp}</Text>
                  </View>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {pets.map((p) => (
                    <View key={p.id} style={{ alignItems: 'center', width: 64 }}>
                      {p.photos?.[0] ? (
                        <Image source={{ uri: p.photos[0] }} style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#F3F4F6' }} />
                      ) : (
                        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 22 }}>🐾</Text>
                        </View>
                      )}
                      <Text numberOfLines={1} style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{p.name}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        <TouchableOpacity
          onPress={confirmResetPassword}
          disabled={resetting}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#F5F3FF', opacity: resetting ? 0.7 : 1 }}
        >
          {resetting ? (
            <ActivityIndicator color={PURPLE} />
          ) : (
            <Text style={{ fontWeight: '700', fontSize: 14, color: PURPLE }}>🔑 Restablecer contraseña</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleBlocked}
          style={{ borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 40, backgroundColor: isBlocked ? '#ECFDF5' : '#FEF2F2' }}
        >
          <Text style={{ fontWeight: '700', fontSize: 14, color: isBlocked ? '#059669' : '#EF4444' }}>
            {isBlocked ? '🟢 Reactivar cuenta' : '🔴 Bloquear cuenta'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!tempPassword} transparent animationType="fade" onRequestClose={() => setTempPassword(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 8, textAlign: 'center' }}>
              🔑 Contraseña temporal
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
              Compártesela a {user.name} por WhatsApp o SMS. Deberá cambiarla al iniciar sesión.
            </Text>
            <View style={{ backgroundColor: '#F5F3FF', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 12, borderWidth: 2, borderColor: PURPLE, borderStyle: 'dashed', marginBottom: 20 }}>
              <Text selectable style={{ fontSize: 22, fontWeight: '800', color: PURPLE, textAlign: 'center', letterSpacing: 2 }}>
                {tempPassword}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setTempPassword(null)}
              style={{ backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Listo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
