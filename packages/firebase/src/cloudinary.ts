// process.env.EXPO_PUBLIC_* is replaced at bundle time by babel-preset-expo.
// Avoid optional chaining (?.) here — some Babel versions only transform
// direct MemberExpression (process.env.X), not OptionalMemberExpression.
const CLOUD_NAME: string | undefined =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ||
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

const UPLOAD_PRESET: string | undefined =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ||
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
    pdf: 'application/pdf',
  };
  return map[ext] || 'image/jpeg';
}

export async function uploadImage(uri: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error('[Cloudinary] Credentials missing. CLOUD_NAME:', CLOUD_NAME, 'UPLOAD_PRESET:', UPLOAD_PRESET);
    }
    throw new Error('Error de configuración: credenciales de Cloudinary no disponibles. Reinicia Metro con --clear.');
  }

  const pathWithoutQuery = uri.split('?')[0];
  const ext = pathWithoutQuery.split('.').pop()?.toLowerCase() ?? '';
  const resolvedExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : 'jpg';
  const mimeType = getMimeType(resolvedExt);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const form = new FormData();
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('file', { uri, type: mimeType, name: `upload.${resolvedExt}` } as any);

  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      const j = JSON.parse(text);
      detail = j?.error?.message || j?.message || text.slice(0, 120);
    } catch {}
    throw new Error(`Error Cloudinary ${res.status}${detail ? ': ' + detail : ''}`);
  }
  const json = await res.json();
  return json.secure_url as string;
}

export async function uploadImages(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map(uploadImage));
}
