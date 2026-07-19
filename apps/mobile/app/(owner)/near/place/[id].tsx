import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Platform, Linking, Modal } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../../context/AuthContext';
import { logPlaceViewed, logPlaceReviewed } from '../../../../lib/analytics';
import type { Place, PlaceCategory, PlaceReview, ContentReport } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#0E7490';

// react-native-maps does not support web — load it only on native
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
  } catch {}
}

const CATEGORIES: { id: PlaceCategory; label: string; emoji: string }[] = [
  { id: 'park', label: 'Parque para perros', emoji: '🐕' },
  { id: 'restaurant', label: 'Restaurante pet-friendly', emoji: '🍽️' },
];
const CATEGORY_META: Record<PlaceCategory, { label: string; emoji: string }> = {
  park: { label: 'Parque para perros', emoji: '🐕' },
  restaurant: { label: 'Restaurante pet-friendly', emoji: '🍽️' },
};

function openInMaps(lat: number, lng: number, name: string) {
  const url = Platform.select({
    ios: `maps:0,0?q=${encodeURIComponent(name)}@${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name)})`,
    default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  });
  Linking.openURL(url as string).catch(() => {});
}

export default function PlaceDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<Place | null>(null);
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Edit mode — available to the place's creator or a support account.
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<PlaceCategory>('park');
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhotoUrl, setEditPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Reporting — satisfies Apple Guideline 1.2 (User-Generated Content): any
  // user must be able to report a place or a review, not just have an admin
  // manually browse and delete. Uses a custom modal (not Alert.prompt, which
  // has no Android equivalent) so it works on both platforms.
  const [reportTarget, setReportTarget] = useState<{ userId: string; userName: string } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, COLLECTIONS.PLACES, id));
        if (snap.exists()) {
          const p = { id: snap.id, ...snap.data() } as Place;
          setPlace(p);
          logPlaceViewed(p.category);
        }
      } catch {}

      try {
        const reviewSnap = await getDocs(query(collection(db, COLLECTIONS.PLACE_REVIEWS), where('placeId', '==', id)));
        const r = reviewSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PlaceReview));
        r.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        setReviews(r);

        if (user) {
          setCanReview(!r.some((rv) => rv.ownerId === user.uid));
        }
      } catch {}

      setLoading(false);
    })();
  }, [id, user?.uid]);

  async function submitReview() {
    if (!user || !place || !reviewComment.trim()) {
      Alert.alert('Error', 'Escribe un comentario');
      return;
    }
    if (reviewComment.trim().length > 2000) {
      Alert.alert('Reseña muy larga', 'El comentario no puede superar 2000 caracteres.');
      return;
    }
    setSubmittingReview(true);
    try {
      const newReview: Omit<PlaceReview, 'id'> = {
        placeId: place.id,
        ownerId: user.uid,
        ownerName: user.name || 'Usuario',
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: new Date().toISOString(),
      };
      // Only write the review — rating recalculation handled server-side via Cloud Function
      await addDoc(collection(db, COLLECTIONS.PLACE_REVIEWS), newReview);
      logPlaceReviewed(place.category);

      setReviews((prev) => [{ ...newReview, id: 'new' }, ...prev]);
      setCanReview(false);
      setShowReviewForm(false);
      setReviewComment('');
      Alert.alert('¡Gracias!', 'Tu reseña fue enviada');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function submitReport() {
    if (!user || !place || !reportTarget || !reportReason.trim()) {
      Alert.alert('Falta información', 'Cuéntanos brevemente qué encontraste inapropiado.');
      return;
    }
    setSubmittingReport(true);
    try {
      const report: Omit<ContentReport, 'id'> = {
        reporterId: user.uid,
        reportedUserId: reportTarget.userId,
        reportedUserName: reportTarget.userName,
        placeId: place.id,
        placeName: place.name,
        reason: reportReason.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await addDoc(collection(db, COLLECTIONS.REPORTS), report);
      setReportTarget(null);
      setReportReason('');
      Alert.alert('Gracias', 'Tu reporte fue enviado. Lo revisaremos dentro de 24 horas.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmittingReport(false);
    }
  }

  function confirmDelete() {
    if (!place) return;
    Alert.alert('Eliminar lugar', `¿Seguro que quieres eliminar "${place.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await deleteDoc(doc(db, COLLECTIONS.PLACES, place.id));
            router.back();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  function startEdit() {
    if (!place) return;
    setEditCategory(place.category);
    setEditName(place.name);
    setEditAddress(place.address ?? '');
    setEditDescription(place.description ?? '');
    setEditPhotoUrl(place.photoUrl ?? null);
    setEditing(true);
  }

  async function pickEditPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      setEditPhotoUrl(url);
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveEdit() {
    if (!place) return;
    if (!editName.trim()) { Alert.alert('Falta información', 'Ponle un nombre al lugar.'); return; }
    setSavingEdit(true);
    try {
      const updates: any = {
        name: editName.trim(),
        category: editCategory,
        address: editAddress.trim() || null,
        description: editDescription.trim() || null,
        photoUrl: editPhotoUrl || null,
      };
      await updateDoc(doc(db, COLLECTIONS.PLACES, place.id), updates);
      setPlace({ ...place, ...updates });
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} />
      </SafeAreaView>
    );
  }

  if (!place) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 15 }}>No encontramos este lugar.</Text>
      </SafeAreaView>
    );
  }

  const meta = CATEGORY_META[place.category];
  const isOwner = user?.uid === place.createdBy;
  const isSupport = user?.role === 'support';
  const canManage = isOwner || isSupport;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <TouchableOpacity onPress={() => (editing ? setEditing(false) : router.back())} hitSlop={10}>
            <Text style={{ fontSize: 22, color: GREEN }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 19, fontWeight: '800', color: GREEN, flexShrink: 1 }} numberOfLines={1}>{meta.emoji} {place.name}</Text>
        </View>
        {canManage && !editing && (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={startEdit} hitSlop={10}>
              <Text style={{ fontSize: 20 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} hitSlop={10}>
              <Text style={{ fontSize: 20 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
        {!canManage && !editing && (
          <TouchableOpacity
            onPress={() => setReportTarget({ userId: place.createdBy, userName: place.createdByName })}
            hitSlop={10}
          >
            <Text style={{ fontSize: 20 }}>🚩</Text>
          </TouchableOpacity>
        )}
      </View>

      {editing ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {isSupport && !isOwner && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '600' }}>🛡️ Editando como soporte — este lugar no es tuyo.</Text>
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Categoría</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setEditCategory(c.id)}
                style={{
                  flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
                  borderWidth: 2, borderColor: editCategory === c.id ? GREEN : '#E2E8F0',
                  backgroundColor: editCategory === c.id ? '#ECFEFF' : '#fff',
                }}
              >
                <Text style={{ fontSize: 24, marginBottom: 4 }}>{c.emoji}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: editCategory === c.id ? GREEN : '#64748B', textAlign: 'center' }}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Foto</Text>
          <TouchableOpacity
            onPress={pickEditPhoto}
            disabled={uploadingPhoto}
            style={{
              width: '100%', height: 160, borderRadius: 14, marginBottom: 18,
              borderWidth: 1, borderColor: '#E5E7EB', borderStyle: editPhotoUrl ? 'solid' : 'dashed',
              backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {uploadingPhoto ? (
              <ActivityIndicator color={GREEN} />
            ) : editPhotoUrl ? (
              <Image source={{ uri: editPhotoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>📷</Text>
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>Toca para agregar una foto</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Nombre</Text>
          <TextInput
            value={editName}
            onChangeText={setEditName}
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Dirección (opcional)</Text>
          <TextInput
            value={editAddress}
            onChangeText={setEditAddress}
            placeholderTextColor="#9CA3AF"
            style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937', marginBottom: 16 }}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Descripción (opcional)</Text>
          <TextInput
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
            numberOfLines={3}
            placeholderTextColor="#9CA3AF"
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff', color: '#1F2937', minHeight: 80, textAlignVertical: 'top', marginBottom: 24 }}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setEditing(false)}
              style={{ flex: 1, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}
            >
              <Text style={{ color: '#64748B', fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveEdit}
              disabled={savingEdit || uploadingPhoto}
              style={{ flex: 2, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: (savingEdit || uploadingPhoto) ? 0.7 : 1 }}
            >
              {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Guardar cambios</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {place.photoUrl && (
          <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden', height: 200 }}>
            <Image source={{ uri: place.photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          </View>
        )}
        {MapView && (
          <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', height: 200 }}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{ latitude: place.location.lat, longitude: place.location.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            >
              <Marker coordinate={{ latitude: place.location.lat, longitude: place.location.lng }} title={place.name} />
            </MapView>
          </View>
        )}

        <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <View style={{ backgroundColor: '#ECFEFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: GREEN, fontWeight: '700' }}>{meta.label}</Text>
            </View>
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '700' }}>
                {place.reviewCount > 0 ? `⭐ ${place.rating.toFixed(1)} (${place.reviewCount})` : 'Sin reseñas aún'}
              </Text>
            </View>
          </View>

          {place.address && <Text style={{ color: '#64748B', fontSize: 14, marginBottom: 8 }}>📍 {place.address}</Text>}
          {place.description && <Text style={{ color: '#1E293B', fontSize: 14, marginBottom: 12, lineHeight: 20 }}>{place.description}</Text>}
          <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 16 }}>Agregado por {place.createdByName}</Text>

          <TouchableOpacity
            onPress={() => openInMaps(place.location.lat, place.location.lng, place.name)}
            style={{ backgroundColor: '#1E293B', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 24 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Abrir en Maps</Text>
          </TouchableOpacity>

          <View style={{
            backgroundColor: '#fff', borderRadius: 20, padding: 20,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#1E293B' }}>⭐ Reseñas</Text>
              {canReview && !showReviewForm && (
                <TouchableOpacity
                  onPress={() => setShowReviewForm(true)}
                  style={{ backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Reseñar</Text>
                </TouchableOpacity>
              )}
            </View>

            {showReviewForm && (
              <View style={{ backgroundColor: '#ECFEFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#A5F3FC' }}>
                <Text style={{ fontWeight: '600', color: GREEN, fontSize: 14, marginBottom: 10 }}>Tu reseña</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} onPress={() => setReviewRating(star)}>
                      <Text style={{ fontSize: 30, color: star <= reviewRating ? '#F59E0B' : '#D1D5DB' }}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  placeholder="Escribe tu comentario..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={{
                    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#A5F3FC',
                    padding: 12, fontSize: 14, color: '#1E293B', minHeight: 72, textAlignVertical: 'top', marginBottom: 12,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setShowReviewForm(false)}
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#A5F3FC' }}
                  >
                    <Text style={{ color: '#64748B', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submitReview}
                    disabled={submittingReview}
                    style={{ flex: 2, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: submittingReview ? '#67E8F9' : GREEN }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{submittingReview ? 'Enviando...' : 'Enviar reseña'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {reviews.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>💬</Text>
                <Text style={{ color: '#94A3B8', fontSize: 14 }}>Aún no hay reseñas</Text>
              </View>
            ) : (
              reviews.map((review) => (
                <View key={review.id} style={{ borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 14 }}>{review.ownerName}</Text>
                    <Text style={{ color: '#F59E0B', fontSize: 13 }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</Text>
                  </View>
                  <Text style={{ color: '#64748B', fontSize: 13, lineHeight: 18 }}>{review.comment}</Text>
                  {review.ownerId !== user?.uid && (
                    <TouchableOpacity
                      onPress={() => setReportTarget({ userId: review.ownerId, userName: review.ownerName })}
                      style={{ marginTop: 6 }}
                    >
                      <Text style={{ color: '#94A3B8', fontSize: 11 }}>🚩 Reportar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
      )}

      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937', marginBottom: 8 }}>🚩 Reportar contenido</Text>
            <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
              Cuéntanos qué encontraste inapropiado{reportTarget ? ` sobre ${reportTarget.userName}` : ''}. Revisamos todos los reportes dentro de 24 horas.
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
                onPress={() => { setReportTarget(null); setReportReason(''); }}
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
