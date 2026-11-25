import type { GeoPoint } from '../types/transit';

export type SavedPlaceSlot = 'home' | 'university' | 'work';

export interface SavedPlace {
  slot: SavedPlaceSlot;
  label: string;
  point: GeoPoint;
}

export type SavedPlacesMap = Partial<Record<SavedPlaceSlot, SavedPlace>>;

export interface PopularDestination {
  id: string;
  name_en: string;
  name_ar: string;
  point: GeoPoint;
}

const SAVED_PLACES_STORAGE_KEY = 'tetoway-saved-places';
export const SAVED_PLACES_EVENT = 'tetoway-saved-places-changed';
const SAVED_PLACE_SLOTS: SavedPlaceSlot[] = ['home', 'university', 'work'];

/** Verified Tetouan & regional popular destination shortcuts matching dataset stops. */
export const POPULAR_DESTINATIONS: PopularDestination[] = [
  {
    id: 'martil_faculties',
    name_en: 'Martil Faculties',
    name_ar: 'كليات مرتيل',
    point: { lat: 35.609726, lng: -5.293906 },
  },
  {
    id: 'science_faculty',
    name_en: 'Faculty of Sciences',
    name_ar: 'كلية العلوم',
    point: { lat: 35.562623, lng: -5.363179 },
  },
  {
    id: 'civil_hospital',
    name_en: 'Civil Hospital',
    name_ar: 'المستشفى المدني',
    point: { lat: 35.572543, lng: -5.355339 },
  },
  {
    id: 'bus_station',
    name_en: 'Bus Station',
    name_ar: 'المحطة الطرقية',
    point: { lat: 35.560486, lng: -5.371018 },
  },
  {
    id: 'marjane',
    name_en: 'Marjane',
    name_ar: 'مرجان',
    point: { lat: 35.602661, lng: -5.336157 },
  },
  {
    id: 'martil',
    name_en: 'Martil',
    name_ar: 'مرتيل',
    point: { lat: 35.617984, lng: -5.275194 },
  },
  {
    id: 'mdiq',
    name_en: "M'diq",
    name_ar: 'المضيق',
    point: { lat: 35.685441, lng: -5.322959 },
  },
  {
    id: 'fnideq',
    name_en: 'Fnideq',
    name_ar: 'الفنيدق',
    point: { lat: 35.841411, lng: -5.355107 },
  },
];

function isValidSavedEntry(slot: SavedPlaceSlot, raw: unknown): raw is SavedPlace {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Partial<SavedPlace>;
  return (
    candidate.slot === slot &&
    typeof candidate.label === 'string' &&
    Boolean(candidate.point) &&
    typeof candidate.point?.lat === 'number' &&
    Number.isFinite(candidate.point.lat) &&
    typeof candidate.point?.lng === 'number' &&
    Number.isFinite(candidate.point.lng)
  );
}

function writeSavedPlaces(next: SavedPlacesMap): SavedPlacesMap {
  try {
    window.localStorage.setItem(SAVED_PLACES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SAVED_PLACES_EVENT));
  } catch {
    // Ignore storage errors in restricted browsing contexts
  }
  return next;
}

/** Read locally saved personal places (Home, University, Work) from device storage. */
export function readSavedPlaces(): SavedPlacesMap {
  try {
    const raw = window.localStorage.getItem(SAVED_PLACES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    const result: SavedPlacesMap = {};
    for (const slot of SAVED_PLACE_SLOTS) {
      if (isValidSavedEntry(slot, record[slot])) {
        result[slot] = record[slot];
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Persist a saved personal place slot and notify mounted TripPlanner views. */
export function saveSavedPlace(
  slot: SavedPlaceSlot,
  label: string,
  point: GeoPoint,
): SavedPlacesMap {
  const current = readSavedPlaces();
  const next: SavedPlacesMap = {
    ...current,
    [slot]: { slot, label: label.trim() || slot, point },
  };
  return writeSavedPlaces(next);
}

/** Remove a saved personal place slot and notify mounted TripPlanner views. */
export function removeSavedPlace(slot: SavedPlaceSlot): SavedPlacesMap {
  const current = readSavedPlaces();
  const next: SavedPlacesMap = { ...current };
  delete next[slot];
  return writeSavedPlaces(next);
}
