export type UserRole = 'owner' | 'vet' | 'store' | 'walker' | 'grooming' | 'trainer' | 'support';

export interface UserAddress {
  id: string;
  label: string;
  address: string;
  city: string;
  region: string;
}

export interface User {
  uid: string;
  role: UserRole;
  name: string;
  rut: string;
  phone: string;
  email: string;
  address: string;
  region: string;
  city: string;
  postalCode?: string;
  location?: { lat: number; lng: number };
  photoUrl?: string;
  pushToken?: string;
  addresses?: UserAddress[];
  selectedAddressId?: string;
  // Account moderation state — 'active' when absent. Set to 'under_review'
  // automatically when a content report is filed against this user, and to
  // 'blocked' by support after reviewing it (blocks login).
  accountStatus?: 'active' | 'under_review' | 'blocked';
  createdAt: string;
}

export interface MedicalRecord {
  vaccinations: Vaccination[];
  allergies: string[];
  conditions: string[];
  notes: string;
  lastUpdated: string;
}

export interface Vaccination {
  name: string;
  date: string;
  nextDue?: string;
  vet?: string;
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  birthDate: string;
  familyDate: string;
  species: string;
  breed: string;
  color: string;
  photos: string[];
  description: string;
  chipNumber?: string;
  instagram?: string;
  sex?: 'M' | 'F' | null;
  weight?: number | null;
  allergic?: boolean;
  allergyNotes?: string;
  lookingForPartner: boolean;
  medicalRecord: MedicalRecord;
  createdAt: string;
}

export interface VetAvailability {
  [date: string]: string[]; // date -> available time slots
}

export interface Veterinarian {
  id: string;
  userId: string;
  name: string;
  rut: string;
  address: string;
  phone: string;
  email: string;
  consultationFee: number;
  licenseNumber: string;
  photoUrl?: string;
  credentialUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  specialties: string[];
  availability: VetAvailability;
  rating?: number;
  reviewCount?: number;
  // Clinic / emergency service info (shown in "Cerca de ti")
  is24_7?: boolean;
  openingHours?: string;
  clinicServices?: ClinicService[];
  location?: { lat: number; lng: number };
  createdAt: string;
}

export type ClinicService = 'veterinaria' | 'peluqueria' | 'rayos_x' | 'intervenciones';

export interface Walker {
  id: string;
  userId: string;
  name: string;
  rut: string;
  phone: string;
  email: string;
  region: string;
  city: string;
  address?: string;
  experience: number;
  maxDogs: number;
  sizesAccepted: string[];
  photoUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  availability: { [date: string]: string[] };
  slotDuration?: 30 | 45 | 60;
  rating?: number | null;
  reviewCount?: number;
  walkFee?: number | null;
  careFee?: number | null;
  location?: { lat: number; lng: number };
  createdAt: string;
  updatedAt?: string;
}

export interface GroomingService {
  id: string;
  name: string;
  price: number;
}

export interface Groomer {
  id: string;
  userId: string;
  name: string;
  businessName?: string;
  rut: string;
  phone: string;
  email: string;
  serviceType: 'home' | 'store';
  address?: string | null;
  region: string;
  city: string;
  services: string[];
  serviceOfferings?: GroomingService[];
  slotDuration?: 30 | 45 | 60;
  photoUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  availability: { [date: string]: string[] };
  fee?: number | null;
  rating?: number | null;
  reviewCount?: number;
  location?: { lat: number; lng: number };
  createdAt: string;
  updatedAt?: string;
}

export interface Trainer {
  id: string;
  userId: string;
  name: string;
  rut: string;
  phone: string;
  email: string;
  address: string;
  photoUrl?: string;
  idImageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  specialties: string[];
  certifications: string[];
  experience: string;
  serviceArea: string;
  consultationFee: number;
  rating?: number;
  reviewCount?: number;
  availability?: { [date: string]: string[] };
  location?: { lat: number; lng: number };
  createdAt: string;
}

export interface StoreService {
  id: string;
  name: string;
  description: string;
  price: number;
  duration?: string;
  isActive: boolean;
}

export interface Store {
  id: string;
  userId: string;
  rut: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  location?: { lat: number; lng: number };
  status: 'pending' | 'approved' | 'rejected';
  categories: string[];
  services: StoreService[];
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  photos: string[];
  stock: number;
  category: string;
  isActive: boolean;
  createdAt: string;
}

export interface Appointment {
  id: string;
  petId: string;
  ownerId: string;
  vetId: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'arrived' | 'completed' | 'cancelled';
  arrivedAt?: string;
  consultation?: ConsultationNote;
  reason?: string;
  createdAt: string;
}

export interface ConsultationNote {
  diagnosis: string;
  treatment: string;
  careInstructions: string;
  prescription?: string;
  prescriptionImageUrl?: string;
  createdAt: string;
}

export interface Match {
  id: string;
  pet1Id: string;
  pet2Id: string;
  owner1Id: string;
  owner2Id: string;
  status: 'pending' | 'matched' | 'rejected';
  createdAt: string;
}

export interface Chat {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  matchId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  chatId: string;
  messageText?: string;
  reason: string;
  status: 'pending' | 'reviewed';
  resolution?: 'blocked' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface LostPet {
  id: string;
  petId: string;
  ownerId: string;
  ownerName: string;
  petName: string;
  petSpecies: string;
  petBreed: string;
  petColor: string;
  petPhotos: string[];
  chipNumber?: string;
  region: string;
  state: string;
  description: string;
  characteristics?: string;
  lastSeenDate: string;
  lastSeenLocation: string;
  contactPhone: string;
  contactEmail: string;
  // Coordinates where the pet was reported lost (for the map view)
  lat?: number;
  lng?: number;
  isFound: boolean;
  foundBy?: string;
  foundAt?: string;
  reportedAt: string;
}

export type ChatType = 'match' | 'found_pet';

export interface Order {
  id: string;
  buyerId: string;
  storeId: string;
  products: OrderItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  photoUrl?: string;
}

export interface AdminStats {
  totalUsers: number;
  totalPets: number;
  totalVets: number;
  totalStores: number;
  pendingVets: number;
  pendingStores: number;
  lostPets: number;
  lostPetsByRegion: Record<string, number>;
  usersByMonth: Record<string, number>;
  petsBySpecies: Record<string, number>;
}
