export type UserRole = 'owner' | 'vet' | 'store' | 'walker' | 'grooming' | 'trainer' | 'support';

export interface UserAddress {
  id: string;
  label: string;
  address: string;
  city: string;
  region: string;
  cityKey?: string;
  regionKey?: string;
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
  cityKey?: string;
  regionKey?: string;
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
  // false right after signup until the owner completes address/RUT/phone in
  // (auth)/complete-profile — absent (not false) means the field predates
  // this flow, so treat missing the same as true.
  profileComplete?: boolean;
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
  // Set from the pet's ficha when the owner records a date of death. Once
  // set, the pet is excluded from vet/groomer/trainer/walker booking pickers
  // and sorted to the end of the owner's pet list (shown greyed out).
  deceasedAt?: string;
  // Copied from the owner's own location (if captured) when they turn
  // lookingForPartner on — Match candidates from other owners are readable
  // by anyone (see firestore.rules), but another owner's full user profile
  // is not, so this denormalized copy is what powers the distance badge in
  // Match without exposing the owner's account.
  location?: { lat: number; lng: number };
  // Same denormalization rationale as location — lets Match candidate
  // queries filter by where('regionKey', '==', ...) without exposing the
  // owner's full profile to other owners.
  regionKey?: string;
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
  // city/region are used to match this vet against a pet owner's location in
  // "Cerca de ti" — without them, matchesLocation() can't compare against the
  // owner's city/region and effectively matches everywhere.
  city?: string;
  region?: string;
  cityKey?: string;
  regionKey?: string;
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
  // isClinic distinguishes a multi-vet clinic from a solo practitioner —
  // it must NOT be inferred from is24_7 (a solo vet can offer 24/7 urgent
  // care without being a clinic) or from clinicServices alone.
  isClinic?: boolean;
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
  cityKey?: string;
  regionKey?: string;
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
  cityKey?: string;
  regionKey?: string;
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
  region?: string;
  city?: string;
  cityKey?: string;
  regionKey?: string;
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
  // city/region are used to match this store against a pet owner's location in
  // "Cerca de ti" — without them, matchesLocation() can't compare against the
  // owner's city/region and effectively matches everywhere.
  city?: string;
  region?: string;
  cityKey?: string;
  regionKey?: string;
  phone: string;
  email: string;
  logoUrl?: string;
  location?: { lat: number; lng: number };
  status: 'pending' | 'approved' | 'rejected';
  categories: string[];
  services: StoreService[];
  // Undefined means the store hasn't configured this yet — treat as
  // offersDelivery: true, offersPickup: false (today's implicit behavior).
  offersDelivery?: boolean;
  offersPickup?: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  // Set only when the product is on sale — the "was" price shown crossed out.
  // A product is considered on sale when originalPrice is set and > price.
  originalPrice?: number;
  photos: string[];
  stock: number;
  category: string;
  isActive: boolean;
  // Gates whether a discounted product (originalPrice > price) shows in the
  // "Cerca de ti" promo banner. The store can request ('pending') or clear
  // it; only support can set 'approved' (see the products Firestore rule).
  promotionStatus?: 'pending' | 'approved' | 'rejected';
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

export type PlaceCategory = 'park' | 'restaurant';

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  address?: string;
  description?: string;
  photoUrl?: string;
  location: { lat: number; lng: number };
  cityKey?: string;
  regionKey?: string;
  createdBy: string;
  createdByName: string;
  rating: number;
  reviewCount: number;
  createdAt: string;
}

// Community events shown in "Cerca de ti > Entretención" (e.g. a dog run).
// Stays visible until the end of the calendar day of eventDate — expiresAt
// is precomputed at creation so clients can filter with a plain range query.
export interface CommunityEvent {
  id: string;
  name: string;
  place: string;
  address: string;
  region: string;
  regionKey?: string;
  photoUrl?: string;
  eventDate: string;
  expiresAt: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface PlaceReview {
  id: string;
  placeId: string;
  ownerId: string;
  ownerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ContentReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  // Exactly one context is present: a chat report (chatId, optional
  // messageText), a place/review report (placeId, placeName), or an
  // event report (eventId, eventName).
  chatId?: string;
  messageText?: string;
  placeId?: string;
  placeName?: string;
  eventId?: string;
  eventName?: string;
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
  buyerName?: string;
  buyerPhone?: string;
  storeId: string;
  products: OrderItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | 'alternative_offered';
  // Store's counter-offer text, set when status is 'alternative_offered'.
  alternativeMessage?: string;
  // Service-type orders (e.g. grooming booked through the store portal)
  // carry a service payload instead of products.
  type?: 'product' | 'service';
  service?: { serviceName: string; note?: string };
  shippingAddress: string;
  // Undefined on orders placed before this field existed — treat as 'delivery'.
  deliveryMethod?: 'delivery' | 'pickup';
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
