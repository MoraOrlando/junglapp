import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Modal, FlatList, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, uploadImage, COLLECTIONS } from '@junglapp/firebase';

const { auth, db } = initFirebase();
const GREEN = '#2D6A4F';
const INDIGO = '#4F46E5';

// ── Chilean RUT validation ───────────────────────────────────────────────────
function validateRut(rut: string): boolean {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  const digits = body.split('').reverse().map(Number);
  const multipliers = [2, 3, 4, 5, 6, 7];
  const sum = digits.reduce((acc, d, i) => acc + d * multipliers[i % multipliers.length], 0);
  const remainder = 11 - (sum % 11);
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  return dv === expected;
}

function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}

// ── Chile regions & communes ─────────────────────────────────────────────────
const REGIONS: Record<string, string[]> = {
  'Arica y Parinacota': ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  'Tarapacá': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  'Antofagasta': ['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena'],
  'Atacama': ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'],
  'Coquimbo': ['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paiguano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos', 'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado'],
  'Valparaíso': ['Valparaíso', 'Casablanca', 'Concón', 'Juan Fernández', 'Puchuncaví', 'Quintero', 'Viña del Mar', 'Isla de Pascua', 'Los Andes', 'Calle Larga', 'Rinconada', 'San Esteban', 'La Ligua', 'Cabildo', 'Papudo', 'Petorca', 'Zapallar', 'Quillota', 'Calera', 'Hijuelas', 'La Cruz', 'Nogales', 'San Antonio', 'Algarrobo', 'Cartagena', 'El Quisco', 'El Tabo', 'Santo Domingo', 'San Felipe', 'Catemu', 'Llaillay', 'Panquehue', 'Putaendo', 'Santa María', 'Quilpué', 'Limache', 'Olmué', 'Villa Alemana'],
  'Metropolitana de Santiago': ['Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Vitacura', 'Puente Alto', 'Pirque', 'San José de Maipo', 'Colina', 'Lampa', 'Tiltil', 'San Bernardo', 'Buin', 'Calera de Tango', 'Paine', 'Melipilla', 'Alhué', 'Curacaví', 'María Pinto', 'San Pedro', 'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Peñaflor'],
  "O'Higgins": ['Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras', 'Machalí', 'Malloa', 'Mostazal', 'Olivar', 'Peumo', 'Pichidegua', 'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente', 'Pichilemu', 'La Estrella', 'Litueche', 'Marchihue', 'Navidad', 'Paredones', 'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol', 'Nancagua', 'Palmilla', 'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz'],
  'Maule': ['Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue', 'Río Claro', 'San Clemente', 'San Rafael', 'Cauquenes', 'Chanco', 'Pelluhue', 'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral', 'Sagrada Familia', 'Teno', 'Vichuquén', 'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre', 'Yerbas Buenas'],
  'Ñuble': ['Chillán', 'Bulnes', 'Chillán Viejo', 'El Carmen', 'Pemuco', 'Pinto', 'Quillón', 'San Ignacio', 'Yungay', 'Cobquecura', 'Coelemu', 'Ninhue', 'Portezuelo', 'Quirihue', 'Ránquil', 'Trehuaco', 'Coihueco', 'Ñiquén', 'San Carlos', 'San Fabián', 'San Nicolás'],
  'Biobío': ['Concepción', 'Coronel', 'Chiguayante', 'Florida', 'Hualpén', 'Hualqui', 'Lota', 'Penco', 'San Pedro de la Paz', 'Santa Juana', 'Talcahuano', 'Tomé', 'Los Ángeles', 'Antuco', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Negrete', 'Quilaco', 'Quilleco', 'San Rosendo', 'Santa Bárbara', 'Tucapel', 'Yumbel', 'Arauco', 'Cañete', 'Contulmo', 'Curanilahue', 'Lebu', 'Los Álamos', 'Tirúa'],
  'La Araucanía': ['Temuco', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Saavedra', 'Teodoro Schmidt', 'Toltén', 'Vilcún', 'Villarrica', 'Cholchol', 'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Purén', 'Renaico', 'Traiguén', 'Victoria'],
  'Los Ríos': ['Valdivia', 'Corral', 'Futrono', 'La Unión', 'Lago Ranco', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'Río Bueno'],
  'Los Lagos': ['Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín', 'Puerto Varas', 'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo', 'Chaitén', 'Futaleufú', 'Hualaihué', 'Palena'],
  'Aysén': ['Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas', 'Cochrane', "O'Higgins", 'Tortel', 'Chile Chico', 'Río Ibáñez'],
  'Magallanes': ['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos', 'Antártica', 'Porvenir', 'Primavera', 'Timaukel', 'Natales', 'Torres del Paine'],
};

const REGION_NAMES = Object.keys(REGIONS);

function PickerModal({ visible, title, options, onSelect, onClose }: {
  visible: boolean; title: string; options: string[]; onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937' }}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ color: '#9CA3AF', fontSize: 22 }}>✕</Text></TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { onSelect(item); onClose(); }} style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
              <Text style={{ fontSize: 15, color: '#374151' }}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

export default function RegisterVetScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [profileUri, setProfileUri] = useState<string | null>(null);
  const [credentialUri, setCredentialUri] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [rutError, setRutError] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  function handleRutChange(value: string) {
    const formatted = formatRut(value);
    setRut(formatted);
    if (formatted.length >= 9) {
      setRutError(validateRut(formatted) ? '' : 'RUT inválido');
    } else {
      setRutError('');
    }
  }

  function handleRegionSelect(r: string) {
    setRegion(r);
    setCity('');
  }

  async function pickImage(onPick: (uri: string) => void) {
    Alert.alert('Subir imagen', '¿Cómo quieres agregar la foto?', [
      { text: 'Cámara', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) onPick(result.assets[0].uri);
      }},
      { text: 'Galería', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
        if (!result.canceled) onPick(result.assets[0].uri);
      }},
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function onSubmit() {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
    if (!validateRut(rut)) { Alert.alert('Error', 'Ingresa un RUT válido (ej: 12.345.678-9)'); return; }
    if (!licenseNumber.trim()) { Alert.alert('Error', 'El Nº de registro profesional es requerido'); return; }
    if (!phone.trim()) { Alert.alert('Error', 'El teléfono es requerido'); return; }
    if (!email.trim() || !email.includes('@')) { Alert.alert('Error', 'Email inválido'); return; }
    if (password.length < 6) { Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres'); return; }
    if (!address.trim()) { Alert.alert('Error', 'La dirección es requerida'); return; }
    if (!region) { Alert.alert('Error', 'Selecciona una región'); return; }
    if (!city) { Alert.alert('Error', 'Selecciona una comuna'); return; }
    if (!credentialUri) { Alert.alert('Requerido', 'Sube tu credencial profesional'); return; }
    if (!termsAccepted) { Alert.alert('Requerido', 'Acepta los términos para continuar'); return; }

    setLoading(true);
    let fbUser: any = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      fbUser = cred.user;

      const [credentialUrl, photoUrl] = await Promise.all([
        uploadImage(credentialUri),
        profileUri ? uploadImage(profileUri) : Promise.resolve(null),
      ]);

      await setDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), {
        uid: fbUser.uid,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'vet',
        phone: phone.trim(),
        address: address.trim(),
        region,
        city,
        createdAt: new Date().toISOString(),
      });

      await setDoc(doc(db, COLLECTIONS.VETERINARIANS, fbUser.uid), {
        userId: fbUser.uid,
        name: name.trim(),
        rut,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        region,
        city,
        licenseNumber: licenseNumber.trim(),
        photoUrl: photoUrl || null,
        credentialUrl,
        status: 'approved',
        specialties: [],
        availability: {},
        consultationFee: 0,
        rating: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
      });

      Alert.alert('✅ ¡Bienvenido!', 'Tu cuenta fue creada. Ahora puedes iniciar sesión.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (e: any) {
      if (fbUser && e.code !== 'auth/email-already-in-use') {
        try { await fbUser.delete(); } catch {}
      }
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Este correo ya está registrado. Intenta iniciar sesión.'
        : e.message;
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { placeholder?: string; secure?: boolean; keyboard?: any }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{label}</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', fontSize: 15, color: '#1F2937' }}
        placeholder={opts?.placeholder || ''}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChange}
        secureTextEntry={opts?.secure}
        keyboardType={opts?.keyboard || 'default'}
        autoCapitalize={opts?.keyboard === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 20 }}>
            <Text style={{ color: GREEN, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 26, fontWeight: '800', color: GREEN }}>🩺 Registro Veterinario</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6, marginBottom: 24 }}>Completa tus datos para crear tu cuenta</Text>

          {/* Profile photo */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <TouchableOpacity onPress={() => pickImage(setProfileUri)} activeOpacity={0.8}>
              {profileUri ? (
                <Image source={{ uri: profileUri }} style={{ width: 90, height: 90, borderRadius: 45 }} contentFit="cover" />
              ) : (
                <View style={{ width: 90, height: 90, borderRadius: 45, backgroundColor: '#ECFDF5', borderWidth: 2, borderStyle: 'dashed', borderColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 36 }}>🩺</Text>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: GREEN, borderRadius: 12, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13 }}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 8 }}>Foto de perfil (opcional)</Text>
          </View>

          {field('Nombre completo', name, setName, { placeholder: 'Dr. Juan Pérez' })}

          {/* RUT with validation */}
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>RUT / Cédula de identidad</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: rutError ? '#EF4444' : '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', fontSize: 15, color: '#1F2937' }}
              placeholder="12.345.678-9"
              placeholderTextColor="#9CA3AF"
              value={rut}
              onChangeText={handleRutChange}
              keyboardType="default"
              autoCapitalize="characters"
            />
            {rutError ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{rutError}</Text> : null}
            {rut.length >= 9 && !rutError ? <Text style={{ color: '#059669', fontSize: 12, marginTop: 4 }}>✅ RUT válido</Text> : null}
          </View>

          {field('Nº Registro Profesional', licenseNumber, setLicenseNumber, { placeholder: 'CVCh 12345' })}
          {field('Teléfono', phone, setPhone, { placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' })}
          {field('Correo electrónico', email, setEmail, { placeholder: 'dr@ejemplo.com', keyboard: 'email-address' })}
          {field('Contraseña', password, setPassword, { placeholder: '••••••••', secure: true })}
          {field('Dirección de consulta', address, setAddress, { placeholder: 'Av. Veterinaria 123' })}

          {/* Region picker */}
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Región</Text>
            <TouchableOpacity onPress={() => setShowRegionPicker(true)} style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, color: region ? '#1F2937' : '#9CA3AF' }}>{region || 'Selecciona una región'}</Text>
              <Text style={{ color: '#9CA3AF' }}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Commune picker */}
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Comuna</Text>
            <TouchableOpacity
              onPress={() => { if (!region) { Alert.alert('', 'Selecciona una región primero'); return; } setShowCityPicker(true); }}
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: region ? '#fff' : '#F9FAFB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, color: city ? '#1F2937' : '#9CA3AF' }}>{city || 'Selecciona una comuna'}</Text>
              <Text style={{ color: '#9CA3AF' }}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Credential upload */}
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Credencial Profesional *</Text>
            <TouchableOpacity
              onPress={() => pickImage(setCredentialUri)}
              style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: credentialUri ? '#059669' : GREEN, borderRadius: 14, paddingVertical: 20, alignItems: 'center', backgroundColor: credentialUri ? '#ECFDF5' : '#F0FDF4' }}
            >
              <Text style={{ fontSize: 28, marginBottom: 6 }}>{credentialUri ? '✅' : '📄'}</Text>
              <Text style={{ color: credentialUri ? '#059669' : GREEN, fontWeight: '600', fontSize: 14 }}>
                {credentialUri ? 'Documento cargado' : 'Subir título o credencial'}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>Foto o PDF del título profesional</Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <TouchableOpacity onPress={() => setTermsAccepted(!termsAccepted)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24, marginTop: 8 }} activeOpacity={0.7}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: termsAccepted ? GREEN : '#D1D5DB', backgroundColor: termsAccepted ? GREEN : '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              {termsAccepted && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 20 }}>
              He leído y acepto los <Text style={{ color: GREEN, fontWeight: '600' }}>Términos y Condiciones de Uso</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onSubmit}
            disabled={loading}
            style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 40, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Crear cuenta</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal visible={showRegionPicker} title="Selecciona tu región" options={REGION_NAMES} onSelect={handleRegionSelect} onClose={() => setShowRegionPicker(false)} />
      <PickerModal visible={showCityPicker} title="Selecciona tu comuna" options={region ? (REGIONS[region] || []) : []} onSelect={setCity} onClose={() => setShowCityPicker(false)} />
    </SafeAreaView>
  );
}
