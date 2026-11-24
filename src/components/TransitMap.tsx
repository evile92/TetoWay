import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  addProtocol,
  setWorkerUrl,
} from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getDir, resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  AppMode,
  BusLine,
  BusStop,
  DirectionMode,
  GeoPoint,
  Lang,
  MapFocusTarget,
  MapPickMode,
  NearMeResult,
  OsmStop,
  RideGpsPosition,
  RideLegPlan,
  RideProgress,
  Theme,
  TripItinerary,
} from '../types/transit';
import { registerOfflinePmtilesProtocol } from '../utils/offlineMapCache';
import { buildTetouanMapStyle } from '../utils/offlineMapStyle';
import { getContrastTextColor, getLinesServingPoint } from '../utils/transitGeo';

setWorkerUrl(maplibreWorkerUrl);
registerOfflinePmtilesProtocol(addProtocol);

const TETOUAN_CENTER: [number, number] = [-5.365, 35.573];
const INITIAL_ZOOM = 12.5;

function detectWebGLSupport(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

interface TransitMapProps {
  lang: Lang;
  theme: Theme;
  mode: AppMode;
  lines: BusLine[];
  osmStops: OsmStop[];
  showOsmStops: boolean;
  selectedLine: BusLine | null;
  direction: DirectionMode;
  pickMode: MapPickMode;
  nearMeResult: NearMeResult | null;
  originPoint: GeoPoint | null;
  destinationPoint: GeoPoint | null;
  activeItinerary: TripItinerary | null;
  rideLeg?: RideLegPlan | null;
  rideProgress?: RideProgress | null;
  rideGpsPosition?: RideGpsPosition | null;
  rideFollowGps?: boolean;
  focusTarget: MapFocusTarget | null;
  onSelectLine: (line: BusLine) => void;
  onSetOriginFromStop: (point: GeoPoint) => void;
  onSetDestinationFromStop: (point: GeoPoint) => void;
  onMapPick: (point: GeoPoint) => void;
  onEditorDragStop: (stopIndex: number, lng: number, lat: number) => void;
  onDisableRideFollow?: () => void;
}

interface StopPopupOptions {
  lang: Lang;
  titleText: string;
  titleDir: 'ltr' | 'rtl';
  subtitleText: string;
  nearbyLines: BusLine[];
  sectionTitle: string;
  emptyText: string;
  onPickLine: (line: BusLine) => void;
  originActionLabel?: string;
  destActionLabel?: string;
  onUseAsOrigin?: () => void;
  onUseAsDestination?: () => void;
}

function createPopupPointActionButton(
  badgeText: 'A' | 'B',
  badgeColorClass: string,
  labelText: string,
  testId: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.testid = testId;
  btn.className =
    'inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-[#B6CBD9] dark:hover:border-[#254E74] text-[11px] font-medium text-[#041626] dark:text-[#EFF6FA] transition-colors cursor-pointer whitespace-nowrap';

  const badge = document.createElement('span');
  badge.setAttribute('dir', 'ltr');
  badge.className = `w-3.5 h-3.5 rounded-full ${badgeColorClass} text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0`;
  badge.textContent = badgeText;

  const text = document.createElement('span');
  text.textContent = labelText;

  btn.appendChild(badge);
  btn.appendChild(text);
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return btn;
}

function buildStopPopupElement({
  lang,
  titleText,
  titleDir,
  subtitleText,
  nearbyLines,
  sectionTitle,
  emptyText,
  onPickLine,
  originActionLabel,
  destActionLabel,
  onUseAsOrigin,
  onUseAsDestination,
}: StopPopupOptions): HTMLElement {
  const rootDir = lang === 'ar' ? 'rtl' : 'ltr';
  const container = document.createElement('div');
  container.setAttribute('dir', rootDir);
  container.className = 'min-w-[215px] max-w-[270px] space-y-2';

  const header = document.createElement('div');
  header.className = 'space-y-0.5';

  const sub = document.createElement('div');
  sub.className =
    'text-[10px] font-semibold uppercase tracking-wider text-[#526D82] dark:text-[#85A3BC] tabular-nums';
  sub.textContent = subtitleText;
  header.appendChild(sub);

  const title = document.createElement('div');
  title.className = 'text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] leading-snug';
  const bdi = document.createElement('bdi');
  bdi.setAttribute('dir', titleDir);
  bdi.textContent = titleText;
  title.appendChild(bdi);
  header.appendChild(title);

  container.appendChild(header);

  const linesBox = document.createElement('div');
  linesBox.className = 'pt-2 border-t border-[#DCE6EE] dark:border-[#183550] space-y-1.5';

  const label = document.createElement('div');
  label.className = 'text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC]';
  label.textContent = sectionTitle;
  linesBox.appendChild(label);

  if (nearbyLines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-[11px] text-[#7C97AE] dark:text-[#6B8BA5]';
    empty.textContent = emptyText;
    linesBox.appendChild(empty);
  } else {
    const badges = document.createElement('div');
    badges.className = 'flex flex-wrap gap-1';

    for (const line of nearbyLines) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('dir', 'ltr');
      btn.className =
        'h-5 min-w-[1.9rem] px-1.5 rounded text-[11px] font-bold tabular-nums cursor-pointer transition-opacity hover:opacity-85';
      btn.style.backgroundColor = line.color;
      btn.style.color = getContrastTextColor(line.color);
      btn.textContent = String(line.number);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onPickLine(line);
      });
      badges.appendChild(btn);
    }
    linesBox.appendChild(badges);
  }

  container.appendChild(linesBox);

  if (onUseAsOrigin || onUseAsDestination) {
    const actionsRow = document.createElement('div');
    actionsRow.className =
      'pt-2 border-t border-[#DCE6EE] dark:border-[#183550] grid grid-cols-2 gap-1.5';

    if (onUseAsOrigin && originActionLabel) {
      actionsRow.appendChild(
        createPopupPointActionButton(
          'A',
          'bg-[#01A069]',
          originActionLabel,
          'popup-set-origin',
          onUseAsOrigin,
        ),
      );
    }
    if (onUseAsDestination && destActionLabel) {
      actionsRow.appendChild(
        createPopupPointActionButton(
          'B',
          'bg-rose-600',
          destActionLabel,
          'popup-set-dest',
          onUseAsDestination,
        ),
      );
    }

    container.appendChild(actionsRow);
  }

  return container;
}

function ensureSourcesAndLayers(map: MapLibreMap, theme: Theme): void {
  const isLight = theme === 'light';

  if (!map.getSource('network-lines-source')) {
    map.addSource('network-lines-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('network-lines-layer')) {
    map.addLayer({
      id: 'network-lines-layer',
      type: 'line',
      source: 'network-lines-source',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.25,
        'line-opacity': isLight ? 0.45 : 0.35,
      },
    });
  }

  if (!map.getSource('active-routes-source')) {
    map.addSource('active-routes-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('active-routes-casing')) {
    map.addLayer({
      id: 'active-routes-casing',
      type: 'line',
      source: 'active-routes-source',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 8,
        'line-opacity': 0.25,
      },
    });
  }

  if (!map.getLayer('active-routes-core')) {
    map.addLayer({
      id: 'active-routes-core',
      type: 'line',
      source: 'active-routes-source',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4,
        'line-opacity': 1,
      },
    });
  }

  if (!map.getSource('walking-paths-source')) {
    map.addSource('walking-paths-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('walking-paths-layer')) {
    map.addLayer({
      id: 'walking-paths-layer',
      type: 'line',
      source: 'walking-paths-source',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': isLight ? '#0155A6' : '#22D3EE',
        'line-width': 3,
        'line-dasharray': [2, 2],
        'line-opacity': 0.95,
      },
    });
  }

  if (!map.getSource('osm-stops-source')) {
    map.addSource('osm-stops-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('osm-stops-layer')) {
    map.addLayer({
      id: 'osm-stops-layer',
      type: 'circle',
      source: 'osm-stops-source',
      layout: {
        visibility: 'none',
      },
      paint: {
        'circle-radius': 4.5,
        'circle-color': isLight ? '#0155A6' : '#22D3EE',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': isLight ? '#FFFFFF' : '#05101C',
        'circle-opacity': 0.9,
      },
    });
  }
}

export function TransitMap({
  lang,
  theme,
  mode,
  lines,
  osmStops,
  showOsmStops,
  selectedLine,
  direction,
  pickMode,
  nearMeResult,
  originPoint,
  destinationPoint,
  activeItinerary,
  rideLeg = null,
  rideProgress = null,
  rideGpsPosition = null,
  rideFollowGps = false,
  focusTarget,
  onSelectLine,
  onSetOriginFromStop,
  onSetDestinationFromStop,
  onMapPick,
  onEditorDragStop,
  onDisableRideFollow,
}: TransitMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const liveGpsMarkerRef = useRef<Marker | null>(null);
  const liveGpsImgRef = useRef<HTMLImageElement | null>(null);
  const prevLiveLngRef = useRef<number | null>(null);
  const busFacingRightRef = useRef<boolean>(false);
  const stopMarkersByIdRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const popupRef = useRef<Popup | null>(null);
  const appliedThemeRef = useRef<Theme>(theme);
  const appliedLangRef = useRef<Lang>(lang);
  const [styleRevision, setStyleRevision] = useState(0);
  const [mapUnavailable, setMapUnavailable] = useState(() => !detectWebGLSupport());

  const langRef = useRef(lang);
  const themeRef = useRef(theme);
  const linesRef = useRef(lines);
  const pickModeRef = useRef(pickMode);
  const rideActiveRef = useRef(Boolean(rideLeg));
  const rideFollowGpsRef = useRef(rideFollowGps);
  const onSelectLineRef = useRef(onSelectLine);
  const onSetOriginFromStopRef = useRef(onSetOriginFromStop);
  const onSetDestinationFromStopRef = useRef(onSetDestinationFromStop);
  const onMapPickRef = useRef(onMapPick);
  const onEditorDragStopRef = useRef(onEditorDragStop);
  const onDisableRideFollowRef = useRef(onDisableRideFollow);

  useEffect(() => {
    langRef.current = lang;
    themeRef.current = theme;
    linesRef.current = lines;
    pickModeRef.current = pickMode;
    rideActiveRef.current = Boolean(rideLeg);
    rideFollowGpsRef.current = rideFollowGps;
    onSelectLineRef.current = onSelectLine;
    onSetOriginFromStopRef.current = onSetOriginFromStop;
    onSetDestinationFromStopRef.current = onSetDestinationFromStop;
    onMapPickRef.current = onMapPick;
    onEditorDragStopRef.current = onEditorDragStop;
    onDisableRideFollowRef.current = onDisableRideFollow;
  }, [
    lang,
    theme,
    lines,
    pickMode,
    rideLeg,
    rideFollowGps,
    onSelectLine,
    onSetOriginFromStop,
    onSetDestinationFromStop,
    onMapPick,
    onEditorDragStop,
    onDisableRideFollow,
  ]);

  // Initialize MapLibre instance once
  useEffect(() => {
    if (mapUnavailable) return;
    const container = mapContainerRef.current;
    if (!container) return;

    appliedThemeRef.current = themeRef.current;
    appliedLangRef.current = langRef.current;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: buildTetouanMapStyle(themeRef.current, langRef.current),
        center: TETOUAN_CENTER,
        zoom: INITIAL_ZOOM,
        attributionControl: { compact: true },
      });
    } catch {
      queueMicrotask(() => setMapUnavailable(true));
      return;
    }

    map.addControl(new NavigationControl({ showCompass: true }), 'top-right');

    const handleStyleLoad = () => {
      ensureSourcesAndLayers(map, themeRef.current);
      setStyleRevision((r) => r + 1);
    };

    map.on('style.load', handleStyleLoad);

    map.on('click', 'network-lines-layer', (e: MapLayerMouseEvent) => {
      if (pickModeRef.current !== 'none' || rideActiveRef.current) return;
      const feature = e.features?.[0];
      const lineId = feature?.properties?.id;
      if (typeof lineId === 'string') {
        const found = linesRef.current.find((l) => l.id === lineId);
        if (found) {
          onSelectLineRef.current(found);
        }
      }
    });

    map.on('mouseenter', 'network-lines-layer', () => {
      if (pickModeRef.current === 'none' && !rideActiveRef.current) {
        map.getCanvas().style.cursor = 'pointer';
      }
    });

    map.on('mouseleave', 'network-lines-layer', () => {
      map.getCanvas().style.cursor = pickModeRef.current !== 'none' ? 'crosshair' : '';
    });

    map.on('click', 'osm-stops-layer', (e: MapLayerMouseEvent) => {
      if (pickModeRef.current !== 'none') return;
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      const currentLang = langRef.current;
      const t = TRANSLATIONS[currentLang];
      const nameEn = String(feature.properties?.name_en ?? t.explorer.unnamedStop);
      const nameAr = String(feature.properties?.name_ar ?? '');

      const label = resolveStopLabel(
        { hub_key: null, name_en: nameEn, name_ar: nameAr },
        currentLang,
      );
      const nearby = getLinesServingPoint(lat, lng, linesRef.current, { maxMeters: 180 });

      const dom = buildStopPopupElement({
        lang: currentLang,
        titleText: label.text,
        titleDir: label.dir,
        subtitleText: t.map.osmSourceTitle,
        nearbyLines: nearby,
        sectionTitle: t.map.servedByTitle,
        emptyText: t.map.noNearbyLines,
        originActionLabel: t.map.useAsOrigin,
        destActionLabel: t.map.useAsDestination,
        onPickLine: (picked) => {
          popupRef.current?.remove();
          onSelectLineRef.current(picked);
        },
        onUseAsOrigin: () => {
          popupRef.current?.remove();
          onSetOriginFromStopRef.current({ lat, lng });
        },
        onUseAsDestination: () => {
          popupRef.current?.remove();
          onSetDestinationFromStopRef.current({ lat, lng });
        },
      });

      popupRef.current?.remove();
      popupRef.current = new Popup({ offset: 12, maxWidth: '285px' })
        .setLngLat([lng, lat])
        .setDOMContent(dom)
        .addTo(map);
    });

    map.on('mouseenter', 'osm-stops-layer', () => {
      if (pickModeRef.current === 'none') {
        map.getCanvas().style.cursor = 'pointer';
      }
    });

    map.on('mouseleave', 'osm-stops-layer', () => {
      map.getCanvas().style.cursor = pickModeRef.current !== 'none' ? 'crosshair' : '';
    });

    map.on('click', (e: MapMouseEvent) => {
      if (pickModeRef.current === 'none') return;
      onMapPickRef.current({
        lng: Number(e.lngLat.lng.toFixed(6)),
        lat: Number(e.lngLat.lat.toFixed(6)),
      });
    });

    map.on('dragstart', () => {
      if (rideFollowGpsRef.current) {
        onDisableRideFollowRef.current?.();
      }
    });

    mapRef.current = map;
    const stopMarkersMap = stopMarkersByIdRef.current;

    return () => {
      popupRef.current?.remove();
      liveGpsMarkerRef.current?.remove();
      liveGpsMarkerRef.current = null;
      liveGpsImgRef.current = null;
      prevLiveLngRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      stopMarkersMap.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [mapUnavailable]);

  // Switch Protomaps Light/Dark style and map label language
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedThemeRef.current === theme && appliedLangRef.current === lang) {
      return;
    }
    appliedThemeRef.current = theme;
    appliedLangRef.current = lang;
    map.setStyle(buildTetouanMapStyle(theme, lang));
  }, [theme, lang]);

  // Update cursor when pickMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode !== 'none' ? 'crosshair' : '';
  }, [pickMode]);

  // Upload all-network GeoJSON only when lines data changes or map style reloads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('network-lines-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: lines.map((line) => ({
        type: 'Feature',
        properties: { id: line.id, color: line.color },
        geometry: line.geometry,
      })),
    });
  }, [styleRevision, lines]);

  // Adjust dimming & stroke width without re-uploading 35 GeoJSON geometries
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0 || !map.getLayer('network-lines-layer')) return;

    const isFocused =
      Boolean(rideLeg) ||
      Boolean(selectedLine && mode !== 'planner') ||
      Boolean(activeItinerary && mode === 'planner');

    const baseOpacity = theme === 'light' ? 0.45 : 0.35;
    map.setPaintProperty('network-lines-layer', 'line-opacity', isFocused ? 0.14 : baseOpacity);
    map.setPaintProperty('network-lines-layer', 'line-width', isFocused ? 1.5 : 2.25);
  }, [styleRevision, theme, rideLeg, selectedLine, activeItinerary, mode]);

  // Update active route(s)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('active-routes-source') as GeoJSONSource | undefined;
    if (!source) return;

    if (rideLeg) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: rideLeg.line.id, color: rideLeg.line.color },
            geometry: rideLeg.segmentGeometry,
          },
        ],
      });
    } else if (mode === 'planner' && activeItinerary) {
      source.setData({
        type: 'FeatureCollection',
        features: activeItinerary.legs.map((leg) => ({
          type: 'Feature',
          properties: { id: leg.line.id, color: leg.line.color },
          geometry: leg.segmentGeometry,
        })),
      });
    } else if (mode !== 'planner' && selectedLine) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: selectedLine.id, color: selectedLine.color },
            geometry: selectedLine.geometry,
          },
        ],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [styleRevision, mode, rideLeg, selectedLine, activeItinerary]);

  // Update dashed walking paths (Near Me + Trip Planner)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('walking-paths-source') as GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (!rideLeg && mode === 'planner') {
      if (nearMeResult) {
        features.push({
          type: 'Feature',
          properties: {},
          geometry: nearMeResult.walkingGeometry,
        });
      }
      if (activeItinerary) {
        features.push(
          {
            type: 'Feature',
            properties: {},
            geometry: activeItinerary.walkToBoardGeometry,
          },
          {
            type: 'Feature',
            properties: {},
            geometry: activeItinerary.walkFromAlightGeometry,
          },
        );
        if (activeItinerary.transferWalkGeometry) {
          features.push({
            type: 'Feature',
            properties: {},
            geometry: activeItinerary.transferWalkGeometry,
          });
        }
      }
    }

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [styleRevision, mode, rideLeg, nearMeResult, activeItinerary]);

  // Upload OSM stops GeoJSON only when dataset changes or style reloads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('osm-stops-source') as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: osmStops.map((stop) => ({
        type: 'Feature',
        properties: {
          id: stop.id,
          name_en: stop.name_en,
          name_ar: stop.name_ar,
        },
        geometry: {
          type: 'Point',
          coordinates: [stop.lng, stop.lat],
        },
      })),
    });
  }, [styleRevision, osmStops]);

  // Toggle OSM stops visibility cleanly without re-serializing GeoJSON
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0 || !map.getLayer('osm-stops-layer')) return;
    map.setLayoutProperty(
      'osm-stops-layer',
      'visibility',
      showOsmStops ? 'visible' : 'none',
    );
  }, [styleRevision, showOsmStops]);

  const rideCurrentStopIndex = rideProgress?.currentStopIndex ?? 0;

  // Render interactive HTML markers for Stops, Trip Points, Ride Mode, or Editor Pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;

    popupRef.current?.remove();
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    stopMarkersByIdRef.current.clear();

    const t = TRANSLATIONS[lang];
    const ringBorderClass =
      theme === 'light' ? 'border-white' : 'border-[#05101C]';

    if (mode === 'editor' && selectedLine) {
      selectedLine.stops.forEach((stop, index) => {
        const el = document.createElement('div');
        el.setAttribute('dir', 'ltr');
        el.className = `w-6 h-6 rounded-full border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-[10px] font-bold tabular-nums cursor-grab active:cursor-grabbing text-[#041626]`;
        el.style.backgroundColor = '#F59E0B';
        el.textContent = String(index + 1);

        const marker = new Marker({ element: el, draggable: true })
          .setLngLat([stop.lng, stop.lat])
          .addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          onEditorDragStopRef.current(
            index,
            Number(pos.lng.toFixed(6)),
            Number(pos.lat.toFixed(6)),
          );
        });

        markersRef.current.push(marker);
        stopMarkersByIdRef.current.set(stop.id, marker);
      });
      return;
    }

    const mountStopMarkerWithPopup = (
      el: HTMLElement,
      stop: BusStop,
      subtitle: string,
      nearbyLines: BusLine[],
      sectionTitle: string,
    ) => {
      const label = resolveStopLabel(stop, lang);
      const popupDom = buildStopPopupElement({
        lang,
        titleText: label.text,
        titleDir: label.dir,
        subtitleText: subtitle,
        nearbyLines,
        sectionTitle,
        emptyText: t.map.noNearbyLines,
        originActionLabel: t.map.useAsOrigin,
        destActionLabel: t.map.useAsDestination,
        onPickLine: (picked) => {
          popupRef.current?.remove();
          onSelectLineRef.current(picked);
        },
        onUseAsOrigin: () => {
          popupRef.current?.remove();
          onSetOriginFromStopRef.current({ lat: stop.lat, lng: stop.lng });
        },
        onUseAsDestination: () => {
          popupRef.current?.remove();
          onSetDestinationFromStopRef.current({ lat: stop.lat, lng: stop.lng });
        },
      });

      const popup = new Popup({ offset: 12, maxWidth: '285px' }).setDOMContent(popupDom);
      const marker = new Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        if (popupRef.current && popupRef.current !== popup) {
          popupRef.current.remove();
        }
        popupRef.current = popup;
      });

      markersRef.current.push(marker);
      stopMarkersByIdRef.current.set(stop.id, marker);
    };

    if (rideLeg) {
      rideLeg.stops.forEach((stop, idx) => {
        const seq = idx + 1;
        const isTarget = idx === rideLeg.targetStopIndex;
        const isPassed = idx < rideCurrentStopIndex;
        const isCurrent = idx === rideCurrentStopIndex;

        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('dir', 'ltr');

        if (isTarget) {
          el.className = `w-7 h-7 rounded-full border-2 ${ringBorderClass} shadow-md flex items-center justify-center text-[10px] font-bold text-white tabular-nums cursor-pointer`;
          el.style.backgroundColor = rideLeg.isTransferLeg ? '#F59E0B' : '#01A069';
          el.textContent = String(seq);
        } else if (isCurrent) {
          el.className = `w-6 h-6 rounded-full border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-[10px] font-bold tabular-nums cursor-pointer`;
          el.style.backgroundColor = rideLeg.line.color;
          el.style.color = getContrastTextColor(rideLeg.line.color);
          el.textContent = String(seq);
        } else {
          el.className = `w-4 h-4 rounded-full border-2 shadow-xs flex items-center justify-center text-[9px] font-bold tabular-nums cursor-pointer ${
            theme === 'light'
              ? 'bg-white text-[#041626]'
              : 'bg-[#081828] text-[#EFF6FA]'
          } ${isPassed ? 'opacity-45' : ''}`;
          el.style.borderColor = rideLeg.line.color;
          el.textContent = String(seq);
        }

        const nearby = getLinesServingPoint(stop.lat, stop.lng, lines, {
          excludeLineId: rideLeg.line.id,
          hubKey: stop.hub_key,
          maxMeters: 120,
        });
        mountStopMarkerWithPopup(
          el,
          stop,
          `${t.map.stopPopupSequence} ${seq}`,
          nearby,
          t.map.nearbyLinesTitle,
        );
      });
      return;
    }

    if (mode === 'explorer' && selectedLine) {
      const orderedStops: BusStop[] =
        direction === 'outbound' ? selectedLine.stops : [...selectedLine.stops].reverse();

      orderedStops.forEach((stop, idx) => {
        const seq = idx + 1;
        const isTerminal = idx === 0 || idx === orderedStops.length - 1;
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('dir', 'ltr');
        // Never put CSS scale/transition-transform on the outer MapLibre marker element:
        // MapLibre positions the outer element with inline `transform: translate(...)`,
        // so scaling the outer element multiplies its map coordinates and shifts the pin.
        el.className =
          'group flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer focus:outline-none';

        const dot = document.createElement('span');
        dot.className = `rounded-full border-2 shadow-sm flex items-center justify-center font-bold tabular-nums transition-transform duration-150 group-hover:scale-125 ${
          isTerminal
            ? `w-6 h-6 text-[10px] ${ringBorderClass}`
            : theme === 'light'
              ? 'w-4 h-4 text-[9px] bg-white text-[#041626]'
              : 'w-4 h-4 text-[9px] bg-[#081828] text-[#EFF6FA]'
        }`;
        if (isTerminal) {
          dot.style.backgroundColor = selectedLine.color;
          dot.style.color = getContrastTextColor(selectedLine.color);
        } else {
          dot.style.borderColor = selectedLine.color;
        }
        dot.textContent = String(seq);
        el.appendChild(dot);

        const nearby = getLinesServingPoint(stop.lat, stop.lng, lines, {
          excludeLineId: selectedLine.id,
          hubKey: stop.hub_key,
          maxMeters: 120,
        });
        mountStopMarkerWithPopup(
          el,
          stop,
          `${t.map.stopPopupSequence} ${seq}`,
          nearby,
          t.map.nearbyLinesTitle,
        );
      });
      return;
    }

    if (mode === 'planner') {
      if (nearMeResult) {
        const userEl = document.createElement('div');
        userEl.className =
          'w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-[0_0_0_5px_rgba(14,165,233,0.28)]';
        markersRef.current.push(
          new Marker({ element: userEl })
            .setLngLat([nearMeResult.userPoint.lng, nearMeResult.userPoint.lat])
            .addTo(map),
        );

        const stopEl = document.createElement('button');
        stopEl.type = 'button';
        stopEl.className = `w-6 h-6 rounded-full bg-[#01A069] border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-[10px] font-bold text-white cursor-pointer`;
        stopEl.textContent = 'S';
        mountStopMarkerWithPopup(
          stopEl,
          nearMeResult.nearestStop,
          `${nearMeResult.distanceMeters} ${t.planner.metersUnit}`,
          nearMeResult.servingLines,
          t.planner.linesServingStop,
        );

        nearMeResult.alternativeStops.forEach((alt) => {
          const altEl = document.createElement('button');
          altEl.type = 'button';
          altEl.className = `w-5 h-5 rounded-full bg-[#0155A6] dark:bg-[#0284C7] border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-[10px] font-bold text-white cursor-pointer`;
          altEl.textContent = '+';
          mountStopMarkerWithPopup(
            altEl,
            alt.stop,
            `${alt.distanceMeters} ${t.planner.metersUnit}`,
            alt.servingLines,
            t.planner.linesServingStop,
          );
        });
      }

      if (originPoint) {
        const aEl = document.createElement('div');
        aEl.setAttribute('dir', 'ltr');
        aEl.className = `w-7 h-7 rounded-full bg-[#01A069] border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-xs font-bold text-white`;
        aEl.textContent = 'A';
        markersRef.current.push(
          new Marker({ element: aEl })
            .setLngLat([originPoint.lng, originPoint.lat])
            .addTo(map),
        );
      }

      if (destinationPoint) {
        const bEl = document.createElement('div');
        bEl.setAttribute('dir', 'ltr');
        bEl.className = `w-7 h-7 rounded-full bg-rose-600 border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-xs font-bold text-white`;
        bEl.textContent = 'B';
        markersRef.current.push(
          new Marker({ element: bEl })
            .setLngLat([destinationPoint.lng, destinationPoint.lat])
            .addTo(map),
        );
      }

      if (activeItinerary) {
        activeItinerary.legs.forEach((leg, idx) => {
          const boardEl = document.createElement('div');
          boardEl.className = `w-4 h-4 rounded-full border-2 ${ringBorderClass} shadow-sm`;
          boardEl.style.backgroundColor = leg.line.color;
          markersRef.current.push(
            new Marker({ element: boardEl })
              .setLngLat([leg.boardStop.lng, leg.boardStop.lat])
              .addTo(map),
          );

          const alightEl = document.createElement('div');
          alightEl.className =
            idx === 0 && activeItinerary.type === 'transfer'
              ? `w-5 h-5 rounded-full bg-amber-500 border-2 ${ringBorderClass} shadow-sm`
              : `w-4 h-4 rounded-full border-2 ${ringBorderClass} shadow-sm`;
          if (!(idx === 0 && activeItinerary.type === 'transfer')) {
            alightEl.style.backgroundColor = leg.line.color;
          }
          markersRef.current.push(
            new Marker({ element: alightEl })
              .setLngLat([leg.alightStop.lng, leg.alightStop.lat])
              .addTo(map),
          );
        });
      }
    }
  }, [
    styleRevision,
    theme,
    lang,
    mode,
    lines,
    selectedLine,
    direction,
    nearMeResult,
    originPoint,
    destinationPoint,
    activeItinerary,
    rideLeg,
    rideCurrentStopIndex,
  ]);

  // Dedicated live Tetouan bus marker during Ride Mode (updated in-place without re-creating stop markers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;

    if (!rideLeg || !rideGpsPosition) {
      liveGpsMarkerRef.current?.remove();
      liveGpsMarkerRef.current = null;
      liveGpsImgRef.current = null;
      prevLiveLngRef.current = null;
      busFacingRightRef.current = false;
      return;
    }

    // Determine horizontal bus facing (source artwork faces West/left; mirror via scaleX(-1) for East/right)
    if (rideGpsPosition.heading !== null && Number.isFinite(rideGpsPosition.heading)) {
      const normalizedHeading = ((rideGpsPosition.heading % 360) + 360) % 360;
      if (normalizedHeading >= 15 && normalizedHeading <= 165) {
        busFacingRightRef.current = true;
      } else if (normalizedHeading >= 195 && normalizedHeading <= 345) {
        busFacingRightRef.current = false;
      }
    } else if (prevLiveLngRef.current !== null) {
      const deltaLng = rideGpsPosition.lng - prevLiveLngRef.current;
      if (deltaLng > 0.00004) {
        busFacingRightRef.current = true;
      } else if (deltaLng < -0.00004) {
        busFacingRightRef.current = false;
      }
    } else if (rideLeg.stops.length >= 2) {
      const targetStop =
        rideLeg.stops[rideLeg.targetStopIndex] ?? rideLeg.stops[rideLeg.stops.length - 1];
      busFacingRightRef.current = targetStop.lng > rideGpsPosition.lng;
    }
    prevLiveLngRef.current = rideGpsPosition.lng;

    if (!liveGpsMarkerRef.current) {
      const wrapper = document.createElement('div');
      wrapper.dataset.testid = 'ride-live-gps-dot';
      wrapper.style.zIndex = '20';
      wrapper.className =
        'relative flex items-center justify-center w-14 h-8 pointer-events-none select-none';

      const halo = document.createElement('span');
      halo.className =
        'absolute bottom-0.5 w-8 h-2.5 rounded-full bg-[#01A069]/35 dark:bg-[#34D399]/40 animate-ping';

      const shadow = document.createElement('span');
      shadow.className =
        'absolute bottom-0.5 w-10 h-1.5 rounded-full bg-[#041626]/25 dark:bg-black/55 blur-[1.5px]';

      const busImg = document.createElement('img');
      busImg.src = '/tetouan-bus-marker.png';
      busImg.alt = '';
      busImg.setAttribute('aria-hidden', 'true');
      busImg.draggable = false;
      busImg.className =
        'relative w-[48px] h-auto object-contain transition-transform duration-300 drop-shadow-[0_2px_4px_rgba(4,22,38,0.35)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.75)]';
      busImg.style.transform = busFacingRightRef.current ? 'scaleX(-1)' : 'scaleX(1)';

      wrapper.appendChild(halo);
      wrapper.appendChild(shadow);
      wrapper.appendChild(busImg);
      liveGpsImgRef.current = busImg;

      liveGpsMarkerRef.current = new Marker({ element: wrapper, anchor: 'center' })
        .setLngLat([rideGpsPosition.lng, rideGpsPosition.lat])
        .addTo(map);
    } else {
      liveGpsMarkerRef.current.setLngLat([rideGpsPosition.lng, rideGpsPosition.lat]);
      if (liveGpsImgRef.current) {
        liveGpsImgRef.current.style.transform = busFacingRightRef.current
          ? 'scaleX(-1)'
          : 'scaleX(1)';
      }
    }

    if (rideFollowGps) {
      map.easeTo({
        center: [rideGpsPosition.lng, rideGpsPosition.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 450,
      });
    }
  }, [styleRevision, rideLeg, rideGpsPosition, rideFollowGps]);

  // Handle imperative focus / flyTo / fitBounds requests
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0 || !focusTarget) return;

    if (focusTarget.bounds) {
      const isMobile = window.innerWidth < 768;
      map.fitBounds(focusTarget.bounds, {
        padding: {
          top: 84,
          bottom: isMobile ? 220 : 80,
          left: 56,
          right: 56,
        },
        maxZoom: 14.8,
        duration: 450,
      });
    } else if (focusTarget.center) {
      map.flyTo({
        center: focusTarget.center,
        zoom: focusTarget.zoom ?? 15.5,
        duration: 450,
      });
    }

    if (focusTarget.openStopId) {
      const marker = stopMarkersByIdRef.current.get(focusTarget.openStopId);
      if (marker) {
        const popup = marker.getPopup();
        if (popup && !popup.isOpen()) {
          popupRef.current?.remove();
          popupRef.current = popup;
          marker.togglePopup();
        }
      }
    }
  }, [styleRevision, focusTarget]);

  if (mapUnavailable) {
    const t = TRANSLATIONS[lang];
    const dir = getDir(lang);
    return (
      <div
        dir={dir}
        data-testid="transit-map-fallback"
        className="w-full h-[100dvh] flex items-center justify-center p-6 bg-[#EAF1F5] dark:bg-[#05101C] text-[#041626] dark:text-[#EFF6FA]"
      >
        <div className="max-w-xs rounded-xl border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] p-5 text-center space-y-2.5 shadow-sm">
          <div className="mx-auto w-9 h-9 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/50 inline-flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300" strokeWidth={1.75} />
          </div>
          <h2 className="text-xs font-semibold">{t.map.webglUnsupportedTitle}</h2>
          <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] leading-relaxed">
            {t.map.webglUnsupportedDesc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      data-testid="transit-map-canvas"
      className="relative w-full h-[100dvh] bg-[#F2F7FA] dark:bg-[#05101C]"
    />
  );
}
