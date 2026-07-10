import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

function H1({ children }: { children: string }) {
  return <Text className="text-2xl font-bold text-primary-700 mt-6 mb-2">{children}</Text>;
}
function H2({ children }: { children: string }) {
  return <Text className="text-base font-semibold text-gray-800 mt-4 mb-1">{children}</Text>;
}
function P({ children }: { children: string }) {
  return <Text className="text-sm text-gray-600 leading-6 mb-2">{children}</Text>;
}
function LI({ children }: { children: string }) {
  return <Text className="text-sm text-gray-600 leading-6 mb-1">{`•  ${children}`}</Text>;
}

export default function TermsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-row items-center px-6 pt-4 pb-2">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-primary-500 text-base">← Volver</Text>
        </TouchableOpacity>
      </View>
      <ScrollView className="px-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="text-3xl font-bold text-primary-700 mt-2">Documentos Legales</Text>
        <P>JunglApp — Plataforma de gestión de mascotas, servicios veterinarios a domicilio y comercio. Conforme a la Ley N° 21.719 sobre Protección y Tratamiento de los Datos Personales y a la legislación chilena vigente.</P>
        <P>Última actualización: 29 de mayo de 2026.</P>

        <H1>1. Política de Privacidad</H1>
        <P>JunglApp informa a sus usuarios cómo recopila, usa, almacena, comparte y protege sus datos personales, en cumplimiento de la Ley N° 21.719, la Ley N° 19.496 sobre protección de los derechos de los consumidores y demás normativa aplicable.</P>

        <H2>1.2. Definiciones</H2>
        <LI>Datos personales: cualquier información que identifique o haga identificable a una persona natural (nombre, RUT, correo, teléfono, dirección, identificadores en línea, geolocalización).</LI>
        <LI>Titular: la persona natural a quien conciernen los datos.</LI>
        <LI>Tratamiento: cualquier operación sobre datos (recolección, almacenamiento, uso, comunicación, supresión).</LI>
        <LI>Encargado: tercero que trata datos por cuenta del Responsable (proveedores de nube, pasarela de pago, notificaciones).</LI>

        <H2>1.3. Datos que recopilamos</H2>
        <P>La App distingue cuatro categorías de usuarios: dueños de mascotas, veterinarios, tiendas y veterinarias.</P>
        <LI>Dueños: nombre, RUT, dirección, correo y teléfono; datos de las mascotas (nombre, color, raza, chip, fotografías); ficha médica de la mascota; datos de transacciones.</LI>
        <LI>El RUT se utiliza exclusivamente como identificador único para asociar al dueño con su(s) mascota(s). No se publica ni se usa para otros fines.</LI>
        <LI>Veterinarios: nombre, RUT, contacto, antecedentes profesionales, agenda, precios y datos para recepción de pagos.</LI>
        <LI>Tiendas: datos de la tienda, catálogo, ofertas y pedidos.</LI>
        <LI>Automáticos: identificadores del dispositivo, IP, sistema operativo, logs y geolocalización (cuando se autoriza).</LI>

        <H2>1.4. Finalidades del tratamiento</H2>
        <LI>Crear y administrar la cuenta y autenticar el acceso.</LI>
        <LI>Gestionar la ficha de la mascota y su historial de salud.</LI>
        <LI>Permitir reserva, agendamiento y pago anticipado de servicios veterinarios a domicilio.</LI>
        <LI>Gestionar publicación de productos, ofertas y seguimiento de pedidos.</LI>
        <LI>Enviar comunicaciones operativas y, con consentimiento, comerciales.</LI>
        <LI>Procesar pagos, prevenir fraudes y cumplir obligaciones legales.</LI>

        <H2>1.7. Derechos de los titulares (ARCOP)</H2>
        <P>Todo titular puede ejercer gratuitamente los derechos de Acceso, Rectificación, Cancelación/Supresión, Oposición, Portabilidad y Bloqueo. La cancelación de la cuenta y de todos los datos asociados puede hacerse de forma instantánea desde Mi Perfil → Eliminar cuenta, dentro de la App. El resto de las solicitudes se responden dentro de 30 días corridos y pueden reclamarse ante la Agencia de Protección de Datos Personales.</P>

        <H2>1.9. Seguridad</H2>
        <P>Aplicamos cifrado en tránsito y en reposo, control de accesos por rol, registros de actividad, respaldos y revisión periódica.</P>

        <H2>1.10. Menores de edad</H2>
        <P>La App está dirigida a personas mayores de 18 años.</P>

        <H1>2. Términos y Condiciones de Uso</H1>
        <P>Al registrarse o utilizar la App, el usuario acepta estos Términos en su totalidad. Si no está de acuerdo, debe abstenerse de usar la App.</P>

        <H2>2.1. Naturaleza del servicio</H2>
        <P>La App es una plataforma tecnológica que conecta a dueños de mascotas con veterinarios, veterinarias y tiendas. La Empresa actúa como intermediario tecnológico. La responsabilidad por la calidad de la atención veterinaria y de los productos recae en el respectivo prestador o tienda.</P>

        <H2>2.2. Registro y cuenta</H2>
        <LI>El usuario debe ser mayor de 18 años y entregar información veraz, completa y actualizada.</LI>
        <LI>El usuario es responsable de la confidencialidad de sus credenciales y de la actividad de su cuenta.</LI>
        <LI>Veterinarios y tiendas declaran contar con las habilitaciones, títulos y autorizaciones legales que su actividad exige.</LI>

        <H2>2.4. Lo que NO está permitido</H2>
        <P>JunglApp tiene tolerancia cero hacia el contenido objetable y los usuarios abusivos. Está prohibido:</P>
        <LI>Entregar información falsa, suplantar identidad o usar el RUT de un tercero.</LI>
        <LI>Publicar contenido ilegal, ofensivo, difamatorio, discriminatorio, violento, sexual o engañoso.</LI>
        <LI>Acosar, amenazar o abusar de otros usuarios en el chat o cualquier otra sección de la App.</LI>
        <LI>Emitir valoraciones falsas, compradas o coordinadas.</LI>
        <LI>Ofrecer servicios veterinarios sin el título habilitante exigido por la ley.</LI>
        <LI>Comercializar productos prohibidos, falsificados o vencidos.</LI>
        <LI>Extracción masiva de datos (scraping), ingeniería inversa o vulnerar la seguridad.</LI>
        <LI>Eludir los mecanismos de pago de la plataforma.</LI>

        <H2>2.4.1. Reportes y bloqueo de usuarios</H2>
        <P>Todo chat cuenta con herramientas para reportar contenido inapropiado y bloquear usuarios abusivos. Los reportes son revisados dentro de 24 horas; el contenido que infrinja estos Términos será eliminado y el usuario responsable podrá ser expulsado de la plataforma.</P>

        <H2>2.5. Pagos y reembolsos</H2>
        <P>Los pagos se procesan mediante pasarelas externas; la Empresa no almacena los datos completos de las tarjetas. Se respetan los derechos del consumidor de la Ley N° 19.496, incluido el derecho a retracto y garantía cuando corresponda.</P>

        <H2>2.7. Responsabilidad</H2>
        <P>La Empresa no garantiza disponibilidad ininterrumpida ni responde por la calidad de servicios o productos de terceros. La relación clínica se establece directamente entre el dueño y el veterinario.</P>

        <H2>2.10. Legislación aplicable</H2>
        <P>Estos Términos se rigen por las leyes de la República de Chile, sin perjuicio de las acciones que la ley reconoce a los consumidores ante el SERNAC y los juzgados de policía local.</P>

        <H1>3. Política de Datos y Cumplimiento</H1>
        <P>Marco interno de gobierno de datos basado en los principios de licitud, finalidad, minimización, calidad, transparencia, seguridad y responsabilidad. La Empresa mantiene un registro de actividades de tratamiento, gestiona encargados mediante contratos de encargo, administra el consentimiento de forma separada y revocable, atiende los derechos ARCOP y gestiona brechas de seguridad notificando a la Agencia cuando corresponda.</P>

        <Text className="text-xs text-gray-400 mt-8 text-center">— Fin del documento —</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
