import * as turf from '@turf/turf';
import type {
  BusLine,
  BusStop,
  GeoPoint,
  LineStringGeometry,
  NearMeResult,
  TripItinerary,
  TripLeg,
} from '../types/transit';

const TRANSFER_HUB_KEYS = ['dar_takafa', 'rommana'] as const;
const WALK_SPEED_METERS_PER_MIN = 75;
const URBAN_BUS_METERS_PER_MIN = 330;
const REGIONAL_BUS_METERS_PER_MIN = 600;
const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;

interface LineSpatialMeta {
  bbox: [number, number, number, number];
  stopCumMeters: number[];
}

const lineSpatialCache = new WeakMap<BusLine, LineSpatialMeta>();

/** Fast allocation-free spherical distance in meters between two [lng, lat] points. */
export function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat * 0.5);
  const sinDLng = Math.sin(dLng * 0.5);
  const a =
    sinDLat * sinDLat +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLineSpatialMeta(line: BusLine): LineSpatialMeta {
  const cached = lineSpatialCache.get(line);
  if (cached) return cached;

  const coords = line.geometry.coordinates;
  if (coords.length === 0) {
    const empty: LineSpatialMeta = {
      bbox: [0, 0, 0, 0],
      stopCumMeters: line.stops.map(() => 0),
    };
    lineSpatialCache.set(line, empty);
    return empty;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const cumVertexMeters = new Float64Array(coords.length);

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (i > 0) {
      cumVertexMeters[i] =
        cumVertexMeters[i - 1] + haversineMeters(coords[i - 1][0], coords[i - 1][1], lng, lat);
    }
  }

  const stopCumMeters = line.stops.map((stop) => {
    const cosLat = Math.cos(stop.lat * DEG_TO_RAD);
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const dx = (coords[i][0] - stop.lng) * cosLat;
      const dy = coords[i][1] - stop.lat;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }
    return cumVertexMeters[bestIdx];
  });

  const meta: LineSpatialMeta = {
    bbox: [minLng, minLat, maxLng, maxLat],
    stopCumMeters,
  };
  lineSpatialCache.set(line, meta);
  return meta;
}

function estimateStopPairDistanceMeters(
  line: BusLine,
  boardIdx: number,
  alightIdx: number,
): number {
  if (line.geometry.coordinates.length > 2) {
    const meta = getLineSpatialMeta(line);
    return Math.round(Math.abs(meta.stopCumMeters[alightIdx] - meta.stopCumMeters[boardIdx]));
  }
  const board = line.stops[boardIdx];
  const alight = line.stops[alightIdx];
  return Math.round(haversineMeters(board.lng, board.lat, alight.lng, alight.lat));
}

function metersToWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_SPEED_METERS_PER_MIN));
}

function estimateRideMinutes(
  rideDistanceMeters: number,
  stopCount: number,
  category: BusLine['category'],
): number {
  const speed =
    category === 'regional' ? REGIONAL_BUS_METERS_PER_MIN : URBAN_BUS_METERS_PER_MIN;
  const dwellPerStop = category === 'regional' ? 0.25 : 0.4;
  const minMins = category === 'regional' ? 3 : 2;
  return Math.max(minMins, Math.round(rideDistanceMeters / speed + stopCount * dwellPerStop));
}

function safeSliceLine(
  line: BusLine,
  startStop: Pick<BusStop, 'lat' | 'lng'>,
  endStop: Pick<BusStop, 'lat' | 'lng'>,
): LineStringGeometry {
  try {
    if (line.geometry.coordinates.length < 2) {
      return {
        type: 'LineString',
        coordinates: [
          [startStop.lng, startStop.lat],
          [endStop.lng, endStop.lat],
        ],
      };
    }

    const lineFeature = turf.lineString(line.geometry.coordinates);
    const sliced = turf.lineSlice(
      turf.point([startStop.lng, startStop.lat]),
      turf.point([endStop.lng, endStop.lat]),
      lineFeature,
    );

    if (sliced.geometry.coordinates.length >= 2) {
      return {
        type: 'LineString',
        coordinates: sliced.geometry.coordinates as [number, number][],
      };
    }
  } catch {
    // Fallback to full line geometry if slicing degenerates
  }
  return line.geometry;
}

export function getLinesServingPoint(
  lat: number,
  lng: number,
  lines: BusLine[],
  options?: { excludeLineId?: string; hubKey?: string | null; maxMeters?: number },
): BusLine[] {
  const maxMeters = options?.maxMeters ?? 120;
  const marginDeg = maxMeters * 0.000013;
  let pt: ReturnType<typeof turf.point> | null = null;

  return lines.filter((line) => {
    if (options?.excludeLineId && line.id === options.excludeLineId) {
      return false;
    }
    if (options?.hubKey && line.stops.some((s) => s.hub_key === options.hubKey)) {
      return true;
    }

    const { bbox } = getLineSpatialMeta(line);
    if (
      lng < bbox[0] - marginDeg ||
      lng > bbox[2] + marginDeg ||
      lat < bbox[1] - marginDeg ||
      lat > bbox[3] + marginDeg
    ) {
      return false;
    }

    const hasNearbyStop = line.stops.some(
      (s) => haversineMeters(lng, lat, s.lng, s.lat) <= maxMeters,
    );
    if (hasNearbyStop) {
      return true;
    }

    if (line.geometry.coordinates.length >= 2) {
      if (!pt) pt = turf.point([lng, lat]);
      const dist = turf.pointToLineDistance(pt, turf.lineString(line.geometry.coordinates), {
        units: 'meters',
      });
      return dist <= maxMeters;
    }

    return false;
  });
}

export function findNearestServedStop(userPoint: GeoPoint, lines: BusLine[]): NearMeResult | null {
  let nearestStop: BusStop | null = null;
  let minMeters = Infinity;

  for (const line of lines) {
    for (const stop of line.stops) {
      const d = haversineMeters(userPoint.lng, userPoint.lat, stop.lng, stop.lat);
      if (d < minMeters) {
        minMeters = d;
        nearestStop = stop;
      }
    }
  }

  if (!nearestStop) {
    return null;
  }

  const distanceMeters = Math.round(minMeters);
  const servingLines = getLinesServingPoint(nearestStop.lat, nearestStop.lng, lines, {
    hubKey: nearestStop.hub_key,
    maxMeters: 100,
  });

  return {
    userPoint,
    nearestStop,
    distanceMeters,
    walkingMinutes: metersToWalkMinutes(distanceMeters),
    walkingGeometry: {
      type: 'LineString',
      coordinates: [
        [userPoint.lng, userPoint.lat],
        [nearestStop.lng, nearestStop.lat],
      ],
    },
    servingLines,
  };
}

interface LineStopAccess {
  line: BusLine;
  stop: BusStop;
  stopIndex: number;
  walkMeters: number;
}

function getClosestAccessPerLine(
  point: GeoPoint,
  lines: BusLine[],
  maxWalkMeters: number,
): LineStopAccess[] {
  const accesses: LineStopAccess[] = [];

  for (const line of lines) {
    let bestStop: BusStop | null = null;
    let bestIdx = -1;
    let bestDist = Infinity;

    line.stops.forEach((stop, idx) => {
      const d = haversineMeters(point.lng, point.lat, stop.lng, stop.lat);
      if (d < bestDist) {
        bestDist = d;
        bestStop = stop;
        bestIdx = idx;
      }
    });

    if (bestStop && bestDist <= maxWalkMeters) {
      accesses.push({
        line,
        stop: bestStop,
        stopIndex: bestIdx,
        walkMeters: Math.round(bestDist),
      });
    }
  }

  return accesses.sort((a, b) => a.walkMeters - b.walkMeters);
}

function buildLeg(
  line: BusLine,
  boardStop: BusStop,
  boardIdx: number,
  alightStop: BusStop,
  alightIdx: number,
  legCache: Map<string, TripLeg>,
): TripLeg {
  const cacheKey = `${line.id}_${boardIdx}_${alightIdx}`;
  const cached = legCache.get(cacheKey);
  if (cached) return cached;

  const segmentGeometry = safeSliceLine(line, boardStop, alightStop);
  const rideDistanceMeters = Math.round(
    turf.length(turf.lineString(segmentGeometry.coordinates), { units: 'meters' }),
  );
  const stopCount = Math.max(1, Math.abs(alightIdx - boardIdx));

  const leg: TripLeg = {
    line,
    boardStop,
    alightStop,
    segmentGeometry,
    stopCount,
    rideDistanceMeters,
    rideMinutes: estimateRideMinutes(rideDistanceMeters, stopCount, line.category),
  };
  legCache.set(cacheKey, leg);
  return leg;
}

interface CandidateSpec {
  type: 'direct' | 'transfer';
  sig: string;
  orig: LineStopAccess;
  dest: LineStopAccess;
  transferIdx1?: number;
  transferIdx2?: number;
  transferStop1?: BusStop;
  transferStop2?: BusStop;
  transferHubKey?: string;
  score: number;
}

export function planTripItineraries(
  originPoint: GeoPoint,
  destinationPoint: GeoPoint,
  lines: BusLine[],
): TripItinerary[] {
  const directDistance = haversineMeters(
    originPoint.lng,
    originPoint.lat,
    destinationPoint.lng,
    destinationPoint.lat,
  );

  if (directDistance < 80 || lines.length === 0) {
    return [];
  }

  const maxWalk = 4500;
  const originAccess = getClosestAccessPerLine(originPoint, lines, maxWalk);
  const destAccess = getClosestAccessPerLine(destinationPoint, lines, maxWalk);

  const destByLine = new Map<string, LineStopAccess>();
  for (const d of destAccess) {
    destByLine.set(d.line.id, d);
  }

  const candidates: CandidateSpec[] = [];

  // 1. Score direct routes using O(1) precomputed corridor distances (no lineSlice yet)
  for (const orig of originAccess) {
    const dest = destByLine.get(orig.line.id);
    if (!dest || orig.stop.id === dest.stop.id) {
      continue;
    }

    const estRideMeters = estimateStopPairDistanceMeters(orig.line, orig.stopIndex, dest.stopIndex);
    const totalWalk = orig.walkMeters + dest.walkMeters;
    candidates.push({
      type: 'direct',
      sig: orig.line.id,
      orig,
      dest,
      score: totalWalk + estRideMeters * 0.12,
    });
  }

  // 2. Score 1-transfer routes at Dar Takafa or Rommana without calling lineSlice
  const topOrigins = originAccess.slice(0, 12);
  const topDests = destAccess.slice(0, 12);

  for (const hubKey of TRANSFER_HUB_KEYS) {
    for (const orig of topOrigins) {
      const transferIdx1 = orig.line.stops.findIndex((s) => s.hub_key === hubKey);
      if (transferIdx1 === -1) continue;
      const transferStop1 = orig.line.stops[transferIdx1];
      if (transferStop1.id === orig.stop.id) continue;

      const estRide1 = estimateStopPairDistanceMeters(orig.line, orig.stopIndex, transferIdx1);

      for (const dest of topDests) {
        if (orig.line.id === dest.line.id) continue;
        const transferIdx2 = dest.line.stops.findIndex((s) => s.hub_key === hubKey);
        if (transferIdx2 === -1) continue;
        const transferStop2 = dest.line.stops[transferIdx2];
        if (transferStop2.id === dest.stop.id) continue;

        const estRide2 = estimateStopPairDistanceMeters(dest.line, transferIdx2, dest.stopIndex);
        const totalWalk = orig.walkMeters + dest.walkMeters;

        candidates.push({
          type: 'transfer',
          sig: `${orig.line.id}>${dest.line.id}${hubKey}`,
          orig,
          dest,
          transferIdx1,
          transferIdx2,
          transferStop1,
          transferStop2,
          transferHubKey: hubKey,
          score: totalWalk + (estRide1 + estRide2) * 0.12 + 450,
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Deduplicate first, then run geometry slicing ONLY on the top 3 winning routes
  const winners: CandidateSpec[] = [];
  const seenKeys = new Set<string>();
  for (const item of candidates) {
    if (!seenKeys.has(item.sig)) {
      seenKeys.add(item.sig);
      winners.push(item);
      if (winners.length >= 3) break;
    }
  }

  const legCache = new Map<string, TripLeg>();

  return winners.map((c) => {
    const walkToBoardMinutes = metersToWalkMinutes(c.orig.walkMeters);
    const walkFromAlightMinutes = metersToWalkMinutes(c.dest.walkMeters);
    const walkToBoardGeometry: LineStringGeometry = {
      type: 'LineString',
      coordinates: [
        [originPoint.lng, originPoint.lat],
        [c.orig.stop.lng, c.orig.stop.lat],
      ],
    };
    const walkFromAlightGeometry: LineStringGeometry = {
      type: 'LineString',
      coordinates: [
        [c.dest.stop.lng, c.dest.stop.lat],
        [destinationPoint.lng, destinationPoint.lat],
      ],
    };

    if (c.type === 'direct') {
      const leg = buildLeg(
        c.orig.line,
        c.orig.stop,
        c.orig.stopIndex,
        c.dest.stop,
        c.dest.stopIndex,
        legCache,
      );
      return {
        type: 'direct',
        originPoint,
        destinationPoint,
        walkToBoardMeters: c.orig.walkMeters,
        walkToBoardMinutes,
        walkToBoardGeometry,
        walkFromAlightMeters: c.dest.walkMeters,
        walkFromAlightMinutes,
        walkFromAlightGeometry,
        legs: [leg],
        totalFareMad: c.orig.line.price_mad,
        totalMinutes: walkToBoardMinutes + leg.rideMinutes + walkFromAlightMinutes,
        score: c.score,
      };
    }

    const leg1 = buildLeg(
      c.orig.line,
      c.orig.stop,
      c.orig.stopIndex,
      c.transferStop1!,
      c.transferIdx1!,
      legCache,
    );
    const leg2 = buildLeg(
      c.dest.line,
      c.transferStop2!,
      c.transferIdx2!,
      c.dest.stop,
      c.dest.stopIndex,
      legCache,
    );
    const transferWaitMinutes = Math.min(
      12,
      Math.max(4, Math.round(c.dest.line.frequency_mins / 2)),
    );

    return {
      type: 'transfer',
      originPoint,
      destinationPoint,
      walkToBoardMeters: c.orig.walkMeters,
      walkToBoardMinutes,
      walkToBoardGeometry,
      walkFromAlightMeters: c.dest.walkMeters,
      walkFromAlightMinutes,
      walkFromAlightGeometry,
      legs: [leg1, leg2],
      transferHubKey: c.transferHubKey,
      transferStopNameEn: c.transferStop1!.name_en,
      transferStopNameAr: c.transferStop1!.name_ar,
      totalFareMad: c.orig.line.price_mad + c.dest.line.price_mad,
      totalMinutes:
        walkToBoardMinutes +
        leg1.rideMinutes +
        transferWaitMinutes +
        leg2.rideMinutes +
        walkFromAlightMinutes,
      score: c.score,
    };
  });
}

export async function resnapStopsWithOsrm(stops: BusStop[]): Promise<LineStringGeometry> {
  if (stops.length < 2) {
    throw new Error('At least 2 stops are required');
  }

  let waypoints = stops;
  if (stops.length > 90) {
    const step = (stops.length - 1) / 89;
    waypoints = [];
    for (let i = 0; i < 90; i++) {
      waypoints.push(stops[Math.round(i * step)]);
    }
  }

  const coords = waypoints.map((s) => `${s.lng},${s.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM HTTP ${res.status}`);
  }
  const data = await res.json();
  const geometry = data?.routes?.[0]?.geometry;
  if (
    geometry?.type !== 'LineString' ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length < 2
  ) {
    throw new Error('Invalid OSRM geometry');
  }

  return {
    type: 'LineString',
    coordinates: geometry.coordinates as [number, number][],
  };
}

export function getBboxForCoordinates(
  coords: [number, number][],
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    const [lng, lat] = coords[0];
    return [
      [lng - 0.01, lat - 0.01],
      [lng + 0.01, lat + 0.01],
    ];
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function getContrastTextColor(hexColor: string): string {
  const clean = hexColor.replace('#', '');
  if (clean.length !== 6) return '#FFFFFF';
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.68 ? '#09090B' : '#FFFFFF';
}
