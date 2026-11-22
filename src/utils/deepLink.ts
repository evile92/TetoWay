import type { AppMode, BusLine, DirectionMode, GeoPoint, Lang } from '../types/transit';

export interface ParsedDeepLink {
  lang: Lang | null;
  mode: Exclude<AppMode, 'editor'> | null;
  lineParam: string | null;
  direction: DirectionMode | null;
  from: GeoPoint | null;
  to: GeoPoint | null;
  near: GeoPoint | null;
  itineraryIndex: number;
  editorAccess: boolean;
}

export interface DeepLinkSerializeState {
  lang: Lang;
  mode: AppMode;
  selectedLine: BusLine | null;
  direction: DirectionMode;
  originPoint: GeoPoint | null;
  destinationPoint: GeoPoint | null;
  nearMePoint: GeoPoint | null;
  selectedItineraryIndex: number;
  editorEnabled?: boolean;
}

function parseGeoParam(raw: string | null): GeoPoint | null {
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0].trim());
  const lng = Number(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function formatGeoParam(pt: GeoPoint): string {
  return `${pt.lat.toFixed(4)},${pt.lng.toFixed(4)}`;
}

/** Check whether the hidden `?admin=1` or `?editor=1` owner access parameter is set. */
export function hasEditorAccessParam(search: string): boolean {
  const params = new URLSearchParams(search);
  const adminVal = params.get('admin')?.toLowerCase();
  const editorVal = params.get('editor')?.toLowerCase();
  return (
    adminVal === '1' ||
    adminVal === 'true' ||
    editorVal === '1' ||
    editorVal === 'true'
  );
}

/** Parse shareable deep-link query parameters safely. */
export function parseDeepLink(search: string): ParsedDeepLink {
  const params = new URLSearchParams(search);
  const rawLang = params.get('lang');
  const lang: Lang | null = rawLang === 'ar' ? 'ar' : rawLang === 'en' ? 'en' : null;

  const lineParam = params.get('line')?.trim() || null;
  const rawDir = params.get('dir')?.toLowerCase();
  const direction: DirectionMode | null =
    rawDir === 'in' || rawDir === 'inbound'
      ? 'inbound'
      : rawDir === 'out' || rawDir === 'outbound'
        ? 'outbound'
        : null;

  const from = parseGeoParam(params.get('from'));
  const to = parseGeoParam(params.get('to'));
  const near = parseGeoParam(params.get('near'));

  const rawTrip = Number.parseInt(params.get('trip') ?? '', 10);
  const itineraryIndex = Number.isFinite(rawTrip) && rawTrip >= 0 && rawTrip < 10 ? rawTrip : 0;

  const rawMode = params.get('mode')?.toLowerCase();
  let mode: Exclude<AppMode, 'editor'> | null = null;
  if (rawMode === 'planner' || from || to || near) {
    mode = 'planner';
  } else if (rawMode === 'explorer' || lineParam) {
    mode = 'explorer';
  }

  return {
    lang,
    mode,
    lineParam,
    direction,
    from,
    to,
    near,
    itineraryIndex,
    editorAccess: hasEditorAccessParam(search),
  };
}

/** Match a BusLine by its public number (e.g. "1") or internal id (e.g. "L1"). */
export function findLineByParam(lines: BusLine[], param: string): BusLine | null {
  const target = param.trim().toLowerCase();
  if (!target) return null;
  return (
    lines.find((l) => l.number.toLowerCase() === target || l.id.toLowerCase() === target) ?? null
  );
}

/** Build query string for browser URL sync or public share links. */
export function buildDeepLinkSearch(
  state: DeepLinkSerializeState,
  options?: { includeEditor?: boolean; alwaysIncludeLang?: boolean },
): string {
  const params = new URLSearchParams();

  if (options?.includeEditor && state.editorEnabled) {
    params.set('editor', '1');
  }

  if (state.mode === 'planner') {
    params.set('mode', 'planner');
    if (state.originPoint) {
      params.set('from', formatGeoParam(state.originPoint));
    }
    if (state.destinationPoint) {
      params.set('to', formatGeoParam(state.destinationPoint));
    }
    if (!state.originPoint && !state.destinationPoint && state.nearMePoint) {
      params.set('near', formatGeoParam(state.nearMePoint));
    }
    if (state.originPoint && state.destinationPoint && state.selectedItineraryIndex > 0) {
      params.set('trip', String(state.selectedItineraryIndex));
    }
  } else if (state.mode === 'explorer' && state.selectedLine) {
    params.set('line', state.selectedLine.number);
    if (state.direction === 'inbound') {
      params.set('dir', 'in');
    }
  }

  if (options?.alwaysIncludeLang || state.lang === 'ar') {
    params.set('lang', state.lang);
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Build a clean, public share URL without exposing `?editor=1`. */
export function buildShareUrl(state: DeepLinkSerializeState): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  const query = buildDeepLinkSearch(state, { includeEditor: false, alwaysIncludeLang: true });
  return `${base}${query}`;
}

/** Copy plain text to clipboard with graceful textarea fallback. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy textarea selection copy
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** Trigger OS share sheet (mobile/WhatsApp) or copy clean deep link to clipboard. */
export async function shareTransitLink(options: {
  url: string;
  title: string;
  text: string;
}): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Fallback to clipboard if Web Share failed for permissions/desktop reasons
    }
  }

  const copied = await copyTextToClipboard(options.url);
  return copied ? 'copied' : 'failed';
}
