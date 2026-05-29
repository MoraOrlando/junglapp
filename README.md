# 🐾 JunglApp

Plataforma que conecta a **dueños de mascotas** con **veterinarios** y **tiendas**, con ficha médica, agendamiento de citas, match de mascotas, mensajería y marketplace.

Funciona en **iOS, Android y Web**.

## Arquitectura

Monorepo con **Turborepo**:

```
junglapp/
├── apps/
│   ├── mobile/          # Expo (React Native) — iOS + Android
│   └── web/             # Next.js 14 — Panel de soporte/admin
├── packages/
│   ├── types/           # Tipos TypeScript compartidos
│   └── firebase/        # Config Firebase compartida
└── firebase/            # Reglas de seguridad (Firestore, Storage, RTDB)
```

## Stack

- **Mobile**: Expo Router, NativeWind, react-hook-form + zod
- **Web**: Next.js App Router, Tailwind, Recharts
- **Backend**: Firebase (Auth, Firestore, Storage, Realtime Database)
- **Lenguaje**: TypeScript

## Roles de usuario

| Rol | Funciones |
|-----|-----------|
| 👨‍👩‍👧 **Dueño (Family Lover)** | Registrar mascotas, ficha médica, agendar veterinarios, match, chat, comprar en tiendas |
| 🩺 **Veterinario** | Gestionar agenda, marcar arribo, ver ficha médica, registrar diagnóstico/tratamiento/receta |
| 🏪 **Tienda** | Publicar productos, gestionar stock y pedidos |
| 🛟 **Soporte** | Dashboard analítico, gestionar usuarios, validar veterinarios y tiendas, monitorear mascotas extraviadas |

## Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilita **Authentication** (Email/Password), **Firestore**, **Storage** y **Realtime Database**
3. Copia `.env.example` a `.env.local` en `apps/mobile` y `apps/web`, y completa con tus credenciales

```bash
cp .env.example apps/mobile/.env.local
cp .env.example apps/web/.env.local
```

### 3. Desplegar reglas de seguridad

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,storage:rules,database
```

## Desarrollo

```bash
# Mobile (Expo)
npm run mobile

# Web (Next.js)
npm run web

# Todo a la vez
npm run dev
```

### Crear un usuario de soporte

El rol `support` debe asignarse manualmente en Firestore: crea/edita el documento del usuario en la colección `users` y establece `role: "support"`.

## Colecciones Firestore

`users`, `pets`, `veterinarians`, `stores`, `products`, `appointments`, `matches`, `chats`, `lostPets`, `orders`

Los mensajes del chat se almacenan en **Realtime Database** bajo `messages/{chatId}`.
