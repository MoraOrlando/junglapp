import { Modal, View, TouchableOpacity, Text } from 'react-native';
import { Image } from 'expo-image';

// Single-image full-screen viewer — same visual language as the pet photo
// gallery in (owner)/pets/[id].tsx, minus the swipe/dots since profile
// photos (walker/vet/trainer/groomer/store) are always just one image.
export default function FullScreenImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {uri && (
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={{
            position: 'absolute', top: 56, right: 20,
            backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
            width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 20, lineHeight: 20 }}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
