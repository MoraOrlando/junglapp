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
  // Same denormalization rationale as location/regionKey — lets a matched
  // owner see a contact number for the other pet's owner from the chat,
  // since reading another owner's users/{uid} doc directly isn't allowed.
  ownerPhone?: string;
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
  // Carnet / cédula de identidad — required only for solo home-visit vets
  // (isClinic falsy), same idImageUrl field name/purpose as Trainer, so
  // soporte can verify identity before setting status to 'approved'.
  idImageUrl?: string;
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
  // Collaborator vet accounts (created from the web clinic portal, see
  // createVetCollaborator) — same operational access to the clinic's agenda
  // and patients as the owner, without being this doc's own userId. See
  // isVetStaff() in firestore.rules. Only meaningful when isClinic is true.
  staffUids?: string[];
  // Customizable WhatsApp reminder copy for the Recordatorios module (see
  // VetReminderSend below) — owner-editable only (not in isVetStaff's field
  // whitelist in firestore.rules). Falls back to a hardcoded default in the
  // UI when unset, same as consultationFee/slotDuration defaults elsewhere.
  reminderMessageTemplate?: string;
  reminderMedicalMessageTemplate?: string;
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
  idImageUrl?: string;
  // Uploaded from the profile screen after the account already exists —
  // absent means "not requested yet", not "rejected". Reviewed by support
  // alongside idImageUrl during account approval.
  backgroundCheckUrl?: string | null;
  // General instructions shown to the owner before booking (meeting point,
  // what to bring, dogs not accepted, etc) — not a per-slot/per-booking note.
  serviceInstructions?: string;
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
  // Uploaded from the profile screen after the account already exists —
  // absent means "not requested yet", not "rejected". Reviewed by support
  // alongside idImageUrl during account approval.
  backgroundCheckUrl?: string | null;
  // General instructions shown to the owner before booking (meeting point,
  // what to bring, etc) — not a per-slot/per-booking note.
  serviceInstructions?: string;
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
  // Collaborator accounts (created from the web store portal) — same
  // operational access as the owner (products, orders, POS sales) without
  // being the store doc's own userId. See firestore.rules isStoreStaff().
  staffUids?: string[];
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
  // Who completed the appointment — the vet via their own app/portal, or
  // the owner marking it done themselves when the vet never did. Mirrors
  // the existing cancelledBy convention.
  completedBy?: 'owner' | 'vet';
  reason?: string;
  createdAt: string;
}

export interface ConsultationNote {
  diagnosis: string;
  treatment: string;
  careInstructions: string;
  prescription?: string;
  prescriptionImageUrl?: string;
  // Same categories as the owner's manual visit log (add-visit.tsx) —
  // 'Vacunas' | 'Control' | 'Operación' | 'Otro' — kept as a plain string
  // rather than a union so both entry points share one literal list without
  // this type having to be the source of truth for it.
  visitReason?: string;
  // The field both the mobile vet screen (apps/mobile/app/(vet)/appointment/[id].tsx)
  // and the web vet ERP (apps/web/app/vet/page.tsx) actually write for
  // "what was done" — treatment/careInstructions above were never adopted
  // by either implementation, which read this one with an `as any` fallback.
  treatmentDone?: string;
  createdAt: string;
}

// Fecha de próxima dosis/control (vacuna, antiparasitario, control general).
// 'vet_control' cubre también los reminders legacy creados antes de que
// existieran los tipos 'vaccine'/'antiparasitic'.
export type ReminderType = 'vaccine' | 'antiparasitic' | 'vet_control';

export interface Reminder {
  id: string;
  ownerId: string;
  petId: string;
  type: ReminderType;
  // Denormalizado desde el MedicalVisit que originó el ciclo — ausente en
  // reminders creados antes de este campo (fallback a 'general' en la UI).
  visitReason?: string;
  date: string; // YYYY-MM-DD
  vetName?: string | null;
  done: boolean;
  completedAt?: string;
  // Usado por la Cloud Function programada para no reenviar el push el mismo día.
  lastNotifiedDate?: string;
  sourceVisitId?: string;
  createdAt: string;
}

export interface MedicalVisit {
  id: string;
  petId: string;
  ownerId: string;
  date: string;
  // 'Vacunas' | 'Control' (=antiparasitario) | 'Operación' | 'Otro' — ver
  // apps/mobile/lib/visitReasons.ts, fuente única de verdad de estas categorías.
  visitReason: string;
  vetName: string;
  vetId?: string | null;
  // 0 cuando la visita se crea desde el flujo corto de "marcar como realizada".
  rating: number;
  notes?: string;
  // También reusado como foto de "comprobante de dosis" al completar un reminder.
  prescriptionUrl?: string | null;
  // Generalizado: próxima dosis/control para cualquier visitReason (antes solo
  // pensado para controles veterinarios).
  nextControlDate?: string | null;
  previousVisitId?: string | null;
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
  // Set for match chats so a matched owner can see a contact number without
  // needing to read the other owner's users/{uid} doc (not permitted
  // owner-to-owner — see firestore.rules).
  participantPhones?: Record<string, string>;
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

// One per professional account (stores, veterinarians, walkers, trainers,
// groomers — never owners). Doc ID matches the profile's own doc ID (e.g.
// subscriptions/{storeId} for a store). weekCount/weekStart back the
// basic-plan weekly order/appointment cap, enforced server-side in
// createOrder/createAppointment (Cloud Functions) — never trust a client
// write here.
export interface Subscription {
  id: string;
  profileType: 'store' | 'veterinarian' | 'walker' | 'trainer' | 'groomer';
  plan: 'basic' | 'premium';
  weekCount: number;
  weekStart: string;
  assignedBy?: string;
  // Set by the requestPremiumUpgrade callable when a Basic profile asks to be
  // upgraded; cleared whenever an admin changes the plan (approval or not).
  upgradeRequestedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// In-store (physical) POS sale — see firestore.rules `posSales` and
// confirmSale() in apps/web/app/store/page.tsx. buyerId is only set when the
// store links the sale to a registered owner account (linkPosSaleToBuyer
// Cloud Function, matched by the storeCustomer's email) — most sales have
// neither customerId nor buyerId.
export interface PosSale {
  id: string;
  storeId: string;
  items: OrderItem[];
  // Pre-discount total — absent on sales made before discounts existed, in
  // which case it equals total (no discount was ever possible).
  subtotal?: number;
  discount?: {
    scope: 'cart' | 'product';
    productId?: string;
    type: 'percent' | 'fixed';
    value: number;
    amount: number;
  };
  total: number;
  neto: number;
  iva: number;
  paymentMethod?: string;
  customerId?: string;
  buyerId?: string;
  createdAt: string;
}

// A store's own customer directory — created from the store portal (POS
// checkout) so a walk-in sale can be tied to a person by name/RUT/email,
// independent of whether they have a JunglApp account. Foundation for a
// future loyalty program; today it's also what lets the store email a
// receipt and, if the email matches a registered owner account, surface the
// sale in that person's in-app purchase history (see posSales.buyerId).
export interface StoreCustomer {
  id: string;
  storeId: string;
  name: string;
  rut: string;
  email: string;
  createdAt: string;
}

// A clinic's own price list for billable services (consultations already
// have consultationFee on the Veterinarian doc itself — this is for
// everything else: cleanings, procedures, etc.). Mirrors StoreService, kept
// as its own top-level collection (vetId FK) rather than embedded, since
// unlike a store's services this needs to be addable to a VetSale cart by
// staff other than the clinic owner (see isVetStaff in firestore.rules).
export interface VetService {
  id: string;
  vetId: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  createdAt: string;
}

// An exam a vet ordered during a consultation — tracks the clinical
// request/result lifecycle, deliberately separate from billing (see
// VetSale below): requesting an exam and charging for it are two different
// actions, and not every exam order necessarily has a matching charge line.
export interface ExamOrder {
  id: string;
  appointmentId: string;
  petId: string;
  ownerId: string;
  vetId: string;
  requestedBy: string;
  requestedByName: string;
  examName: string;
  notes?: string;
  status: 'pending' | 'ready';
  resultUrl?: string;
  resultUploadedAt?: string;
  createdAt: string;
}

export interface VetSaleItem {
  serviceId?: string;
  name: string;
  price: number;
  quantity: number;
}

// A clinic's per-visit charge — same shape/math as PosSale (reuses
// computeDiscountAmount/netoFromTotal/ivaFromTotal from
// apps/web/lib/pricing.ts and the same jsPDF receipt generator), but never
// touches product stock the way a store sale does. The generated PDF is an
// internal receipt, not a valid SII (Chilean tax authority) boleta — see
// apps/web/lib/receipt.ts. discount.scope/productId keep PosSale's naming
// (scope: 'product' means "one line", not literally a Product doc) so
// CartDiscount/computeDiscountAmount can be reused unmodified — productId
// here is a cart-local line key, not a Firestore doc id.
export interface VetSale {
  id: string;
  vetId: string;
  appointmentId?: string;
  petId?: string;
  ownerId?: string;
  items: VetSaleItem[];
  subtotal: number;
  discount?: {
    scope: 'cart' | 'product';
    productId?: string;
    type: 'percent' | 'fixed';
    value: number;
    amount: number;
  };
  total: number;
  neto: number;
  iva: number;
  paymentMethod?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// A clinic's manual expense entry for the Finanzas module — plain
// bookkeeping, no link to the vetInventoryItems stock below (recording a
// purchase as an expense doesn't move stock, and vice versa — the two are
// tracked independently, at least for now) and no tax math, unlike VetSale.
// Unlike VetSale (an immutable billing receipt), owner/staff can edit or
// delete their own entries — this is an internal ledger, not a legal
// document.
export interface VetExpense {
  id: string;
  vetId: string;
  category: string;
  description?: string;
  amount: number;
  paymentMethod?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// A clinic's inventory catalog entry — medications/supplies it stocks.
// 'product' has a sale price (dispensed/sold to an owner, e.g. antiparasitic
// pipettes); 'material' is internal consumable (syringes, gauze) that's
// typically costed but not sold on its own. minStock drives the "bajo
// stock" alert; cost (unit acquisition cost) drives the inventory valuation
// stat — price is what's charged, cost is what it took to stock it, and
// they can differ or either can be absent depending on the item.
export interface VetInventoryItem {
  id: string;
  vetId: string;
  kind: 'product' | 'material';
  name: string;
  sku?: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  price?: number;
  cost?: number;
  expirationDate?: string; // YYYY-MM-DD
  isActive: boolean;
  createdAt: string;
}

export type VetInventoryMovementType = 'entrada' | 'salida' | 'ajuste';

// A stock change on a VetInventoryItem — quantity is signed (positive for
// entrada, negative for salida; ajuste can be either) so the item's running
// stock is just the sum of its movements' quantities. itemName is
// denormalized so the Movimientos log reads without a join, same reasoning
// as VetSaleItem.name.
export interface VetInventoryMovement {
  id: string;
  vetId: string;
  itemId: string;
  itemName: string;
  type: VetInventoryMovementType;
  quantity: number;
  notes?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

// A click on "Enviar" in the Recordatorios (WhatsApp) module — opening the
// wa.me deep link is fire-and-forget (there's no WhatsApp Business API
// integration; the human presses Send inside WhatsApp themselves, see
// buildWhatsappLink in apps/web/app/vet/page.tsx), so this only logs that
// staff triggered a reminder for a given target. Drives the "ya enviado
// hoy" state and the "quedan N por avisar" count — it is not proof the
// message was actually delivered.
export type VetReminderSendKind = 'appointment' | 'medical' | 'custom';
export interface VetReminderSend {
  id: string;
  vetId: string;
  kind: VetReminderSendKind;
  // appointmentId for 'appointment', the reminders/{id} doc id for
  // 'medical', or a synthetic id for 'custom' (no natural target to dedupe
  // against).
  targetId: string;
  petName?: string;
  ownerName?: string;
  phone: string;
  message: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
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
