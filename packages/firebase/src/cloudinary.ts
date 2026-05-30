const CLOUD_NAME =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) ||
  'dhfhv1a3l';

const UPLOAD_PRESET =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET) ||
  'junglapp_uploads';

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export async function uploadImage(uri: string): Promise<string> {
  const form = new FormData();
  form.append('upload_preset', UPLOAD_PRESET);
  // React Native requires the file object shape below; web fetch handles Blob/File directly
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as any);

  const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  const json = await res.json();
  return json.secure_url as string;
}

export async function uploadImages(uris: string[]): Promise<string[]> {
  return Promise.all(uris.map(uploadImage));
}
