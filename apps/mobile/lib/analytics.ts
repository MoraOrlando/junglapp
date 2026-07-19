import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';

// Modular API (not the namespaced analytics().logEvent() form) — the
// namespaced API is deprecated in RNFirebase v22+ and logs a console
// warning on every single call, which is noticeable when events fire on
// every screen focus (near_category_viewed etc.) and was adding visible
// navigation jank.
const analyticsInstance = getAnalytics(getApp());

// Thin, typed wrappers around Firebase Analytics — keeps event names and
// params consistent across call sites instead of scattering raw logEvent()
// calls with ad-hoc strings. Failures are swallowed: analytics must never
// break a user-facing action.
function log(name: string, params?: Record<string, string | number | boolean>) {
  logEvent(analyticsInstance, name, params).catch(() => {});
}

export function logSignUpCompleted(role: string) {
  log('sign_up_completed', { role });
}

export function logAppointmentBooked(category: 'vet' | 'walker' | 'groomer' | 'trainer') {
  log('appointment_booked', { category });
}

export function logAppointmentCompleted(category: 'vet' | 'walker' | 'groomer' | 'trainer') {
  log('appointment_completed', { category });
}

export function logAppointmentCancelled(category: 'vet' | 'walker' | 'groomer' | 'trainer') {
  log('appointment_cancelled', { category });
}

export function logOrderPlaced() {
  log('order_placed');
}

export function logChatMessageSent() {
  log('chat_message_sent');
}

export function logNearCategoryViewed(category: string) {
  log('near_category_viewed', { category });
}

export function logNearSearchUsed() {
  log('near_search_used');
}

export function logNearResultOpened(kind: string) {
  log('near_result_opened', { kind });
}

export function logAddressAdded() {
  log('address_added');
}

export function logPlaceAdded(category: 'park' | 'restaurant') {
  log('place_added', { category });
}

export function logPlaceViewed(category: 'park' | 'restaurant') {
  log('place_viewed', { category });
}

export function logPlaceReviewed(category: 'park' | 'restaurant') {
  log('place_reviewed', { category });
}

export function logPlaceDuplicateDetected(category: 'park' | 'restaurant') {
  log('place_duplicate_detected', { category });
}

export function logMatchLiked() {
  log('match_liked');
}

export function logMatchMutual() {
  log('match_mutual');
}
