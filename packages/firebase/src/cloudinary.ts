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

// Every current call site is a photo (from the camera or the gallery, via
// expo-image-picker's mediaTypes:'images') — nothing in the app picks a PDF
// or other document today. Rejecting anything outside this list, instead of
// the old behavior of silently defaulting an unrecognized extension to
// 'jpg', matters because it used to let a non-image file (e.g. a video)
// upload mislabeled as a jpg instead of failing with a clear error.
// Kept in lockstep with ALLOWED_IMAGE_EXTENSIONS in functions/src/index.ts —
// the server has the final say (this is just an early, friendlier check).
const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  };
  return map[ext];
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
// `filename` is only used to determine the extension — pass the original
// File.name on web, where `uri` is a `blob:` object URL with no extension
// of its own (mobile's `file://` URIs already carry a real one, so callers
// there can omit it).
export async function uploadImage(uri: string, filename?: string): Promise<string> {
  const pathWithoutQuery = (filename ?? uri).split('?')[0];
  const ext = pathWithoutQuery.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error('Solo se permiten fotos (JPG, PNG o WEBP). Selecciona una imagen válida.');
  }
  const mimeType = getMimeType(ext);

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
  const result = await uploadUserImage({ base64, ext, contentType: mimeType });
  return result.data.url;
}

export async function uploadImages(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map((uri) => uploadImage(uri)));
}
