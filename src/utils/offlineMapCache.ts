export const OFFLINE_MAP_CACHE = 'tetoway-offline-map-v1';
export const OFFLINE_MAP_APPROX_MB = '6.5';

const TILE_URL = '/tiles/tetouan.pmtiles';

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
  const totalAssets = OFFLINE_MAP_ASSETS.length;
  let completed = 0;

  const markDone = () => {
    completed += 1;
    if (onProgress) {
      onProgress(Math.min(100, Math.round((completed / totalAssets) * 100)));
    }
  };

  onProgress?.(1);

  // Download the primary 4.4 MB PMTiles archive as a full 200 OK response
  const tileRes = await fetch(TILE_URL, { cache: 'no-store' });
  if (!tileRes.ok) {
    throw new Error(`HTTP ${tileRes.status}`);
  }
  await cache.put(TILE_URL, tileRes);
  markDone();

  // Download sprites and glyphs cleanly in small batches
  const secondary = OFFLINE_MAP_ASSETS.slice(1);
  const BATCH_SIZE = 4;
  for (let i = 0; i < secondary.length; i += BATCH_SIZE) {
    const batch = secondary.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} for ${url}`);
        }
        await cache.put(url, res);
        markDone();
      }),
    );
  }
}

export async function clearOfflineMapCache(): Promise<void> {
  if (!supportsOfflineMapCache()) return;
  await window.caches.delete(OFFLINE_MAP_CACHE);
}
