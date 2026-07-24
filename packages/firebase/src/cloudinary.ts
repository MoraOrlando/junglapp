import { httpsCallable } from 'firebase/functions';
import { initFirebase } from './config';

// React Native only. Optional require so this module still loads in web bundles.
// Must be the /legacy subpath: SDK 54's expo-file-system replaced
// readAsStringAsync/EncodingType with a new File/Directory API, and the
// bare "expo-file-system" import only re-exports stubs for the old names
// that throw at runtime (and don't export EncodingType at all, so
// `FileSystem.EncodingType.Base64` below would read a property off
// undefined) — see https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/.
let FileSystem: any = null;
try { FileSystem = require('expo-file-system/legacy'); } catch {}

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
    pdf: 'application/pdf',
  };
  return map[ext] || 'image/jpeg';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Uploads go through the `uploadUserImage` callable Cloud Function rather than
// talking to Storage directly. Two reasons this can't be done client-side:
// - The plain `firebase` JS SDK cannot upload to Storage in React Native at all
//   (unsupported by the Firebase team: https://github.com/firebase/firebase-js-sdk/issues/8648).
//   It builds a combined multipart body via `new Blob([...])` internally, and RN's
//   Blob polyfill throws on raw binary data.
// - @react-native-firebase/storage (the native alternative) works, but has its own
//   auth session that isn't synced with the JS SDK auth used everywhere else in this
//   app, so Storage Security Rules reject every upload as unauthenticated.
// Calling a Function instead reuses the JS SDK's existing auth session (its ID token
// is attached to the call automatically), and the actual Storage write happens
// server-side via the Admin SDK.
export async function uploadImage(uri: string): Promise<string> {
  const pathWithoutQuery = uri.split('?')[0];
  const ext = pathWithoutQuery.split('.').pop()?.toLowerCase() ?? '';
  const resolvedExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : 'jpg';
  const mimeType = getMimeType(resolvedExt);

  let base64: string;
  if (FileSystem && uri.startsWith('file://')) {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } else {
    const response = await fetch(uri);
    const blob = await response.blob();
    base64 = await blobToBase64(blob);
  }

  const { functions } = initFirebase();
  const uploadUserImage = httpsCallable<{ base64: string; ext: string; contentType: string }, { url: string }>(
    functions,
    'uploadUserImage'
  );
  const result = await uploadUserImage({ base64, ext: resolvedExt, contentType: mimeType });
  return result.data.url;
}

export async function uploadImages(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map(uploadImage));
}
