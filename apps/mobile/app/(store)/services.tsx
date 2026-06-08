import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, RefreshControl, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useFocusEffect } from 'expo-router';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Store, StoreService } from '@junglapp/types';

const { db } = initFirebase();
const AMBER = '#D97706';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

interface ServiceForm {
  name: string;
  description: string;
  price: string;
  duration: string;
}

export default function StoreServicesScreen() {
  const { user } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [storeDocId, setStoreDocId] = useState<string | null>(null);
  const [services, setServices] = useState<StoreService[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ServiceForm>({ name: '', description: '', price: '', duration: '' });

  async function loadData() {
    if (!user) return;
    const snap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid)));
    if (!snap.empty) {
      const s = { id: snap.docs[0].id, ...snap.docs[0].data() } as Store;
      setStore(s);
      setStoreDocId(snap.docs[0].id);
      setServices(s.services || []);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ name: '', description: '', price: '', duration: '' });
    setModalVisible(true);
  }

  function openEdit(svc: StoreService) {
    setEditingId(svc.id);
    setForm({ name: svc.name, description: svc.description, price: String(svc.price), duration: svc.duration || '' });
    setModalVisible(true);
  }

  async function saveService() {
    if (!form.name.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
    if (!form.price.trim() || isNaN(Number(form.price))) { Alert.alert('Error', 'Ingresa un precio válido'); return; }
    if (!storeDocId) return;
    setSaving(true);
    try {
      let updated: StoreService[];
      if (editingId) {
        updated = services.map((s) =>
          s.id === editingId
            ? { ...s, name: form.name, description: form.description, price: Number(form.price), duration: form.duration || undefined }
            : s
        );
      } else {
        const newSvc: StoreService = {
          id: genId(),
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: form.duration.trim() || undefined,
          isActive: true,
        };
        updated = [...services, newSvc];
      }
      await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), { services: updated });
      setServices(updated);
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string) {
    if (!storeDocId) return;
    const updated = services.map((s) => s.id === id ? { ...s, isActive: !s.isActive } : s);
    await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), { services: updated });
    setServices(updated);
  }

  function confirmDelete(svc: StoreService) {
    Alert.alert('Eliminar servicio', `¿Eliminar "${svc.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          if (!storeDocId) return;
          const updated = services.filter((s) => s.id !== svc.id);
          await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), { services: updated });
          setServices(updated);
        },
      },
    ]);
  }

  if (store?.status === 'pending') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151', textAlign: 'center' }}>Tienda en revisión</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          Tu tienda debe estar aprobada para gestionar servicios.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <View style={{ backgroundColor: AMBER, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Mis Servicios</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>✂️ {store?.name || 'Tienda'}</Text>
          </View>
          <TouchableOpacity
            onPress={openAdd}
            style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>+ Agregar</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{services.length}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Servicios</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{services.filter((s) => s.isActive).length}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Activos</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />}
      >
        {services.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>✂️</Text>
            <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>Sin servicios aún</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              Agrega servicios como grooming, paseo, baño, etc.
            </Text>
            <TouchableOpacity
              onPress={openAdd}
              style={{ marginTop: 20, backgroundColor: AMBER, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>+ Agregar primer servicio</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12, paddingTop: 20, paddingBottom: 40 }}>
            {services.map((svc) => (
              <View key={svc.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>✂️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: '#1F2937' }}>{svc.name}</Text>
                    {svc.description ? (
                      <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }} numberOfLines={2}>{svc.description}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                      <Text style={{ color: '#2D6A4F', fontWeight: '700', fontSize: 15 }}>${svc.price.toLocaleString()}</Text>
                      {svc.duration ? (
                        <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: '#3B82F6', fontSize: 11 }}>⏱ {svc.duration}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleActive(svc.id)}
                    style={{
                      borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
                      backgroundColor: svc.isActive ? '#ECFDF5' : '#F3F4F6',
                    }}
                  >
                    <Text style={{ fontSize: 12, color: svc.isActive ? '#059669' : '#6B7280', fontWeight: '600' }}>
                      {svc.isActive ? 'Activo' : 'Inactivo'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F9FAFB' }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => openEdit(svc)}
                  >
                    <Text style={{ color: '#3B82F6', fontWeight: '600', fontSize: 13 }}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => confirmDelete(svc)}
                  >
                    <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 20 }}>
                {editingId ? 'Editar servicio' : 'Nuevo servicio'}
              </Text>

              {[
                { key: 'name', label: 'Nombre del servicio *', placeholder: 'Baño y grooming', keyboard: 'default' },
                { key: 'description', label: 'Descripción', placeholder: 'Incluye baño, secado y corte de uñas...', keyboard: 'default', multiline: true },
                { key: 'price', label: 'Precio (CLP) *', placeholder: '15000', keyboard: 'number-pad' },
                { key: 'duration', label: 'Duración estimada', placeholder: 'ej: 1 hora', keyboard: 'default' },
              ].map((f) => (
                <View key={f.key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500', marginBottom: 4 }}>{f.label}</Text>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
                      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
                      ...(f.multiline ? { minHeight: 64, textAlignVertical: 'top' } : {}),
                    }}
                    placeholder={f.placeholder}
                    keyboardType={f.keyboard as any}
                    multiline={f.multiline}
                    value={(form as any)[f.key]}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: AMBER, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
                  onPress={saveService}
                  disabled={saving}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
