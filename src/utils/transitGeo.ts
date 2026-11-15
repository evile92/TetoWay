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

function metersToWalkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_SPEED_METERS_PER_MIN));
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
  const pt = turf.point([lng, lat]);

  return lines.filter((line) => {
    if (options?.excludeLineId && line.id === options.excludeLineId) {
      return false;
    }
    if (options?.hubKey && line.stops.some((s) => s.hub_key === options.hubKey)) {
      return true;
    }

    const hasNearbyStop = line.stops.some(
      (s) => turf.distance(pt, turf.point([s.lng, s.lat]), { units: 'meters' }) <= maxMeters,
    );
    if (hasNearbyStop) {
      return true;
    }

    if (line.geometry.coordinates.length >= 2) {
      const dist = turf.pointToLineDistance(pt, turf.lineString(line.geometry.coordinates), {
        units: 'meters',
      });
      return dist <= maxMeters;
    }

    return false;
  });
}

export function findNearestServedStop(userPoint: GeoPoint, lines: BusLine[]): NearMeResult | null {
  const features: ReturnType<
    typeof turf.point<{ stopIndex: number; lineId: string; key: string }>
  >[] = [];
  const lookup = new Map<string, BusStop>();

  for (const line of lines) {
    line.stops.forEach((stop, idx) => {
      const key = `${line.id}__${stop.id}`;
      lookup.set(key, stop);
      features.push(
        turf.point([stop.lng, stop.lat], {
          stopIndex: idx,
          lineId: line.id,
          key,
        }),
      );
    });
  }

  if (features.length === 0) {
    return null;
  }

  const target = turf.point([userPoint.lng, userPoint.lat]);
  const fc = turf.featureCollection(features);
  const nearest = turf.nearestPoint(target, fc);
  const key = nearest.properties.key as string;
  const nearestStop = lookup.get(key);

  if (!nearestStop) {
    return null;
  }

  const distanceMeters = Math.round(
    turf.distance(target, turf.point([nearestStop.lng, nearestStop.lat]), { units: 'meters' }),
  );

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

function getClosestAccessPerLine(point: GeoPoint, lines: BusLine[], maxWalkMeters: number): LineStopAccess[] {
  const pt = turf.point([point.lng, point.lat]);
  const accesses: LineStopAccess[] = [];

  for (const line of lines) {
    let bestStop: BusStop | null = null;
    let bestIdx = -1;
    let bestDist = Infinity;

    line.stops.forEach((stop, idx) => {
      const d = turf.distance(pt, turf.point([stop.lng, stop.lat]), { units: 'meters' });
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
): TripLeg {
  const segmentGeometry = safeSliceLine(line, boardStop, alightStop);
  const rideDistanceMeters = Math.round(
    turf.length(turf.lineString(segmentGeometry.coordinates), { units: 'meters' }),
  );

  return {
    line,
    boardStop,
    alightStop,
    segmentGeometry,
    stopCount: Math.max(1, Math.abs(alightIdx - boardIdx)),
    rideDistanceMeters,
  };
}

export function planTripItineraries(
  originPoint: GeoPoint,
  destinationPoint: GeoPoint,
  lines: BusLine[],
): TripItinerary[] {
  const directDistance = turf.distance(
    turf.point([originPoint.lng, originPoint.lat]),
    turf.point([destinationPoint.lng, destinationPoint.lat]),
    { units: 'meters' },
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

  const candidates: TripItinerary[] = [];

  // 1. Direct routes
  for (const orig of originAccess) {
    const dest = destByLine.get(orig.line.id);
    if (!dest || orig.stop.id === dest.stop.id) {
      continue;
    }

    const leg = buildLeg(orig.line, orig.stop, orig.stopIndex, dest.stop, dest.stopIndex);
    const totalWalk = orig.walkMeters + dest.walkMeters;
    const score = totalWalk + leg.rideDistanceMeters * 0.12;

    candidates.push({
      type: 'direct',
      originPoint,
      destinationPoint,
      walkToBoardMeters: orig.walkMeters,
      walkToBoardMinutes: metersToWalkMinutes(orig.walkMeters),
      walkToBoardGeometry: {
        type: 'LineString',
        coordinates: [
          [originPoint.lng, originPoint.lat],
          [orig.stop.lng, orig.stop.lat],
        ],
      },
      walkFromAlightMeters: dest.walkMeters,
      walkFromAlightMinutes: metersToWalkMinutes(dest.walkMeters),
      walkFromAlightGeometry: {
        type: 'LineString',
        coordinates: [
          [dest.stop.lng, dest.stop.lat],
          [destinationPoint.lng, destinationPoint.lat],
        ],
      },
      legs: [leg],
      totalFareMad: orig.line.price_mad,
      score,
    });
  }

  // 2. 1-Transfer routes at Dar Takafa or Rommana
  const topOrigins = originAccess.slice(0, 12);
  const topDests = destAccess.slice(0, 12);

  for (const hubKey of TRANSFER_HUB_KEYS) {
    for (const orig of topOrigins) {
      const transferIdx1 = orig.line.stops.findIndex((s) => s.hub_key === hubKey);
      if (transferIdx1 === -1) continue;
      const transferStop1 = orig.line.stops[transferIdx1];
      if (transferStop1.id === orig.stop.id) continue;

      for (const dest of topDests) {
        if (orig.line.id === dest.line.id) continue;
        const transferIdx2 = dest.line.stops.findIndex((s) => s.hub_key === hubKey);
        if (transferIdx2 === -1) continue;
        const transferStop2 = dest.line.stops[transferIdx2];
        if (transferStop2.id === dest.stop.id) continue;

        const leg1 = buildLeg(orig.line, orig.stop, orig.stopIndex, transferStop1, transferIdx1);
        const leg2 = buildLeg(dest.line, transferStop2, transferIdx2, dest.stop, dest.stopIndex);

        const totalWalk = orig.walkMeters + dest.walkMeters;
        const score = totalWalk + (leg1.rideDistanceMeters + leg2.rideDistanceMeters) * 0.12 + 450;

        candidates.push({
          type: 'transfer',
          originPoint,
          destinationPoint,
          walkToBoardMeters: orig.walkMeters,
          walkToBoardMinutes: metersToWalkMinutes(orig.walkMeters),
          walkToBoardGeometry: {
            type: 'LineString',
            coordinates: [
              [originPoint.lng, originPoint.lat],
              [orig.stop.lng, orig.stop.lat],
            ],
          },
          walkFromAlightMeters: dest.walkMeters,
          walkFromAlightMinutes: metersToWalkMinutes(dest.walkMeters),
          walkFromAlightGeometry: {
            type: 'LineString',
            coordinates: [
              [dest.stop.lng, dest.stop.lat],
              [destinationPoint.lng, destinationPoint.lat],
            ],
          },
          legs: [leg1, leg2],
          transferHubKey: hubKey,
          transferStopNameEn: transferStop1.name_en,
          transferStopNameAr: transferStop1.name_ar,
          totalFareMad: orig.line.price_mad + dest.line.price_mad,
          score,
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  // Deduplicate by leg line IDs so user gets genuinely distinct route options
  const unique: TripItinerary[] = [];
  const seenKeys = new Set<string>();
  for (const item of candidates) {
    const sig = item.legs.map((l) => l.line.id).join('>') + (item.transferHubKey ?? '');
    if (!seenKeys.has(sig)) {
      seenKeys.add(sig);
      unique.push(item);
    }
    if (unique.length >= 3) break;
  }

  return unique;
}

export async function resnapStopsWithOsrm(stops: BusStop[]): Promise<LineStringGeometry> {
  if (stops.length < 2) {
    throw new Error('At least 2 stops are required');
  }

  // OSRM public API allows up to 100 coordinates; sample cleanly if needed while keeping first & last
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
  if (geometry?.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    throw new Error('Invalid OSRM geometry');
  }

  return {
    type: 'LineString',
    coordinates: geometry.coordinates as [number, number][],
  };
}

export function getBboxForCoordinates(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    const [lng, lat] = coords[0];
    return [
      [lng - 0.01, lat - 0.01],
      [lng + 0.01, lat + 0.01],
    ];
  }
  const bbox = turf.bbox(turf.lineString(coords));
  return [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[3]],
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
