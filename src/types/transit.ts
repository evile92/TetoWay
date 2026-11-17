export type Lang = 'en' | 'ar';

export type Theme = 'light' | 'dark';

export type AppMode = 'explorer' | 'planner' | 'editor';

export type LineCategory = 'urban' | 'regional';

export type LineCategoryFilter = 'all' | LineCategory;

export type DirectionMode = 'outbound' | 'inbound';

export type MapPickMode =
  | 'none'
  | 'near_me'
  | 'trip_origin'
  | 'trip_destination'
  | 'editor_add_stop';

export type SheetSnap = 'collapsed' | 'half' | 'expanded';

export interface GeoPoint {
  lng: number;
  lat: number;
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface BusStop {
  id: string;
  order: number;
  hub_key: string | null;
  name_en: string;
  name_ar: string;
  lat: number;
  lng: number;
}

export interface BusLine {
  id: string;
  number: string;
  category: LineCategory;
  color: string;
  price_mad: number;
  first_departure: string;
  last_departure: string;
  frequency_mins: number;
  origin_key: string;
  destination_key: string;
  stops: BusStop[];
  geometry: LineStringGeometry;
}

export interface OsmStop {
  id: string;
  lat: number;
  lng: number;
  name_en: string;
  name_ar: string;
}

export interface NearbyStopAlternative {
  stop: BusStop;
  distanceMeters: number;
  walkingMinutes: number;
  servingLines: BusLine[];
}

export interface NearMeResult {
  userPoint: GeoPoint;
  nearestStop: BusStop;
  distanceMeters: number;
  walkingMinutes: number;
  walkingGeometry: LineStringGeometry;
  servingLines: BusLine[];
  alternativeStops: NearbyStopAlternative[];
}

export interface TripLeg {
  line: BusLine;
  boardStop: BusStop;
  alightStop: BusStop;
  segmentGeometry: LineStringGeometry;
  stopCount: number;
  rideDistanceMeters: number;
  rideMinutes: number;
}

export interface TripItinerary {
  type: 'direct' | 'transfer';
  originPoint: GeoPoint;
  destinationPoint: GeoPoint;
  walkToBoardMeters: number;
  walkToBoardMinutes: number;
  walkToBoardGeometry: LineStringGeometry;
  walkFromAlightMeters: number;
  walkFromAlightMinutes: number;
  walkFromAlightGeometry: LineStringGeometry;
  legs: TripLeg[];
  transferHubKey?: string;
  transferStopNameEn?: string;
  transferStopNameAr?: string;
  totalFareMad: number;
  totalMinutes: number;
  score: number;
}

export interface MapFocusTarget {
  seq: number;
  center?: [number, number];
  zoom?: number;
  bounds?: [[number, number], [number, number]];
  openStopId?: string;
}
