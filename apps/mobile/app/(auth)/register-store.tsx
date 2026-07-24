import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { initFirebase, handleEmailAlreadyInUse, uploadImage } from '@junglapp/firebase';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { validateRut, formatRut } from '../../lib/rut';
import { locationKeys } from '../../lib/locationKey';

const { db } = initFirebase();

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

const schema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
  rut: z.string().min(8, 'RUT inválido').refine(validateRut, 'RUT inválido (verifica el dígito verificador)'),
  storeName: z.string().min(2, 'Nombre de tienda requerido'),
  storeDescription: z.string().min(10, 'Descripción requerida'),
  phone: z.string().min(9, 'Teléfono inválido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  address: z.string().min(5, 'Dirección requerida'),
  region: z.string().min(2, 'Región requerida'),
  city: z.string().min(2, 'Ciudad / Comuna requerida'),
});
type FormData = z.infer<typeof schema>;

const AMBER = '#D97706';
const AMBER_LIGHT = '#FEF3C7';

export default function RegisterStoreScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { region: '', city: '' },
  });

  const selectedRegion = watch('region');
  const selectedCity = watch('city');

  async function captureLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Puedes continuar el registro sin ubicación.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación. Puedes continuar sin ella.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function onSubmit(data: FormData) {
    if (!termsAccepted) {
      Alert.alert('Requerido', 'Debes aceptar los términos de uso para continuar.');
      return;
    }
    setLoading(true);
    try {
      const { firebaseUser } = await signUp(data.email, data.password, {
        role: 'store',
        name: data.name,
        rut: data.rut,
        phone: data.phone,
        email: data.email,
        address: data.address,
        region: data.region,
        city: data.city,
      }) as any;

      const uid = firebaseUser?.uid;
      if (uid) {
        // Photo is a nice-to-have — don't let an upload failure leave the account
        // half-created (auth user + no store profile doc).
        const photoUrl = photoUri ? await uploadImage(photoUri).catch(() => null) : null;
        await setDoc(doc(db, 'stores', uid), {
          userId: uid,
          rut: data.rut,
          name: data.storeName,
          description: data.storeDescription,
          address: data.address,
          region: data.region,
          city: data.city,
          ...locationKeys(data.city, data.region),
          phone: data.phone,
          email: data.email,
          ...(photoUrl ? { photoUrl } : {}),
          ...(location ? { location } : {}),
          status: 'pending',
          categories: [],
          services: [],
          createdAt: new Date().toISOString(),
        });
      }

      Alert.alert(
        '✅ Solicitud enviada',
        'Tu tienda está siendo revisada. Recibirás una notificación cuando sea aprobada. Mientras tanto, ya puedes explorar la app.'
      );
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        await handleEmailAlreadyInUse(data.email);
        Alert.alert('Correo en uso', '¿Olvidaste tu contraseña? Puedes recuperarla desde la pantalla de inicio.');
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  const baseFields: Array<{
    name: keyof FormData; label: string; placeholder: string;
    keyboard?: any; secure?: boolean; multiline?: boolean;
  }> = [
    { name: 'name', label: 'Tu nombre completo', placeholder: 'Juan Pérez' },
    { name: 'rut', label: 'RUT del responsable', placeholder: '12.345.678-9' },
    { name: 'storeName', label: 'Nombre de la tienda', placeholder: 'PetShop Mascotitas' },
    { name: 'storeDescription', label: 'Descripción de la tienda', placeholder: 'Vendemos productos premium para mascotas...', multiline: true },
    { name: 'phone', label: 'Teléfono', placeholder: '+56 9 1234 5678', keyboard: 'phone-pad' },
    { name: 'email', label: 'Correo electrónico', placeholder: 'tienda@ejemplo.com', keyboard: 'email-address' },
    { name: 'password', label: 'Contraseña', placeholder: '••••••••', secure: true },
    { name: 'address', label: 'Dirección de la tienda', placeholder: 'Av. Comercial 456' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ paddingHorizontal: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 24 }}>
            <Text style={{ color: AMBER, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: AMBER }}>🏪 Tienda Pet Shop</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Tu tienda será revisada antes de activarse</Text>
          </View>

          {/* Store photo */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: 'images' });
                if (!result.canceled) setPhotoUri(result.assets[0].uri);
              }}
              activeOpacity={0.8}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: 100, height: 100, borderRadius: 16 }} contentFit="cover" />
              ) : (
                <View style={{ width: 100, height: 100, borderRadius: 16, backgroundColor: '#FEF3C7', borderWidth: 2, borderStyle: 'dashed', borderColor: AMBER, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32 }}>🏪</Text>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: -6, right: -6, backgroundColor: AMBER, borderRadius: 12, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 14 }}>📷</Text>
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 10 }}>Logo o foto de la tienda</Text>
          </View>

          <View style={{ gap: 16 }}>
            {baseFields.map((f) => (
              <View key={f.name}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>{f.label}</Text>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      style={{
                        borderWidth: 1, borderColor: errors[f.name] ? '#EF4444' : '#E5E7EB',
                        borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
                        backgroundColor: '#fff', fontSize: 15,
                        ...(f.multiline ? { minHeight: 80, textAlignVertical: 'top' } : {}),
                      }}
                      placeholder={f.placeholder}
                      keyboardType={f.keyboard || 'default'}
                      autoCapitalize={f.name === 'rut' ? 'characters' : f.keyboard === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={f.secure}
                      multiline={f.multiline}
                      numberOfLines={f.multiline ? 3 : 1}
                      onChangeText={(t) => onChange(
                        f.name === 'rut' ? formatRut(t)
                        : f.keyboard === 'email-address' || f.secure ? t.replace(/\s/g, '')
                        : t
                      )}
                      value={value}
                      // Android autofill likes to "help" this field with an
                      // unrelated saved value, which formatRut then mangles
                      // into something RUT-shaped but invalid.
                      {...(f.name === 'rut' ? { autoComplete: 'off', textContentType: 'none', importantForAutofill: 'no' } : {})}
                    />
                  )}
                />
                {errors[f.name] && (
                  <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 3 }}>{errors[f.name]?.message}</Text>
                )}
              </View>
            ))}

            {/* Region picker */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>Región</Text>
              <TouchableOpacity
                onPress={() => setShowRegionPicker(true)}
                style={{
                  borderWidth: 1, borderColor: errors.region ? '#EF4444' : '#E5E7EB',
                  borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, color: selectedRegion ? '#1F2937' : '#9CA3AF' }}>
                  {selectedRegion || 'Selecciona tu región'}
                </Text>
                <Text style={{ color: '#9CA3AF' }}>›</Text>
              </TouchableOpacity>
              {errors.region && <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 3 }}>{errors.region.message}</Text>}
            </View>

            {/* City picker */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 4 }}>Ciudad / Comuna</Text>
              <TouchableOpacity
                onPress={() => selectedRegion ? setShowCityPicker(true) : Alert.alert('', 'Selecciona una región primero')}
                style={{
                  borderWidth: 1, borderColor: errors.city ? '#EF4444' : '#E5E7EB',
                  borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
                  backgroundColor: selectedRegion ? '#fff' : '#F9FAFB',
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, color: selectedCity ? '#1F2937' : '#9CA3AF' }}>
                  {selectedCity || 'Selecciona tu comuna'}
                </Text>
                <Text style={{ color: '#9CA3AF' }}>›</Text>
              </TouchableOpacity>
              {errors.city && <Text style={{ color: '#EF4444', fontSize: 11, marginTop: 3 }}>{errors.city.message}</Text>}
            </View>
          </View>

          {/* Geolocalización */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
              📍 Ubicación de la tienda
            </Text>
            <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 10 }}>
              Permite que los clientes cercanos puedan encontrar tu tienda.
            </Text>
            <TouchableOpacity
              onPress={captureLocation}
              disabled={gettingLocation}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: location ? '#10B981' : AMBER,
                borderRadius: 12, paddingVertical: 12, gap: 8,
                backgroundColor: location ? '#ECFDF5' : AMBER_LIGHT,
              }}
            >
              {gettingLocation
                ? <ActivityIndicator size="small" color={AMBER} />
                : <Text style={{ fontSize: 15 }}>{location ? '✅' : '📍'}</Text>
              }
              <Text style={{ color: location ? '#059669' : AMBER, fontWeight: '600' }}>
                {gettingLocation ? 'Obteniendo ubicación...'
                  : location ? `Ubicación capturada (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`
                    : 'Capturar ubicación actual'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Términos */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 }}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4, borderWidth: 2, marginTop: 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: termsAccepted ? AMBER : '#fff',
              borderColor: termsAccepted ? AMBER : '#D1D5DB',
            }}>
              {termsAccepted && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: '#6B7280' }}>
              He leído y acepto los{' '}
              <Text style={{ color: AMBER, fontWeight: '600' }}>Términos y Condiciones de Uso</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              backgroundColor: AMBER, borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', marginTop: 16, marginBottom: 40,
              opacity: loading ? 0.7 : 1,
            }}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {loading ? 'Enviando solicitud...' : 'Enviar Solicitud'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal
        visible={showRegionPicker}
        title="Selecciona tu región"
        options={REGION_NAMES}
        onSelect={(v) => { setValue('region', v, { shouldValidate: true }); setValue('city', '', { shouldValidate: false }); }}
        onClose={() => setShowRegionPicker(false)}
      />
      <PickerModal
        visible={showCityPicker}
        title="Selecciona tu comuna"
        options={selectedRegion ? (REGIONS[selectedRegion] || []) : []}
        onSelect={(v) => setValue('city', v, { shouldValidate: true })}
        onClose={() => setShowCityPicker(false)}
      />
    </SafeAreaView>
  );
}
