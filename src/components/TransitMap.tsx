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
import { Protocol } from 'pmtiles';
import { useEffect, useRef, useState } from 'react';
import { resolveStopLabel, TRANSLATIONS } from '../i18n';
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
  Theme,
  TripItinerary,
} from '../types/transit';
import { buildTetouanMapStyle } from '../utils/offlineMapStyle';
import { getContrastTextColor, getLinesServingPoint } from '../utils/transitGeo';

setWorkerUrl(maplibreWorkerUrl);

const pmtilesProtocol = new Protocol();
let pmtilesProtocolRegistered = false;
if (!pmtilesProtocolRegistered) {
  addProtocol('pmtiles', pmtilesProtocol.tile);
  pmtilesProtocolRegistered = true;
}

const TETOUAN_CENTER: [number, number] = [-5.365, 35.573];
const INITIAL_ZOOM = 12.5;

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
  focusTarget: MapFocusTarget | null;
  onSelectLine: (line: BusLine) => void;
  onMapPick: (point: GeoPoint) => void;
  onEditorDragStop: (stopIndex: number, lng: number, lat: number) => void;
}

function buildStopPopupElement(
  lang: Lang,
  titleText: string,
  titleDir: 'ltr' | 'rtl',
  subtitleText: string,
  nearbyLines: BusLine[],
  sectionTitle: string,
  emptyText: string,
  onPickLine: (line: BusLine) => void,
): HTMLElement {
  const rootDir = lang === 'ar' ? 'rtl' : 'ltr';
  const container = document.createElement('div');
  container.setAttribute('dir', rootDir);
  container.className = 'min-w-[205px] max-w-[265px] space-y-2';

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
  focusTarget,
  onSelectLine,
  onMapPick,
  onEditorDragStop,
}: TransitMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const stopMarkersByIdRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const popupRef = useRef<Popup | null>(null);
  const appliedThemeRef = useRef<Theme>(theme);
  const appliedLangRef = useRef<Lang>(lang);
  const [styleRevision, setStyleRevision] = useState(0);

  const langRef = useRef(lang);
  const themeRef = useRef(theme);
  const linesRef = useRef(lines);
  const pickModeRef = useRef(pickMode);
  const onSelectLineRef = useRef(onSelectLine);
  const onMapPickRef = useRef(onMapPick);
  const onEditorDragStopRef = useRef(onEditorDragStop);

  useEffect(() => {
    langRef.current = lang;
    themeRef.current = theme;
    linesRef.current = lines;
    pickModeRef.current = pickMode;
    onSelectLineRef.current = onSelectLine;
    onMapPickRef.current = onMapPick;
    onEditorDragStopRef.current = onEditorDragStop;
  }, [lang, theme, lines, pickMode, onSelectLine, onMapPick, onEditorDragStop]);

  // Initialize MapLibre instance once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    appliedThemeRef.current = themeRef.current;
    appliedLangRef.current = langRef.current;
    const map = new MapLibreMap({
      container,
      style: buildTetouanMapStyle(themeRef.current, langRef.current),
      center: TETOUAN_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: true }), 'top-right');

    const handleStyleLoad = () => {
      ensureSourcesAndLayers(map, themeRef.current);
      setStyleRevision((r) => r + 1);
    };

    map.on('style.load', handleStyleLoad);

    map.on('click', 'network-lines-layer', (e: MapLayerMouseEvent) => {
      if (pickModeRef.current !== 'none') return;
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
      if (pickModeRef.current === 'none') {
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
      const nearby = getLinesServingPoint(lat, lng, linesRef.current, { maxMeters: 150 });

      const dom = buildStopPopupElement(
        currentLang,
        label.text,
        label.dir,
        t.map.osmSourceTitle,
        nearby,
        t.map.servedByTitle,
        t.map.noNearbyLines,
        (picked) => {
          popupRef.current?.remove();
          onSelectLineRef.current(picked);
        },
      );

      popupRef.current?.remove();
      popupRef.current = new Popup({ offset: 12, maxWidth: '280px' })
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

    mapRef.current = map;
    const stopMarkersMap = stopMarkersByIdRef.current;

    return () => {
      popupRef.current?.remove();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      stopMarkersMap.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Update all-network overview layer & dimming
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

    const isFocused =
      Boolean(selectedLine && mode !== 'planner') ||
      Boolean(activeItinerary && mode === 'planner');

    const baseOpacity = theme === 'light' ? 0.45 : 0.35;
    map.setPaintProperty('network-lines-layer', 'line-opacity', isFocused ? 0.14 : baseOpacity);
    map.setPaintProperty('network-lines-layer', 'line-width', isFocused ? 1.5 : 2.25);
  }, [styleRevision, theme, lines, selectedLine, activeItinerary, mode]);

  // Update active route(s)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('active-routes-source') as GeoJSONSource | undefined;
    if (!source) return;

    if (mode === 'planner' && activeItinerary) {
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
  }, [styleRevision, mode, selectedLine, activeItinerary]);

  // Update dashed walking paths (Near Me + Trip Planner)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRevision === 0) return;
    const source = map.getSource('walking-paths-source') as GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    if (mode === 'planner') {
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
      }
    }

    source.setData({
      type: 'FeatureCollection',
      features,
    });
  }, [styleRevision, mode, nearMeResult, activeItinerary]);

  // Update raw OSM stops layer & toggle visibility
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

    if (map.getLayer('osm-stops-layer')) {
      map.setLayoutProperty(
        'osm-stops-layer',
        'visibility',
        showOsmStops ? 'visible' : 'none',
      );
    }
  }, [styleRevision, osmStops, showOsmStops]);

  // Render interactive HTML markers for Stops, Trip Points, or Editor Pins
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

    if (mode === 'explorer' && selectedLine) {
      const orderedStops: BusStop[] =
        direction === 'outbound' ? selectedLine.stops : [...selectedLine.stops].reverse();

      orderedStops.forEach((stop, idx) => {
        const seq = idx + 1;
        const isTerminal = idx === 0 || idx === orderedStops.length - 1;
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('dir', 'ltr');
        el.className = `rounded-full border-2 shadow-sm flex items-center justify-center font-bold tabular-nums cursor-pointer transition-transform hover:scale-125 ${
          isTerminal
            ? `w-6 h-6 text-[10px] ${ringBorderClass}`
            : theme === 'light'
              ? 'w-4 h-4 text-[9px] bg-white text-[#041626]'
              : 'w-4 h-4 text-[9px] bg-[#081828] text-[#EFF6FA]'
        }`;
        if (isTerminal) {
          el.style.backgroundColor = selectedLine.color;
          el.style.color = getContrastTextColor(selectedLine.color);
        } else {
          el.style.borderColor = selectedLine.color;
        }
        el.textContent = String(seq);

        const label = resolveStopLabel(stop, lang);
        const nearby = getLinesServingPoint(stop.lat, stop.lng, lines, {
          excludeLineId: selectedLine.id,
          hubKey: stop.hub_key,
          maxMeters: 120,
        });

        const popupDom = buildStopPopupElement(
          lang,
          label.text,
          label.dir,
          `${t.map.stopPopupSequence} ${seq}`,
          nearby,
          t.map.nearbyLinesTitle,
          t.map.noNearbyLines,
          (picked) => {
            popupRef.current?.remove();
            onSelectLineRef.current(picked);
          },
        );

        const popup = new Popup({ offset: 12, maxWidth: '280px' }).setDOMContent(
          popupDom,
        );

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

        const stopEl = document.createElement('div');
        stopEl.className = `w-6 h-6 rounded-full bg-[#01A069] border-2 ${ringBorderClass} shadow-sm flex items-center justify-center text-[10px] font-bold text-white`;
        stopEl.textContent = 'S';
        const stopLabel = resolveStopLabel(nearMeResult.nearestStop, lang);
        const stopPopup = buildStopPopupElement(
          lang,
          stopLabel.text,
          stopLabel.dir,
          `${nearMeResult.distanceMeters} ${t.planner.metersUnit}`,
          nearMeResult.servingLines,
          t.planner.linesServingStop,
          t.map.noNearbyLines,
          (picked) => {
            popupRef.current?.remove();
            onSelectLineRef.current(picked);
          },
        );
        markersRef.current.push(
          new Marker({ element: stopEl })
            .setLngLat([nearMeResult.nearestStop.lng, nearMeResult.nearestStop.lat])
            .setPopup(new Popup({ offset: 12 }).setDOMContent(stopPopup))
            .addTo(map),
        );
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
  ]);

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
        duration: 650,
      });
    } else if (focusTarget.center) {
      map.flyTo({
        center: focusTarget.center,
        zoom: focusTarget.zoom ?? 15.5,
        duration: 650,
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

  return (
    <div
      ref={mapContainerRef}
      data-testid="transit-map-canvas"
      className="relative w-full h-[100dvh] bg-[#F2F7FA] dark:bg-[#05101C]"
    />
  );
}
