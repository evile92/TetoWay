import { isArabicScript, resolveHubName, resolveStopLabel } from '../i18n';
import landmarkAliasesRaw from '../i18n/landmarkAliases.json';
import type { BusLine, GeoPoint, Lang, OsmStop } from '../types/transit';
import { haversineMeters } from './transitGeo';

interface LandmarkAliasEntry {
  pattern: string;
  en: string;
  ar: string;
}

const LANDMARK_ALIASES = landmarkAliasesRaw as LandmarkAliasEntry[];

export type SearchPlaceKind = 'hub' | 'landmark' | 'stop';

export interface SearchablePlace {
  id: string;
  kind: SearchPlaceKind;
  label: string;
  dir: 'ltr' | 'rtl';
  secondaryLabel: string | null;
  secondaryDir: 'ltr' | 'rtl';
  point: GeoPoint;
  lineNumbers: string[];
  searchTokens: string;
  priority: number;
}

/** Accent- and Hamza-tolerant normalization shared by LineExplorer and TripPlanner. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064A')
    .toLowerCase()
    .trim();
}

function findMatchingAlias(rawNames: string[]): LandmarkAliasEntry | null {
  const normalizedCandidates = rawNames.map(normalizeSearchText).filter(Boolean);
  for (const entry of LANDMARK_ALIASES) {
    if (normalizedCandidates.some((name) => name.includes(entry.pattern))) {
      return entry;
    }
  }
  return null;
}

/** Build a deduplicated, offline-searchable index across hubs, route stops, and OSM landmarks. */
export function buildOfflineSearchPlaces(
  lines: BusLine[],
  osmStops: OsmStop[],
  lang: Lang,
): SearchablePlace[] {
  const places: SearchablePlace[] = [];
  const hubGroups = new Map<
    string,
    { point: GeoPoint; lineNumbers: Set<string>; extraNames: Set<string> }
  >();

  for (const line of lines) {
    for (const stop of line.stops) {
      if (!stop.hub_key) continue;
      const existing = hubGroups.get(stop.hub_key);
      if (existing) {
        existing.lineNumbers.add(line.number);
        if (stop.name_en) existing.extraNames.add(stop.name_en);
        if (stop.name_ar) existing.extraNames.add(stop.name_ar);
      } else {
        hubGroups.set(stop.hub_key, {
          point: { lat: stop.lat, lng: stop.lng },
          lineNumbers: new Set([line.number]),
          extraNames: new Set([stop.name_en, stop.name_ar].filter(Boolean)),
        });
      }
    }
  }

  for (const [hubKey, group] of hubGroups.entries()) {
    const labelEn = resolveHubName(hubKey, 'en');
    const labelAr = resolveHubName(hubKey, 'ar');
    const alias = findMatchingAlias([labelEn, ...group.extraNames]);
    const primaryText = lang === 'ar' ? labelAr : labelEn;
    const altText = lang === 'ar' ? labelEn : labelAr;

    places.push({
      id: `hub:${hubKey}`,
      kind: 'hub',
      label: primaryText,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      secondaryLabel: altText !== primaryText ? altText : null,
      secondaryDir: lang === 'ar' ? 'ltr' : 'rtl',
      point: group.point,
      lineNumbers: Array.from(group.lineNumbers),
      searchTokens: normalizeSearchText(
        [
          hubKey.replace(/_/g, ' '),
          labelEn,
          labelAr,
          alias?.en ?? '',
          alias?.ar ?? '',
          ...group.extraNames,
        ].join(' '),
      ),
      priority: 0,
    });
  }

  // Merge non-hub route stops across lines by proximity + normalized name
  const stopBuckets: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    normName: string;
    point: GeoPoint;
    lineNumbers: Set<string>;
  }> = [];

  for (const line of lines) {
    for (const stop of line.stops) {
      if (stop.hub_key) continue;
      const rawEn = stop.name_en.trim();
      const rawAr = stop.name_ar.trim();
      const norm = normalizeSearchText(rawEn || rawAr);
      if (!norm) continue;

      const matched = stopBuckets.find(
        (b) =>
          (b.normName === norm ||
            (haversineMeters(b.point.lng, b.point.lat, stop.lng, stop.lat) < 110 &&
              (b.normName.includes(norm) || norm.includes(b.normName)))) &&
          haversineMeters(b.point.lng, b.point.lat, stop.lng, stop.lat) < 350,
      );

      if (matched) {
        matched.lineNumbers.add(line.number);
        if (!matched.nameAr && rawAr) matched.nameAr = rawAr;
      } else {
        stopBuckets.push({
          id: `stop:${stop.id}`,
          nameEn: rawEn,
          nameAr: rawAr,
          normName: norm,
          point: { lat: stop.lat, lng: stop.lng },
          lineNumbers: new Set([line.number]),
        });
      }
    }
  }

  for (const bucket of stopBuckets) {
    const alias = findMatchingAlias([bucket.nameEn, bucket.nameAr]);
    const hasCustomArabic = Boolean(bucket.nameAr) || Boolean(alias?.ar);
    const resolved = resolveStopLabel(
      {
        hub_key: null,
        name_en: bucket.nameEn,
        name_ar: bucket.nameAr || alias?.ar || '',
      },
      lang,
    );

    const isLandmark = Boolean(alias);
    const secondary =
      lang === 'ar' && hasCustomArabic && bucket.nameEn !== resolved.text
        ? bucket.nameEn
        : lang === 'en' && bucket.nameAr
          ? bucket.nameAr
          : null;

    places.push({
      id: bucket.id,
      kind: isLandmark ? 'landmark' : 'stop',
      label: resolved.text,
      dir: resolved.dir,
      secondaryLabel: secondary,
      secondaryDir: secondary && isArabicScript(secondary) ? 'rtl' : 'ltr',
      point: bucket.point,
      lineNumbers: Array.from(bucket.lineNumbers),
      searchTokens: normalizeSearchText(
        [bucket.nameEn, bucket.nameAr, alias?.en ?? '', alias?.ar ?? ''].join(' '),
      ),
      priority: isLandmark ? 1 : 2,
    });
  }

  // Add distinct OSM stops / POIs not already covered within 120m
  const seenOsmKeys = new Set<string>();
  for (const osm of osmStops) {
    const rawEn = osm.name_en.trim();
    const rawAr = osm.name_ar.trim();
    const norm = normalizeSearchText(rawEn || rawAr);
    if (!norm || seenOsmKeys.has(norm)) continue;

    const alreadyCovered = places.some(
      (p) => haversineMeters(p.point.lng, p.point.lat, osm.lng, osm.lat) < 120,
    );
    if (alreadyCovered) continue;

    seenOsmKeys.add(norm);
    const alias = findMatchingAlias([rawEn, rawAr]);
    const resolved = resolveStopLabel(
      {
        hub_key: null,
        name_en: rawEn,
        name_ar: rawAr || alias?.ar || '',
      },
      lang,
    );
    const isLandmark = Boolean(alias);
    const secondary =
      lang === 'ar' && (rawAr || alias?.ar) && rawEn !== resolved.text
        ? rawEn
        : null;

    places.push({
      id: `osm:${osm.id}`,
      kind: isLandmark ? 'landmark' : 'stop',
      label: resolved.text,
      dir: resolved.dir,
      secondaryLabel: secondary,
      secondaryDir: 'ltr',
      point: { lat: osm.lat, lng: osm.lng },
      lineNumbers: [],
      searchTokens: normalizeSearchText(
        [rawEn, rawAr, alias?.en ?? '', alias?.ar ?? ''].join(' '),
      ),
      priority: isLandmark ? 1 : 3,
    });
  }

  return places.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.lineNumbers.length !== b.lineNumbers.length) {
      return b.lineNumbers.length - a.lineNumbers.length;
    }
    return a.label.localeCompare(b.label, lang);
  });
}

/** Search offline place index fast without allocations on empty query. */
export function searchOfflinePlaces(
  places: SearchablePlace[],
  rawQuery: string,
  limit = 28,
): SearchablePlace[] {
  const q = normalizeSearchText(rawQuery);
  if (!q) {
    return places.filter((p) => p.kind !== 'stop' || p.lineNumbers.length >= 2).slice(0, limit);
  }

  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { place: SearchablePlace; rank: number }[] = [];

  for (const place of places) {
    if (!terms.every((term) => place.searchTokens.includes(term))) {
      continue;
    }

    const normLabel = normalizeSearchText(place.label);
    let rank = place.priority * 10;
    if (normLabel.startsWith(q)) rank -= 25;
    else if (normLabel.includes(q)) rank -= 10;
    rank -= Math.min(place.lineNumbers.length, 8);
    scored.push({ place, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.place.label.localeCompare(b.place.label));
  return scored.slice(0, limit).map((item) => item.place);
}

/** Resolve human-readable label for a selected map/URL coordinate when near an indexed stop. */
export function formatSelectedPointLabel(
  places: SearchablePlace[],
  point: GeoPoint | null,
): string {
  if (!point) return '';
  let bestPlace: SearchablePlace | null = null;
  let bestDist = 75;

  for (const place of places) {
    const d = haversineMeters(point.lng, point.lat, place.point.lng, place.point.lat);
    if (d < bestDist) {
      bestDist = d;
      bestPlace = place;
    }
  }

  if (bestPlace) {
    return bestPlace.label;
  }
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}
