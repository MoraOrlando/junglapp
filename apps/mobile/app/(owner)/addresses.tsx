import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { locationKeys } from '../../lib/locationKey';
import { logAddressAdded } from '../../lib/analytics';
import type { UserAddress } from '@junglapp/types';

const { db } = initFirebase();

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const EMPTY_FORM = { label: '', address: '', city: '', region: 'Metropolitana' };

export default function AddressesScreen() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();

  const addresses: UserAddress[] = (user as any)?.addresses ?? [];
  const selectedId = (user as any)?.selectedAddressId ?? null;

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserAddress | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [regionOpen, setRegionOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(addr: UserAddress) {
    setEditing(addr);
    setForm({ label: addr.label, address: addr.address, city: addr.city, region: addr.region });
    setShowForm(true);
  }

  async function saveAddress() {
    if (!form.label.trim() || !form.city.trim() || !form.address.trim()) {
      Alert.alert('Faltan datos', 'Completa etiqueta, dirección y ciudad.');
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const keys = locationKeys(form.city, form.region);
      let updated: UserAddress[];
      if (editing) {
        updated = addresses.map((a) =>
          a.id === editing.id ? { ...a, ...form, ...keys } : a
        );
      } else {
        const newAddr: UserAddress = {
          id: `addr_${Date.now()}`,
          ...form,
          ...keys,
        };
        logAddressAdded();
        updated = [...addresses, newAddr];
        // Auto-select if it's the first address
        if (updated.length === 1) {
          await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
            addresses: updated,
            selectedAddressId: newAddr.id,
          });
          await updateProfile({ addresses: updated, selectedAddressId: newAddr.id } as any);
          setShowForm(false);
          return;
        }
      }
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { addresses: updated });
      await updateProfile({ addresses: updated } as any);
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function selectAddress(id: string) {
    if (!user) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { selectedAddressId: id });
      await updateProfile({ selectedAddressId: id } as any);
    } catch {}
  }

  async function deleteAddress(id: string) {
    if (!user) return;
    Alert.alert('Eliminar dirección', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const updated = addresses.filter((a) => a.id !== id);
          const newSelected = selectedId === id ? (updated[0]?.id ?? null) : selectedId;
          await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
            addresses: updated,
            selectedAddressId: newSelected,
          });
          await updateProfile({ addresses: updated, selectedAddressId: newSelected } as any);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: '#64748B' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1E293B' }}>Mis direcciones 📍</Text>
          <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 2 }}>
            La dirección activa se usa en "Cerca de ti"
          </Text>
        </View>
        <TouchableOpacity
          onPress={openNew}
          style={{ backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {addresses.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>📍</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>
              Sin direcciones guardadas
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Agrega tus direcciones para ver servicios{'\n'}cerca de donde necesitas
            </Text>
            <TouchableOpacity
              onPress={openNew}
              style={{ marginTop: 24, backgroundColor: '#16A34A', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Agregar primera dirección</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12, paddingBottom: 40, paddingTop: 4 }}>
            {addresses.map((addr) => {
              const isSelected = addr.id === selectedId;
              return (
                <TouchableOpacity
                  key={addr.id}
                  onPress={() => selectAddress(addr.id)}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 18,
                    padding: 16,
                    borderWidth: 2,
                    borderColor: isSelected ? '#16A34A' : '#E2E8F0',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: isSelected ? '#DCFCE7' : '#F1F5F9',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 20 }}>{isSelected ? '✅' : '📍'}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15 }}>{addr.label}</Text>
                        {isSelected && (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>ACTIVA</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#64748B', fontSize: 13 }}>{addr.address}</Text>
                      <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>{addr.city} · {addr.region}</Text>
                    </View>

                    {/* Actions */}
                    <View style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => openEdit(addr)}
                        style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        <Text style={{ color: '#1D4ED8', fontSize: 12, fontWeight: '600' }}>✏️ Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteAddress(addr.id)}
                        style={{ backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                      >
                        <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '600' }}>🗑 Borrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Form Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 20 }}>
                {editing ? '✏️ Editar dirección' : '📍 Nueva dirección'}
              </Text>

              {[
                { key: 'label', label: 'Etiqueta', placeholder: 'Ej: Mi casa, Trabajo, Casa mamá' },
                { key: 'address', label: 'Dirección', placeholder: 'Av. Providencia 1234' },
                { key: 'city', label: 'Ciudad / Comuna', placeholder: 'Providencia' },
              ].map((f) => (
                <View key={f.key} style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                      paddingHorizontal: 14, height: 48, fontSize: 15, color: '#1F2937',
                      backgroundColor: '#F9FAFB',
                    }}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9CA3AF"
                    value={(form as any)[f.key]}
                    onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  />
                </View>
              ))}

              {/* Region picker */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Región</Text>
                <TouchableOpacity
                  onPress={() => setRegionOpen(!regionOpen)}
                  style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, height: 48, backgroundColor: '#F9FAFB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Text style={{ fontSize: 15, color: '#1F2937' }}>{form.region}</Text>
                  <Text style={{ color: '#9CA3AF' }}>{regionOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {regionOpen && (
                  <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginTop: 4, maxHeight: 160, backgroundColor: '#fff' }}>
                    <ScrollView nestedScrollEnabled>
                      {REGIONS.map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: form.region === r ? '#F0FDF4' : 'transparent' }}
                          onPress={() => { setForm((p) => ({ ...p, region: r })); setRegionOpen(false); }}
                        >
                          <Text style={{ color: form.region === r ? '#16A34A' : '#374151', fontWeight: form.region === r ? '700' : '400' }}>{r}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: '#64748B', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveAddress}
                  disabled={saving}
                  style={{ flex: 2, backgroundColor: saving ? '#86EFAC' : '#16A34A', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {saving ? 'Guardando...' : 'Guardar dirección'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
