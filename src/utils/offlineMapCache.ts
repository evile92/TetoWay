import { FetchSource, PMTiles, Protocol } from 'pmtiles';
import type { RangeResponse, Source } from 'pmtiles';
import type { AddProtocolAction } from 'maplibre-gl';

export const OFFLINE_MAP_CACHE = 'tetoway-offline-map-v1';
export const OFFLINE_MAP_APPROX_MB = '6.5';

const TILE_URL = '/tiles/tetouan.pmtiles';
const TOTAL_PACK_BYTES_ESTIMATE = 6_835_434;

async function fetchIntoCacheWithByteProgress(
  cache: Cache,
  url: string,
  onBytesReceived: (deltaBytes: number) => void,
): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
  let blob: Blob;

  if (res.body) {
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        chunks.push(value);
        onBytesReceived(value.byteLength);
      }
    }
    blob = new Blob(chunks, { type: contentType });
  } else {
    blob = await res.blob();
    onBytesReceived(blob.size);
  }

  // Strip Content-Encoding because Fetch stream delivers decoded bytes
  const cleanHeaders = new Headers(res.headers);
  cleanHeaders.delete('content-encoding');
  cleanHeaders.set('content-length', String(blob.size));
  await cache.put(
    url,
    new Response(blob, {
      status: res.status,
      statusText: res.statusText,
      headers: cleanHeaders,
    }),
  );
}

const FONT_FAMILIES = ['Noto Sans Regular', 'Noto Sans Medium'] as const;
const FONT_RANGES = [
  '0-255',
  '256-511',
  '1536-1791',
  '1792-2047',
  '8192-8447',
  '11520-11775',
  '64512-64767',
  '64768-65023',
  '65024-65279',
] as const;

const SPRITE_ASSETS = [
  '/sprites/v4/light.json',
  '/sprites/v4/light.png',
  '/sprites/v4/light@2x.json',
  '/sprites/v4/light@2x.png',
  '/sprites/v4/dark.json',
  '/sprites/v4/dark.png',
  '/sprites/v4/dark@2x.json',
  '/sprites/v4/dark@2x.png',
] as const;

const FONT_ASSETS = FONT_FAMILIES.flatMap((family) =>
  FONT_RANGES.map((range) => `/fonts/${encodeURIComponent(family)}/${range}.pbf`),
);

export const OFFLINE_MAP_ASSETS: readonly string[] = [
  TILE_URL,
  ...SPRITE_ASSETS,
  ...FONT_ASSETS,
];

/**
 * Custom PMTiles archive Source that reads slices straight from the cached Blob in
 * Cache Storage when offline pack is saved, falling back to HTTP Range streaming otherwise.
 */
class CachedPMTilesSource implements Source {
  private readonly archiveUrl: string;
  private readonly cacheKeyUrl: string;
  private readonly fetchFallback: FetchSource;
  private cachedBlobPromise: Promise<Blob | null> | null = null;

  constructor(archiveUrl: string, cacheKeyUrl: string) {
    this.archiveUrl = archiveUrl;
    this.cacheKeyUrl = cacheKeyUrl;
    this.fetchFallback = new FetchSource(archiveUrl);
  }

  getKey(): string {
    return this.archiveUrl;
  }

  invalidateMemoryCache(): void {
    this.cachedBlobPromise = null;
  }

  private async getCachedBlob(): Promise<Blob | null> {
    if (!supportsOfflineMapCache()) return null;
    if (!this.cachedBlobPromise) {
      this.cachedBlobPromise = window.caches
        .open(OFFLINE_MAP_CACHE)
        .then((cache) => cache.match(this.cacheKeyUrl))
        .then((res) => (res ? res.blob() : null))
        .catch(() => null);
    }
    const blob = await this.cachedBlobPromise;
    if (!blob) {
      this.cachedBlobPromise = null;
    }
    return blob;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResponse> {
    const cachedBlob = await this.getCachedBlob();
    if (cachedBlob) {
      const end = Math.min(cachedBlob.size, offset + length);
      const data = await cachedBlob.slice(offset, end).arrayBuffer();
      return { data };
    }
    return this.fetchFallback.getBytes(offset, length, signal, etag);
  }
}

const pmtilesProtocol = new Protocol();
let protocolRegistered = false;
let activeCachedSource: CachedPMTilesSource | null = null;
let activeArchive: PMTiles | null = null;

export function registerOfflinePmtilesProtocol(
  addProtocolFn: (scheme: string, handler: AddProtocolAction) => void,
): void {
  if (protocolRegistered || typeof window === 'undefined') return;
  const archiveUrl = `${window.location.origin}${TILE_URL}`;
  activeCachedSource = new CachedPMTilesSource(archiveUrl, TILE_URL);
  activeArchive = new PMTiles(activeCachedSource);
  pmtilesProtocol.add(activeArchive);
  addProtocolFn('pmtiles', pmtilesProtocol.tile);
  protocolRegistered = true;
}

async function invalidateActiveArchive(): Promise<void> {
  if (activeCachedSource) {
    activeCachedSource.invalidateMemoryCache();
    if (activeArchive) {
      try {
        await activeArchive.cache.invalidate(activeCachedSource);
      } catch {
        // Ignore cache invalidation error when archive is uncached
      }
    }
  }
}

export function supportsOfflineMapCache(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

export async function isOfflineMapCached(): Promise<boolean> {
  if (!supportsOfflineMapCache()) return false;
  try {
    const cache = await window.caches.open(OFFLINE_MAP_CACHE);
    const tileMatch = await cache.match(TILE_URL);
    const keyFontMatch = await cache.match(
      `/fonts/${encodeURIComponent('Noto Sans Regular')}/0-255.pbf`,
    );
    const arFontMatch = await cache.match(
      `/fonts/${encodeURIComponent('Noto Sans Regular')}/1536-1791.pbf`,
    );
    return Boolean(tileMatch && keyFontMatch && arFontMatch);
  } catch {
    return false;
  }
}

export async function downloadOfflineMap(
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!supportsOfflineMapCache()) {
    throw new Error('Cache API unavailable');
  }

  const cache = await window.caches.open(OFFLINE_MAP_CACHE);
  let receivedBytes = 0;
  let lastPercent = 1;

  onProgress?.(1);

  const reportDelta = (delta: number) => {
    receivedBytes += delta;
    if (!onProgress) return;
    const nextPercent = Math.min(
      99,
      Math.max(1, Math.round((receivedBytes / TOTAL_PACK_BYTES_ESTIMATE) * 100)),
    );
    if (nextPercent > lastPercent) {
      lastPercent = nextPercent;
      onProgress(nextPercent);
    }
  };

  await fetchIntoCacheWithByteProgress(cache, TILE_URL, reportDelta);

  const secondary = OFFLINE_MAP_ASSETS.slice(1);
  const BATCH_SIZE = 4;
  for (let i = 0; i < secondary.length; i += BATCH_SIZE) {
    const batch = secondary.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((url) => fetchIntoCacheWithByteProgress(cache, url, reportDelta)),
    );
  }

  onProgress?.(100);
  await invalidateActiveArchive();
}

export async function clearOfflineMapCache(): Promise<void> {
  if (!supportsOfflineMapCache()) return;
  await window.caches.delete(OFFLINE_MAP_CACHE);
  await invalidateActiveArchive();
}
