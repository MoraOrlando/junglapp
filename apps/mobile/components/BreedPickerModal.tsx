import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';

const PRIMARY = '#2D6A4F';
const BORDER = '#E5E7EB';

// Sentinel the caller checks for to switch into free-text "custom breed" mode.
export const CUSTOM_BREED = '__custom__';

export default function BreedPickerModal({
  visible, breeds, onClose, onSelect,
}: {
  visible: boolean;
  breeds: string[];
  onClose: () => void;
  onSelect: (breed: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? breeds.filter((b) => b.toLowerCase().includes(search.trim().toLowerCase()))
    : breeds;

  function handleClose() {
    setSearch('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#1F2937' }}>Selecciona la raza</Text>
            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 18, color: '#9CA3AF' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
            <TextInput
              style={{ height: 44, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, fontSize: 15, color: '#1F2937' }}
              placeholder="Buscar raza..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginTop: 4 }}
            onPress={() => { onSelect(CUSTOM_BREED); handleClose(); }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: PRIMARY }}>✏️ No la encuentro / Otra raza</Text>
          </TouchableOpacity>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
                onPress={() => { onSelect(item); handleClose(); }}
              >
                <Text style={{ fontSize: 15, color: '#1F2937' }}>{item}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={(
              <Text style={{ padding: 24, color: '#9CA3AF', textAlign: 'center', fontSize: 14 }}>
                Sin resultados para "{search}"
              </Text>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}
