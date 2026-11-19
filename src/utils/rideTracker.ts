import type {
  BusLine,
  BusStop,
  DirectionMode,
  Lang,
  LineStringGeometry,
  RideAlertStage,
  RideGpsPosition,
  RideLegPlan,
  RideProgress,
  RideSession,
  TripItinerary,
  TripLeg,
} from '../types/transit';
import { haversineMeters } from './transitGeo';

const OFF_ROUTE_METERS = 850;
const ARRIVING_METERS_NORMAL = 135;
const ARRIVING_METERS_WEAK_GPS = 85;
const APPROACHING_METERS = 420;
const PASSED_CLEARANCE_METERS = 190;

/**
 * Extract the ordered sequence of stops from boarding stop to alighting stop,
 * reversing automatically when a trip leg runs inbound along the line.
 */
export function extractLegStops(leg: TripLeg): BusStop[] {
  const stops = leg.line.stops;
  const boardIdx = stops.findIndex((s) => s.id === leg.boardStop.id);
  const alightIdx = stops.findIndex((s) => s.id === leg.alightStop.id);

  if (boardIdx === -1 || alightIdx === -1) {
    return [leg.boardStop, leg.alightStop];
  }

  if (boardIdx <= alightIdx) {
    return stops.slice(boardIdx, alightIdx + 1);
  }

  return stops.slice(alightIdx, boardIdx + 1).reverse();
}

/** Build a live Ride Mode session from a planned direct or 1-transfer itinerary. */
export function buildRideSessionFromItinerary(itinerary: TripItinerary): RideSession {
  const legs: RideLegPlan[] = itinerary.legs.map((leg, idx) => {
    const orderedStops = extractLegStops(leg);
    const nextLeg = itinerary.legs[idx + 1];

    return {
      line: leg.line,
      stops: orderedStops,
      targetStopIndex: Math.max(0, orderedStops.length - 1),
      isTransferLeg: Boolean(nextLeg),
      nextLineNumber: nextLeg?.line.number,
      nextLineColor: nextLeg?.line.color,
      segmentGeometry: leg.segmentGeometry,
    };
  });

  return {
    source: 'itinerary',
    legs,
    activeLegIndex: 0,
  };
}

/** Build a live Ride Mode session from a single explored bus line & direction. */
export function buildRideSessionFromLine(
  line: BusLine,
  direction: DirectionMode,
  preferredTargetStopIndex?: number,
): RideSession {
  const orderedStops = direction === 'outbound' ? [...line.stops] : [...line.stops].reverse();
  const maxIdx = Math.max(0, orderedStops.length - 1);
  const defaultTarget =
    preferredTargetStopIndex !== undefined
      ? Math.min(maxIdx, Math.max(Math.min(1, maxIdx), preferredTargetStopIndex))
      : maxIdx;

  const geometry: LineStringGeometry =
    direction === 'outbound'
      ? line.geometry
      : {
          type: 'LineString',
          coordinates: [...line.geometry.coordinates].reverse(),
        };

  return {
    source: 'line',
    direction,
    legs: [
      {
        line,
        stops: orderedStops,
        targetStopIndex: defaultTarget,
        isTransferLeg: false,
        segmentGeometry: geometry,
      },
    ],
    activeLegIndex: 0,
  };
}

/** Clean initial progress state before the first GPS lock arrives. */
export function getInitialRideProgress(leg: RideLegPlan): RideProgress {
  const targetIdx = Math.min(leg.targetStopIndex, Math.max(0, leg.stops.length - 1));
  const nextIdx = Math.min(1, targetIdx);

  return {
    currentStopIndex: 0,
    nextStopIndex: nextIdx,
    stopsRemaining: Math.max(0, targetIdx),
    distanceToNextMeters: null,
    distanceToTargetMeters: null,
    nearestStopDistanceMeters: null,
    offRoute: false,
    stage: 'riding',
  };
}

/** Compute progress when a passenger manually selects their current stop (fallback without GPS). */
export function computeManualRideProgress(leg: RideLegPlan, stopIndex: number): RideProgress {
  const maxIdx = Math.max(0, leg.stops.length - 1);
  const clampedIdx = Math.min(maxIdx, Math.max(0, stopIndex));
  const targetIdx = Math.min(maxIdx, Math.max(0, leg.targetStopIndex));
  const nextIdx = Math.min(maxIdx, clampedIdx + 1);
  const stopsRemaining = Math.max(0, targetIdx - clampedIdx);

  let stage: RideAlertStage = 'riding';
  if (clampedIdx > targetIdx) {
    stage = 'passed';
  } else if (clampedIdx === targetIdx) {
    stage = 'arriving';
  } else if (stopsRemaining === 1) {
    stage = 'approaching';
  }

  return {
    currentStopIndex: clampedIdx,
    nextStopIndex: nextIdx,
    stopsRemaining,
    distanceToNextMeters: null,
    distanceToTargetMeters: null,
    nearestStopDistanceMeters: null,
    offRoute: false,
    stage,
  };
}

/**
 * Compute live passenger progress along an active bus leg using GPS coordinates.
 * Uses forward-biased anti-jitter hysteresis so noisy urban GPS bounces do not
 * falsely jump backward or trigger premature alighting alarms.
 */
export function computeRideProgress(
  leg: RideLegPlan,
  pos: RideGpsPosition,
  prevStopIndex: number | null,
): RideProgress {
  const stops = leg.stops;
  if (stops.length === 0) {
    return getInitialRideProgress(leg);
  }

  const maxIdx = stops.length - 1;
  const targetIdx = Math.min(maxIdx, Math.max(0, leg.targetStopIndex));

  const distances = stops.map((stop) =>
    Math.round(haversineMeters(pos.lng, pos.lat, stop.lng, stop.lat)),
  );

  let nearestIdx = 0;
  let nearestDist = distances[0];
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] < nearestDist) {
      nearestDist = distances[i];
      nearestIdx = i;
    }
  }

  const distanceToTargetMeters = distances[targetIdx];

  // If the passenger is far from the entire bus corridor (e.g., before boarding),
  // stay safely in 'riding' without firing false arrival/passed alarms.
  if (nearestDist > OFF_ROUTE_METERS) {
    const safeCurrent = prevStopIndex !== null ? Math.min(maxIdx, Math.max(0, prevStopIndex)) : 0;
    const safeNext = Math.min(maxIdx, safeCurrent + 1);
    return {
      currentStopIndex: safeCurrent,
      nextStopIndex: safeNext,
      stopsRemaining: Math.max(0, targetIdx - safeCurrent),
      distanceToNextMeters: distances[safeNext],
      distanceToTargetMeters,
      nearestStopDistanceMeters: nearestDist,
      offRoute: true,
      stage: 'riding',
    };
  }

  let currentStopIndex: number;
  if (prevStopIndex === null) {
    currentStopIndex = nearestIdx;
  } else {
    const clampedPrev = Math.min(maxIdx, Math.max(0, prevStopIndex));
    const distToPrev = distances[clampedPrev];

    if (nearestIdx > clampedPrev) {
      const jumpSize = nearestIdx - clampedPrev;
      if (jumpSize > 3 && nearestDist > 120) {
        // Avoid accidental cross-loop jumps unless unmistakably close to that stop
        let localBestIdx = clampedPrev;
        let localBestDist = distToPrev;
        const windowEnd = Math.min(maxIdx, clampedPrev + 3);
        for (let i = clampedPrev + 1; i <= windowEnd; i++) {
          if (distances[i] < localBestDist) {
            localBestDist = distances[i];
            localBestIdx = i;
          }
        }
        currentStopIndex =
          localBestIdx > clampedPrev && (localBestDist <= 280 || localBestDist + 35 < distToPrev)
            ? localBestIdx
            : clampedPrev;
      } else if (nearestDist <= 280 || nearestDist + 35 < distToPrev) {
        currentStopIndex = nearestIdx;
      } else {
        currentStopIndex = clampedPrev;
      }
    } else if (nearestIdx < clampedPrev) {
      // Allow moving backward only when clearly anchored at an earlier stop
      if (nearestDist <= 110 && distToPrev > 260) {
        currentStopIndex = nearestIdx;
      } else {
        currentStopIndex = clampedPrev;
      }
    } else {
      currentStopIndex = clampedPrev;
    }
  }

  const nextStopIndex = Math.min(maxIdx, currentStopIndex + 1);
  const stopsRemaining = Math.max(0, targetIdx - currentStopIndex);
  const distanceToNextMeters =
    currentStopIndex < maxIdx ? distances[nextStopIndex] : distances[currentStopIndex];

  const arrivingThreshold = pos.accuracy > 250 ? ARRIVING_METERS_WEAK_GPS : ARRIVING_METERS_NORMAL;

  let stage: RideAlertStage = 'riding';
  if (currentStopIndex > targetIdx && distanceToTargetMeters > PASSED_CLEARANCE_METERS) {
    stage = 'passed';
  } else if (
    distanceToTargetMeters <= arrivingThreshold ||
    (currentStopIndex === targetIdx && distanceToTargetMeters <= 180)
  ) {
    stage = 'arriving';
  } else if (
    stopsRemaining === 1 ||
    (stopsRemaining === 2 && distanceToTargetMeters <= APPROACHING_METERS)
  ) {
    stage = 'approaching';
  }

  return {
    currentStopIndex,
    nextStopIndex,
    stopsRemaining,
    distanceToNextMeters,
    distanceToTargetMeters,
    nearestStopDistanceMeters: nearestDist,
    offRoute: false,
    stage,
  };
}

/** Format distance cleanly in meters or kilometers with standard Western digits. */
export function formatRideDistance(
  meters: number,
  lang: Lang,
): { value: string; unit: string } {
  if (meters >= 1000) {
    return {
      value: (meters / 1000).toFixed(1),
      unit: lang === 'ar' ? 'كم' : 'km',
    };
  }
  return {
    value: String(Math.max(10, Math.round(meters / 10) * 10)),
    unit: lang === 'ar' ? 'متر' : 'm',
  };
}

/** Grammatically accurate English & Arabic label for remaining stops count. */
export function formatStopsRemainingLabel(count: number, lang: Lang): string {
  if (lang === 'ar') {
    if (count === 1) return 'محطة متبقية';
    if (count === 2) return 'محطتان متبقيتان';
    if (count >= 3 && count <= 10) return 'محطات متبقية';
    return 'محطة متبقية';
  }
  return count === 1 ? 'stop left' : 'stops left';
}
