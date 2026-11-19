import type { GeoPoint, LineStringGeometry } from '../types/transit';

const WALK_GRAPH_URL = '/data/tetouan-walk.bin';
const MAGIC_TTWK = 0x4b575454; // 'TTWK' little-endian
const SUPPORTED_VERSION = 1;
const GRID_CELL_DEG = 0.0025; // ~275m spatial bucket
const DEFAULT_SNAP_METERS = 350;
const MAX_EXPANSIONS = 18_000;
const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_PER_DEG_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat * 0.5);
  const sinDLng = Math.sin(dLng * 0.5);
  const a =
    sinDLat * sinDLat +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface WalkRouteResult {
  distanceMeters: number;
  geometry: LineStringGeometry;
  isStreetRouted: boolean;
}

interface SnapResult {
  nodeIndex: number;
  snapDistanceMeters: number;
}

function cellKey(cx: number, cy: number): number {
  return (cx + 500_000) * 1_000_000 + (cy + 500_000);
}

/**
 * Compact, zero-copy CSR offline pedestrian street graph with spatial hashing
 * and O(1)-reset generation-stamped A* routing.
 */
export class WalkGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  private readonly latE6: Int32Array;
  private readonly lngE6: Int32Array;
  private readonly offsets: Uint32Array;
  private readonly targets: Uint32Array;
  private readonly weights: Uint16Array;

  // Spatial uniform grid for sub-millisecond point-to-street snapping
  private readonly grid: Map<number, number[]>;

  // Reusable A* scratch buffers (zero allocations across queries)
  private readonly gScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly seenStamp: Uint32Array;
  private readonly closedStamp: Uint32Array;
  private generation = 0;

  private heapNodes: Int32Array;
  private heapF: Float32Array;

  constructor(
    nodeCount: number,
    edgeCount: number,
    latE6: Int32Array,
    lngE6: Int32Array,
    offsets: Uint32Array,
    targets: Uint32Array,
    weights: Uint16Array,
  ) {
    this.nodeCount = nodeCount;
    this.edgeCount = edgeCount;
    this.latE6 = latE6;
    this.lngE6 = lngE6;
    this.offsets = offsets;
    this.targets = targets;
    this.weights = weights;

    this.gScore = new Float32Array(nodeCount);
    this.cameFrom = new Int32Array(nodeCount);
    this.seenStamp = new Uint32Array(nodeCount);
    this.closedStamp = new Uint32Array(nodeCount);

    this.heapNodes = new Int32Array(2048);
    this.heapF = new Float32Array(2048);

    this.grid = new Map();
    for (let i = 0; i < nodeCount; i++) {
      const cx = Math.floor(lngE6[i] / (GRID_CELL_DEG * 1e6));
      const cy = Math.floor(latE6[i] / (GRID_CELL_DEG * 1e6));
      const key = cellKey(cx, cy);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(i);
    }
  }

  /** Snap any [lng, lat] point to the nearest walkable street node within `maxSnapMeters`. */
  snapPoint(point: GeoPoint, maxSnapMeters = DEFAULT_SNAP_METERS): SnapResult | null {
    const cx = Math.floor(point.lng / GRID_CELL_DEG);
    const cy = Math.floor(point.lat / GRID_CELL_DEG);
    const maxRing = Math.max(1, Math.ceil(maxSnapMeters / 250));

    let bestNode = -1;
    let bestDist = Infinity;

    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (ring > 0 && Math.abs(dx) < ring && Math.abs(dy) < ring) continue;
          const bucket = this.grid.get(cellKey(cx + dx, cy + dy));
          if (!bucket) continue;

          for (let i = 0; i < bucket.length; i++) {
            const idx = bucket[i];
            const d = haversineMeters(
              point.lng,
              point.lat,
              this.lngE6[idx] * 1e-6,
              this.latE6[idx] * 1e-6,
            );
            if (d < bestDist) {
              bestDist = d;
              bestNode = idx;
            }
          }
        }
      }

      if (bestNode !== -1 && bestDist <= (ring + 1) * 180) {
        break;
      }
    }

    if (bestNode === -1 || bestDist > maxSnapMeters) {
      return null;
    }

    return {
      nodeIndex: bestNode,
      snapDistanceMeters: bestDist,
    };
  }

  /**
   * Compute the shortest offline pedestrian street route between `from` and `to`.
   * Returns `null` if either endpoint is off the road network or no path exists within `maxRouteMeters`.
   */
  route(from: GeoPoint, to: GeoPoint, maxRouteMeters?: number): WalkRouteResult | null {
    const directMeters = haversineMeters(from.lng, from.lat, to.lng, to.lat);
    if (directMeters <= 25) {
      return {
        distanceMeters: Math.round(directMeters),
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        },
        isStreetRouted: true,
      };
    }

    const distanceLimit = maxRouteMeters ?? Math.min(5000, Math.max(2400, directMeters * 3.2));
    if (directMeters > distanceLimit) {
      return null;
    }

    const startSnap = this.snapPoint(from, DEFAULT_SNAP_METERS);
    const goalSnap = this.snapPoint(to, DEFAULT_SNAP_METERS);
    if (!startSnap || !goalSnap) {
      return null;
    }

    if (startSnap.nodeIndex === goalSnap.nodeIndex) {
      return {
        distanceMeters: Math.round(directMeters),
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        },
        isStreetRouted: true,
      };
    }

    const startIdx = startSnap.nodeIndex;
    const goalIdx = goalSnap.nodeIndex;
    const goalLatE6 = this.latE6[goalIdx];
    const goalLngE6 = this.lngE6[goalIdx];
    const mPerE6Lat = METERS_PER_DEG_LAT * 1e-6;
    const mPerE6Lng = METERS_PER_DEG_LAT * Math.cos(goalLatE6 * 1e-6 * DEG_TO_RAD) * 1e-6;

    // O(1) generation stamp reset
    this.generation += 1;
    if (this.generation === 0xffffffff) {
      this.seenStamp.fill(0);
      this.closedStamp.fill(0);
      this.generation = 1;
    }
    const gen = this.generation;

    const { latE6, lngE6, offsets, targets, weights, gScore, cameFrom, seenStamp, closedStamp } =
      this;

    let heapSize = 0;
    const pushHeap = (node: number, f: number) => {
      if (heapSize >= this.heapNodes.length) {
        const nextCap = this.heapNodes.length * 2;
        const nextNodes = new Int32Array(nextCap);
        const nextF = new Float32Array(nextCap);
        nextNodes.set(this.heapNodes);
        nextF.set(this.heapF);
        this.heapNodes = nextNodes;
        this.heapF = nextF;
      }

      let i = heapSize++;
      const nodes = this.heapNodes;
      const fs = this.heapF;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (fs[parent] <= f) break;
        nodes[i] = nodes[parent];
        fs[i] = fs[parent];
        i = parent;
      }
      nodes[i] = node;
      fs[i] = f;
    };

    const popHeap = (): number => {
      const nodes = this.heapNodes;
      const fs = this.heapF;
      const top = nodes[0];
      heapSize -= 1;
      if (heapSize > 0) {
        const lastNode = nodes[heapSize];
        const lastF = fs[heapSize];
        let i = 0;
        const half = heapSize >> 1;
        while (i < half) {
          let child = (i << 1) + 1;
          const right = child + 1;
          if (right < heapSize && fs[right] < fs[child]) {
            child = right;
          }
          if (lastF <= fs[child]) break;
          nodes[i] = nodes[child];
          fs[i] = fs[child];
          i = child;
        }
        nodes[i] = lastNode;
        fs[i] = lastF;
      }
      return top;
    };

    seenStamp[startIdx] = gen;
    gScore[startIdx] = 0;
    cameFrom[startIdx] = -1;

    const initDx = (lngE6[startIdx] - goalLngE6) * mPerE6Lng;
    const initDy = (latE6[startIdx] - goalLatE6) * mPerE6Lat;
    pushHeap(startIdx, Math.hypot(initDx, initDy) * 0.995);

    const graphBudget = Math.max(
      100,
      distanceLimit - startSnap.snapDistanceMeters - goalSnap.snapDistanceMeters,
    );

    let expansions = 0;
    let reached = false;

    while (heapSize > 0 && expansions < MAX_EXPANSIONS) {
      const topF = this.heapF[0];
      if (topF > graphBudget) {
        break;
      }

      const u = popHeap();
      if (closedStamp[u] === gen) continue;
      closedStamp[u] = gen;

      if (u === goalIdx) {
        reached = true;
        break;
      }

      expansions += 1;
      const gU = gScore[u];
      const edgeStart = offsets[u];
      const edgeEnd = offsets[u + 1];

      for (let e = edgeStart; e < edgeEnd; e++) {
        const v = targets[e];
        if (closedStamp[v] === gen) continue;

        const tentativeG = gU + weights[e];
        if (tentativeG > graphBudget) continue;

        if (seenStamp[v] !== gen || tentativeG < gScore[v]) {
          seenStamp[v] = gen;
          gScore[v] = tentativeG;
          cameFrom[v] = u;

          const dx = (lngE6[v] - goalLngE6) * mPerE6Lng;
          const dy = (latE6[v] - goalLatE6) * mPerE6Lat;
          const h = Math.hypot(dx, dy) * 0.995;
          pushHeap(v, tentativeG + h);
        }
      }
    }

    if (!reached) {
      return null;
    }

    // Reconstruct path from goalIdx back to startIdx
    const nodeChain: number[] = [];
    let cur = goalIdx;
    while (cur !== -1) {
      nodeChain.push(cur);
      cur = cameFrom[cur];
    }
    nodeChain.reverse();

    const coords: [number, number][] = [];
    const firstNodeLng = lngE6[nodeChain[0]] * 1e-6;
    const firstNodeLat = latE6[nodeChain[0]] * 1e-6;
    if (haversineMeters(from.lng, from.lat, firstNodeLng, firstNodeLat) > 3) {
      coords.push([from.lng, from.lat]);
    }

    for (let i = 0; i < nodeChain.length; i++) {
      const idx = nodeChain[i];
      coords.push([lngE6[idx] * 1e-6, latE6[idx] * 1e-6]);
    }

    const lastIdx = nodeChain[nodeChain.length - 1];
    const lastNodeLng = lngE6[lastIdx] * 1e-6;
    const lastNodeLat = latE6[lastIdx] * 1e-6;
    if (haversineMeters(to.lng, to.lat, lastNodeLng, lastNodeLat) > 3) {
      coords.push([to.lng, to.lat]);
    }

    const totalMeters = Math.max(
      Math.round(directMeters),
      Math.round(startSnap.snapDistanceMeters + gScore[goalIdx] + goalSnap.snapDistanceMeters),
    );

    if (totalMeters > distanceLimit) {
      return null;
    }

    return {
      distanceMeters: totalMeters,
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
      isStreetRouted: true,
    };
  }
}

/** Parse a `TTWK` v1 binary ArrayBuffer into an indexed `WalkGraph` with zero copies. */
export function parseWalkGraphBuffer(buffer: ArrayBuffer): WalkGraph | null {
  if (buffer.byteLength < 16) return null;

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const nodeCount = view.getUint32(8, true);
  const edgeCount = view.getUint32(12, true);

  if (magic !== MAGIC_TTWK || version !== SUPPORTED_VERSION || nodeCount === 0) {
    return null;
  }

  const expectedBytes =
    16 + nodeCount * 4 + nodeCount * 4 + (nodeCount + 1) * 4 + edgeCount * 4 + edgeCount * 2;
  if (buffer.byteLength !== expectedBytes) {
    return null;
  }

  let offset = 16;
  const latE6 = new Int32Array(buffer, offset, nodeCount);
  offset += nodeCount * 4;
  const lngE6 = new Int32Array(buffer, offset, nodeCount);
  offset += nodeCount * 4;
  const offsets = new Uint32Array(buffer, offset, nodeCount + 1);
  offset += (nodeCount + 1) * 4;
  const targets = new Uint32Array(buffer, offset, edgeCount);
  offset += edgeCount * 4;
  const weights = new Uint16Array(buffer, offset, edgeCount);

  return new WalkGraph(nodeCount, edgeCount, latE6, lngE6, offsets, targets, weights);
}

/** Route using the offline street graph when loaded, or fall back cleanly to straight line. */
export function routeWalkOrFallback(
  from: GeoPoint,
  to: GeoPoint,
  walkGraph: WalkGraph | null | undefined,
  maxRouteMeters?: number,
): WalkRouteResult {
  if (walkGraph) {
    const routed = walkGraph.route(from, to, maxRouteMeters);
    if (routed) return routed;
  }

  return {
    distanceMeters: Math.round(haversineMeters(from.lng, from.lat, to.lng, to.lat)),
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
    isStreetRouted: false,
  };
}

let cachedGraph: WalkGraph | null = null;
let loadingPromise: Promise<WalkGraph | null> | null = null;

/** Fetch and parse `/data/tetouan-walk.bin` once (precached offline via Service Worker). */
export function loadWalkGraph(): Promise<WalkGraph | null> {
  if (cachedGraph) {
    return Promise.resolve(cachedGraph);
  }
  if (!loadingPromise) {
    loadingPromise = fetch(WALK_GRAPH_URL)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return null;
        const parsed = parseWalkGraphBuffer(buf);
        if (parsed) {
          cachedGraph = parsed;
        }
        return parsed;
      })
      .catch(() => null);
  }
  return loadingPromise;
}
