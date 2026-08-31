import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)}>
          <Text style={{ fontSize: 30 }}>{star <= value ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

interface Props {
  visible: boolean;
  providerName: string;
  kind: 'walker' | 'vet';
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onPostpone: () => void;
}

// Surfaces whenever the owner has a completed appointment (vet or walker/
// caregiver) with no review yet — including ones the PROVIDER closed out
// while the owner had the app closed, which is why this lives at the home
// screen and re-checks on every app open rather than only inside a specific
// appointment/provider screen. "Ahora no" just closes it for this visit —
// no dismissal is persisted, so it comes back next time the app opens if
// still unreviewed (by design, per product decision).
export default function PendingReviewModal({ visible, providerName, kind, onSubmit, onPostpone }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) { setRating(0); setComment(''); setSubmitting(false); }
  }, [visible, providerName]);

  const roleLabel = kind === 'walker' ? 'paseador/cuidador' : 'veterinario';

  async function handleSubmit() {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, comment.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onPostpone}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' }}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
                {kind === 'walker' ? '🦮' : '🩺'} ¿Cómo fue con {providerName}?
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
                Completaste un servicio con este {roleLabel}. Tu reseña ayuda a otros dueños de mascota.
              </Text>

              <StarRating value={rating} onChange={setRating} />

              <TextInput
                style={{ marginTop: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, fontSize: 13, color: '#1E293B', minHeight: 80, textAlignVertical: 'top' }}
                placeholder="Cuéntanos cómo fue la atención..."
                placeholderTextColor="#9CA3AF"
                multiline
                value={comment}
                onChangeText={setComment}
              />

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitting || rating === 0}
                style={{ marginTop: 16, backgroundColor: rating === 0 ? '#D1D5DB' : submitting ? '#93C5FD' : '#2D6A4F', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {submitting ? 'Enviando...' : 'Enviar reseña'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onPostpone} disabled={submitting} style={{ marginTop: 10, paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 13 }}>Ahora no</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
