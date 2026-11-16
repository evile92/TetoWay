import * as turf from '@turf/turf';
import { Compass, PencilRuler, RotateCcw, Route } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ContactFooter } from './components/ContactFooter';
import { InstallModal } from './components/InstallModal';
import { LineExplorer } from './components/LineExplorer';
import { MobileBottomSheet } from './components/MobileBottomSheet';
import { RouteEditor } from './components/RouteEditor';
import { TopBar } from './components/TopBar';
import { TransitMap } from './components/TransitMap';
import { TripPlanner } from './components/TripPlanner';
import { usePwaInstall } from './hooks/usePwaInstall';
import { getDir, TRANSLATIONS } from './i18n';
import type {
  AppMode,
  BusLine,
  BusStop,
  DirectionMode,
  GeoPoint,
  Lang,
  MapFocusTarget,
  MapPickMode,
  OsmStop,
  SheetSnap,
  Theme,
} from './types/transit';
import {
  findNearestServedStop,
  getBboxForCoordinates,
  planTripItineraries,
} from './utils/transitGeo';

const TETOUAN_CENTER: [number, number] = [-5.365, 35.573];
const THEME_STORAGE_KEY = 'tetoway-theme';

function readInitialTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [mode, setMode] = useState<AppMode>('explorer');
  const [lines, setLines] = useState<BusLine[]>([]);
  const [osmStops, setOsmStops] = useState<OsmStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [showOsmStops, setShowOsmStops] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [direction, setDirection] = useState<DirectionMode>('outbound');
  const [pickMode, setPickMode] = useState<MapPickMode>('none');

  const [nearMePoint, setNearMePoint] = useState<GeoPoint | null>(null);
  const [originPoint, setOriginPoint] = useState<GeoPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<GeoPoint | null>(null);
  const [selectedItineraryIndex, setSelectedItineraryIndex] = useState(0);

  const [mobileSnap, setMobileSnap] = useState<SheetSnap>('half');
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const focusSeqRef = useRef(1);
  const pwa = usePwaInstall();

  const t = TRANSLATIONS[lang];
  const dir = getDir(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors in restricted browsing contexts
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#05101C' : '#F2F7FA');
    }
  }, [theme]);

  const fetchTransitDataset = useCallback(async () => {
    const [linesRes, osmRes] = await Promise.all([
      fetch('/data/tetouan-lines.json'),
      fetch('/data/osm-stops.json'),
    ]);

    if (!linesRes.ok) {
      throw new Error(`HTTP ${linesRes.status}`);
    }
    const linesJson = (await linesRes.json()) as BusLine[];
    const osmJson = osmRes.ok ? ((await osmRes.json()) as OsmStop[]) : [];
    return { linesJson, osmJson };
  }, []);

  const handleRetryLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { linesJson, osmJson } = await fetchTransitDataset();
      setLines(linesJson);
      setOsmStops(osmJson);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchTransitDataset]);

  useEffect(() => {
    let active = true;
    fetchTransitDataset()
      .then(({ linesJson, osmJson }) => {
        if (!active) return;
        setLines(linesJson);
        setOsmStops(osmJson);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchTransitDataset]);

  const selectedLine = useMemo(
    () => lines.find((l) => l.id === selectedLineId) ?? null,
    [lines, selectedLineId],
  );

  const editorLine = useMemo(
    () => selectedLine ?? lines[0] ?? null,
    [selectedLine, lines],
  );

  const nearMeResult = useMemo(
    () => (nearMePoint ? findNearestServedStop(nearMePoint, lines) : null),
    [nearMePoint, lines],
  );

  const itineraries = useMemo(() => {
    if (!originPoint || !destinationPoint) return [];
    return planTripItineraries(originPoint, destinationPoint, lines);
  }, [originPoint, destinationPoint, lines]);

  const activeItinerary = useMemo(() => {
    if (itineraries.length === 0) return null;
    return itineraries[selectedItineraryIndex] ?? itineraries[0];
  }, [itineraries, selectedItineraryIndex]);

  const triggerFocus = useCallback((target: Omit<MapFocusTarget, 'seq'>) => {
    focusSeqRef.current += 1;
    setFocusTarget({ ...target, seq: focusSeqRef.current });
  }, []);

  const handleSelectLine = useCallback(
    (line: BusLine | null) => {
      if (!line) {
        setSelectedLineId(null);
        return;
      }
      setSelectedLineId(line.id);
      setDirection('outbound');
      if (mode === 'planner') {
        setMode('explorer');
      }
      const bounds = getBboxForCoordinates(line.geometry.coordinates);
      if (bounds) {
        triggerFocus({ bounds });
      }
    },
    [mode, triggerFocus],
  );

  const handleChangeMode = useCallback(
    (nextMode: AppMode) => {
      setPickMode('none');
      setMode(nextMode);
      if (nextMode === 'editor' && !selectedLineId && lines[0]) {
        setSelectedLineId(lines[0].id);
        const bounds = getBboxForCoordinates(lines[0].geometry.coordinates);
        if (bounds) triggerFocus({ bounds });
      }
    },
    [selectedLineId, lines, triggerFocus],
  );

  const handleSetPickMode = useCallback((nextPickMode: MapPickMode) => {
    setPickMode(nextPickMode);
    if (nextPickMode !== 'none') {
      setMobileSnap('collapsed');
    }
  }, []);

  const handleFocusStop = useCallback(
    (stop: BusStop) => {
      triggerFocus({
        center: [stop.lng, stop.lat],
        zoom: 16,
        openStopId: stop.id,
      });
      if (window.innerWidth < 768) {
        setMobileSnap('half');
      }
    },
    [triggerFocus],
  );

  const handleFitSelectedLine = useCallback(() => {
    const targetLine = mode === 'editor' ? editorLine : selectedLine;
    if (!targetLine) return;
    const bounds = getBboxForCoordinates(targetLine.geometry.coordinates);
    if (bounds) triggerFocus({ bounds });
  }, [mode, editorLine, selectedLine, triggerFocus]);

  const handleResetMapView = useCallback(() => {
    setSelectedLineId(null);
    triggerFocus({ center: TETOUAN_CENTER, zoom: 12.5 });
  }, [triggerFocus]);

  const handleUpdateLine = useCallback((updated: BusLine) => {
    setLines((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }, []);

  const handleEditorDragStop = useCallback(
    (stopIndex: number, lng: number, lat: number) => {
      if (!editorLine) return;
      const nextStops = editorLine.stops.map((s, idx) =>
        idx === stopIndex ? { ...s, lng, lat } : s,
      );
      handleUpdateLine({ ...editorLine, stops: nextStops });
    },
    [editorLine, handleUpdateLine],
  );

  const handleMapPick = useCallback(
    (point: GeoPoint) => {
      if (pickMode === 'near_me') {
        setNearMePoint(point);
        setPickMode('none');
        setMobileSnap('half');
        const res = findNearestServedStop(point, lines);
        if (res) {
          const bounds = getBboxForCoordinates([
            [point.lng, point.lat],
            [res.nearestStop.lng, res.nearestStop.lat],
          ]);
          if (bounds) triggerFocus({ bounds });
        }
        return;
      }

      if (pickMode === 'trip_origin') {
        setOriginPoint(point);
        setSelectedItineraryIndex(0);
        setPickMode('none');
        setMobileSnap('half');
        return;
      }

      if (pickMode === 'trip_destination') {
        setDestinationPoint(point);
        setSelectedItineraryIndex(0);
        setPickMode('none');
        setMobileSnap('half');
        return;
      }

      if (pickMode === 'editor_add_stop' && editorLine) {
        const newNum = editorLine.stops.length + 1;
        const newStop: BusStop = {
          id: `${editorLine.id}_S${newNum}`,
          order: newNum,
          hub_key: null,
          name_en: `${TRANSLATIONS.en.explorer.unnamedStop} ${newNum}`,
          name_ar: `${TRANSLATIONS.ar.explorer.unnamedStop} ${newNum}`,
          lat: point.lat,
          lng: point.lng,
        };

        let inserted = [...editorLine.stops, newStop];
        if (editorLine.geometry.coordinates.length >= 2 && editorLine.stops.length >= 2) {
          const lineFeat = turf.lineString(editorLine.geometry.coordinates);
          const clickPt = turf.point([point.lng, point.lat]);
          const distToRoute = turf.pointToLineDistance(clickPt, lineFeat, { units: 'meters' });

          if (distToRoute <= 400) {
            const clickedLoc =
              turf.nearestPointOnLine(lineFeat, clickPt, { units: 'kilometers' }).properties
                ?.location ?? Infinity;

            let insertIndex = editorLine.stops.length;
            for (let i = 0; i < editorLine.stops.length; i++) {
              const s = editorLine.stops[i];
              const sLoc =
                turf.nearestPointOnLine(lineFeat, turf.point([s.lng, s.lat]), {
                  units: 'kilometers',
                }).properties?.location ?? 0;
              if (clickedLoc < sLoc) {
                insertIndex = i;
                break;
              }
            }
            const copy = [...editorLine.stops];
            copy.splice(insertIndex, 0, newStop);
            inserted = copy;
          }
        }

        const renumbered = inserted.map((s, idx) => ({
          ...s,
          order: idx + 1,
          id: `${editorLine.id}_S${idx + 1}`,
        }));

        handleUpdateLine({ ...editorLine, stops: renumbered });
        setPickMode('none');
        setMobileSnap('half');
      }
    },
    [pickMode, lines, editorLine, handleUpdateLine, triggerFocus],
  );

  // Auto-fit bounds when a new itinerary is computed or selected
  useEffect(() => {
    if (mode !== 'planner' || !activeItinerary) return;
    const coords: [number, number][] = [
      [activeItinerary.originPoint.lng, activeItinerary.originPoint.lat],
      [activeItinerary.destinationPoint.lng, activeItinerary.destinationPoint.lat],
    ];
    for (const leg of activeItinerary.legs) {
      coords.push(...leg.segmentGeometry.coordinates);
    }
    const bounds = getBboxForCoordinates(coords);
    if (bounds) {
      triggerFocus({ bounds });
    }
  }, [mode, activeItinerary, triggerFocus]);

  const panelContent =
    mode === 'editor' && editorLine ? (
      <RouteEditor
        lang={lang}
        lines={lines}
        selectedLine={editorLine}
        onSelectLine={(line) => {
          setSelectedLineId(line.id);
          const bounds = getBboxForCoordinates(line.geometry.coordinates);
          if (bounds) triggerFocus({ bounds });
        }}
        onUpdateLine={handleUpdateLine}
        pickMode={pickMode}
        onSetPickMode={handleSetPickMode}
        onFocusStop={handleFocusStop}
      />
    ) : mode === 'planner' ? (
      <TripPlanner
        lang={lang}
        lines={lines}
        pickMode={pickMode}
        onSetPickMode={handleSetPickMode}
        nearMeResult={nearMeResult}
        onSetNearMePoint={(pt) => {
          setNearMePoint(pt);
          if (pt) {
            const res = findNearestServedStop(pt, lines);
            if (res) {
              const bounds = getBboxForCoordinates([
                [pt.lng, pt.lat],
                [res.nearestStop.lng, res.nearestStop.lat],
              ]);
              if (bounds) triggerFocus({ bounds });
            }
          }
        }}
        originPoint={originPoint}
        destinationPoint={destinationPoint}
        onSetOriginPoint={(pt) => {
          setOriginPoint(pt);
          setSelectedItineraryIndex(0);
        }}
        onSetDestinationPoint={(pt) => {
          setDestinationPoint(pt);
          setSelectedItineraryIndex(0);
        }}
        itineraries={itineraries}
        selectedItineraryIndex={selectedItineraryIndex}
        onSelectItineraryIndex={setSelectedItineraryIndex}
        onOpenLine={(line) => handleSelectLine(line)}
      />
    ) : (
      <LineExplorer
        lang={lang}
        lines={lines}
        selectedLine={selectedLine}
        direction={direction}
        onSelectLine={handleSelectLine}
        onChangeDirection={setDirection}
        onFocusStop={handleFocusStop}
      />
    );

  return (
    <div
      dir={dir}
      className="relative w-full h-[100dvh] flex bg-[#F2F7FA] dark:bg-[#05101C] text-[#041626] dark:text-[#EFF6FA] overflow-hidden"
    >
      {/* Desktop Fixed Sidebar (>= 768px) */}
      <aside className="hidden md:flex md:w-[390px] lg:w-[410px] md:shrink-0 h-[100dvh] bg-white dark:bg-[#081828] border-e border-[#DCE6EE] dark:border-[#183550] flex-col z-20">
        {/* Sidebar Brand Header + Primary Tabs */}
        <div className="px-4 pt-3.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            {lang === 'en' ? (
              <div className="min-w-0 space-y-0.5">
                <img
                  src={theme === 'dark' ? '/logo-tetoway-dark.png' : '/logo-tetoway.png'}
                  alt={t.app.brand}
                  className="h-9 w-auto object-contain"
                />
                <p className="text-[11px] text-[#4A657A] dark:text-[#85A3BC] truncate">
                  {t.app.subtitle}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/logo-pin.png"
                  alt={t.app.brand}
                  className="w-9 h-9 object-contain shrink-0"
                />
                <div className="min-w-0">
                  <h1 className="text-base font-bold tracking-tight text-[#041626] dark:text-[#EFF6FA] truncate">
                    {t.app.brand}
                  </h1>
                  <p className="text-[11px] text-[#4A657A] dark:text-[#85A3BC] truncate">
                    {t.app.subtitle}
                  </p>
                </div>
              </div>
            )}

            <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border bg-[#EEF5F9] dark:bg-[#0D2236] border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#34D399] tabular-nums">
              {t.app.networkBadge}
            </span>
          </div>

          {mode === 'editor' ? (
            <div className="flex items-center justify-between gap-2 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <PencilRuler className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                <span>{t.nav.editor}</span>
              </div>
              <button
                type="button"
                onClick={() => handleChangeMode('explorer')}
                className="text-[11px] font-medium text-[#4A657A] hover:text-[#041626] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] cursor-pointer"
              >
                {t.explorer.backToAll}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 -mx-4 px-4 border-t border-[#E6EFF5] dark:border-[#142B42]">
              <button
                type="button"
                onClick={() => handleChangeMode('explorer')}
                data-testid="nav-explorer"
                className={`inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  mode === 'explorer'
                    ? 'border-[#0155A6] dark:border-[#34D399] text-[#041626] dark:text-[#EFF6FA]'
                    : 'border-transparent text-[#526D82] hover:text-[#041626] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA]'
                }`}
              >
                <Compass
                  className={`w-3.5 h-3.5 ${
                    mode === 'explorer' ? 'text-[#0155A6] dark:text-[#34D399]' : ''
                  }`}
                  strokeWidth={1.75}
                />
                <span>{t.nav.explorer}</span>
              </button>

              <button
                type="button"
                onClick={() => handleChangeMode('planner')}
                data-testid="nav-planner"
                className={`inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  mode === 'planner'
                    ? 'border-[#01A069] dark:border-[#38BDF8] text-[#041626] dark:text-[#EFF6FA]'
                    : 'border-transparent text-[#526D82] hover:text-[#041626] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA]'
                }`}
              >
                <Route
                  className={`w-3.5 h-3.5 ${
                    mode === 'planner' ? 'text-[#01A069] dark:text-[#38BDF8]' : ''
                  }`}
                  strokeWidth={1.75}
                />
                <span>{t.nav.planner}</span>
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-2">
              <div className="w-5 h-5 border-2 border-[#0155A6] dark:border-[#34D399] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#4A657A] dark:text-[#85A3BC]">{t.app.loading}</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3">
              <p className="text-xs text-rose-600 dark:text-rose-400">{t.app.loadError}</p>
              <button
                type="button"
                onClick={() => void handleRetryLoad()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] text-xs font-medium text-[#041626] dark:text-[#EFF6FA] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>{t.app.retry}</span>
              </button>
            </div>
          ) : (
            panelContent
          )}
        </div>

        <ContactFooter lang={lang} />
      </aside>

      {/* Main Map Area */}
      <main className="relative flex-1 min-w-0 h-[100dvh]">
        <TopBar
          lang={lang}
          onChangeLang={setLang}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
          mode={mode}
          onChangeMode={handleChangeMode}
          showOsmStops={showOsmStops}
          onToggleOsmStops={() => setShowOsmStops((prev) => !prev)}
          osmStopCount={osmStops.length}
          selectedLine={mode === 'editor' ? editorLine : selectedLine}
          onFitSelectedLine={handleFitSelectedLine}
          onResetMapView={handleResetMapView}
          pickMode={pickMode}
          onCancelPickMode={() => setPickMode('none')}
          showInstallButton={!pwa.isStandalone}
          onInstallApp={pwa.handleInstallClick}
        />

        <TransitMap
          lang={lang}
          theme={theme}
          mode={mode}
          lines={lines}
          osmStops={osmStops}
          showOsmStops={showOsmStops}
          selectedLine={mode === 'editor' ? editorLine : selectedLine}
          direction={direction}
          pickMode={pickMode}
          nearMeResult={nearMeResult}
          originPoint={originPoint}
          destinationPoint={destinationPoint}
          activeItinerary={activeItinerary}
          focusTarget={focusTarget}
          onSelectLine={(line) => handleSelectLine(line)}
          onMapPick={handleMapPick}
          onEditorDragStop={handleEditorDragStop}
        />

        {/* Mobile Collapsible Bottom Sheet (< 768px) */}
        <MobileBottomSheet
          lang={lang}
          mode={mode}
          onChangeMode={handleChangeMode}
          snap={mobileSnap}
          onChangeSnap={setMobileSnap}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full p-6">
              <p className="text-xs text-[#4A657A] dark:text-[#85A3BC]">{t.app.loading}</p>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center h-full p-6 gap-2">
              <p className="text-xs text-rose-600 dark:text-rose-400">{t.app.loadError}</p>
              <button
                type="button"
                onClick={() => void handleRetryLoad()}
                className="px-3 py-1.5 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] text-xs font-medium text-[#041626] dark:text-[#EFF6FA]"
              >
                {t.app.retry}
              </button>
            </div>
          ) : (
            panelContent
          )}
        </MobileBottomSheet>
      </main>

      <InstallModal
        open={pwa.showGuideModal}
        lang={lang}
        isIos={pwa.isIos}
        canPromptInstall={pwa.canPromptInstall}
        onTriggerNativeInstall={() => void pwa.triggerNativeInstall()}
        onClose={pwa.closeGuideModal}
      />
    </div>
  );
}

export default App;
