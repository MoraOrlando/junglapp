const CLOUD_NAME =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);

const UPLOAD_PRESET =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET);

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
    throw new Error('Cloudinary credentials not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.');
  }

  const pathWithoutQuery = uri.split('?')[0];
  const ext = pathWithoutQuery.split('.').pop()?.toLowerCase() ?? '';
  const resolvedExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : 'jpg';
  const mimeType = getMimeType(resolvedExt);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  const form = new FormData();
  form.append('upload_preset', UPLOAD_PRESET);
  // Restrict allowed formats server-side so Cloudinary rejects unexpected content types
  form.append('allowed_formats', 'jpg,jpeg,png,webp,pdf');
  form.append('file', { uri, type: mimeType, name: `upload.${resolvedExt}` } as any);

  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Error al subir imagen: ${res.status}`);
  const json = await res.json();
  return json.secure_url as string;
}

export async function uploadImages(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map(uploadImage));
}
