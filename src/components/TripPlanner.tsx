import {
  ArrowUpDown,
  Clock,
  Footprints,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Repeat,
  RotateCcw,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMad, resolveHubName, resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  BusLine,
  BusStop,
  GeoPoint,
  Lang,
  MapPickMode,
  NearMeResult,
  OsmStop,
  TripItinerary,
} from '../types/transit';
import { buildShareUrl } from '../utils/deepLink';
import { buildOfflineSearchPlaces } from '../utils/stopSearch';
import { BidiText, LineBadge } from './BidiText';
import { ShareButton } from './ShareButton';
import { StopSearchInput } from './StopSearchInput';

interface TripPlannerProps {
  lang: Lang;
  lines: BusLine[];
  osmStops: OsmStop[];
  pickMode: MapPickMode;
  onSetPickMode: (mode: MapPickMode) => void;
  nearMeResult: NearMeResult | null;
  onSetNearMePoint: (pt: GeoPoint | null) => void;
  onFocusNearStop: (stop: BusStop) => void;
  originPoint: GeoPoint | null;
  destinationPoint: GeoPoint | null;
  onSetOriginPoint: (pt: GeoPoint | null) => void;
  onSetDestinationPoint: (pt: GeoPoint | null) => void;
  itineraries: TripItinerary[];
  selectedItineraryIndex: number;
  onSelectItineraryIndex: (idx: number) => void;
  onOpenLine: (line: BusLine) => void;
  onStartRideItinerary: (itinerary: TripItinerary) => void;
}

export function TripPlanner({
  lang,
  lines,
  osmStops,
  pickMode,
  onSetPickMode,
  nearMeResult,
  onSetNearMePoint,
  onFocusNearStop,
  originPoint,
  destinationPoint,
  onSetOriginPoint,
  onSetDestinationPoint,
  itineraries,
  selectedItineraryIndex,
  onSelectItineraryIndex,
  onOpenLine,
  onStartRideItinerary,
}: TripPlannerProps) {
  const t = TRANSLATIONS[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);

  const searchablePlaces = useMemo(
    () => buildOfflineSearchPlaces(lines, osmStops, lang),
    [lines, osmStops, lang],
  );

  function handleGeolocate() {
    setGeoError(false);
    if (!('geolocation' in navigator)) {
      setGeoError(true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onSetPickMode('none');
        onSetNearMePoint({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        });
      },
      () => {
        setLocating(false);
        setGeoError(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }

  function handleSwapPoints() {
    const prevA = originPoint;
    const prevB = destinationPoint;
    onSetOriginPoint(prevB);
    onSetDestinationPoint(prevA);
  }

  return (
    <div
      dir={dir}
      className="flex flex-col h-full overflow-y-auto transit-scroll divide-y divide-[#DCE6EE] dark:divide-[#183550] bg-white dark:bg-[#081828]"
    >
      {/* Section 1: Nearest Bus Stop */}
      <section className="p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#041626] dark:text-[#EFF6FA]">
            <LocateFixed className="w-3.5 h-3.5 text-[#0155A6] dark:text-[#38BDF8]" strokeWidth={1.75} />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider">
              {t.planner.nearMeTitle}
            </h2>
          </div>

          {nearMeResult && (
            <button
              type="button"
              onClick={() => onSetNearMePoint(null)}
              className="text-[11px] font-medium text-[#526D82] hover:text-[#041626] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] cursor-pointer"
            >
              {t.planner.clearTrip}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={locating}
            data-testid="near-me-gps"
            className="inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-medium bg-[#0155A6] hover:bg-[#01468A] text-white dark:bg-[#01A069] dark:hover:bg-[#018A5B] dark:text-white disabled:opacity-60 transition-colors cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">
              {locating ? t.planner.locating : t.planner.nearMeBtn}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSetPickMode(pickMode === 'near_me' ? 'none' : 'near_me')}
            data-testid="near-me-pick-map"
            className={`inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              pickMode === 'near_me'
                ? 'bg-[#0098C8] border-[#0098C8] text-white'
                : 'bg-[#F4F8FB] border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{t.planner.pickOnMapBtn}</span>
          </button>
        </div>

        {geoError && (
          <p className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 rounded-md px-2.5 py-2">
            {t.planner.geolocationDenied}
          </p>
        )}

        {nearMeResult && (
          <div className="bg-[#F4F8FB] dark:bg-[#0D2236]/80 border border-[#DCE6EE] dark:border-[#183550] rounded-md p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wider text-[#526D82] dark:text-[#85A3BC]">
                  {t.planner.nearestStopFound}
                </div>
                <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] mt-0.5">
                  <BidiText label={resolveStopLabel(nearMeResult.nearestStop, lang)} />
                </div>
              </div>

              <div className="shrink-0 text-end">
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-[#0155A6] dark:text-[#38BDF8] tabular-nums">
                  <Footprints className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span dir="ltr">{nearMeResult.distanceMeters}</span>
                  <span>{t.planner.metersUnit}</span>
                </div>
                <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center justify-end gap-1">
                  <span dir="ltr">{nearMeResult.walkingMinutes}</span>
                  <span>{t.planner.walkMinutesUnit}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#DCE6EE] dark:border-[#183550]">
              <div className="text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC] mb-1.5">
                {t.planner.linesServingStop}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nearMeResult.servingLines.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => onOpenLine(line)}
                    className="cursor-pointer hover:opacity-85 transition-opacity"
                  >
                    <LineBadge number={line.number} color={line.color} size="sm" />
                  </button>
                ))}
              </div>
            </div>

            {nearMeResult.alternativeStops.length > 0 && (
              <div
                data-testid="near-me-alternatives"
                className="pt-2 border-t border-[#DCE6EE] dark:border-[#183550] space-y-2"
              >
                <div className="text-[10px] font-medium text-[#526D82] dark:text-[#85A3BC]">
                  {t.planner.moreNearbyStopsTitle}
                </div>
                <div className="space-y-1.5">
                  {nearMeResult.alternativeStops.map((alt) => (
                    <div
                      key={alt.stop.id}
                      className="rounded border border-[#DCE6EE] dark:border-[#183550] bg-white/80 dark:bg-[#081828]/80 px-2.5 py-2 space-y-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => onFocusNearStop(alt.stop)}
                        className="w-full flex items-center justify-between gap-2 text-start hover:opacity-80 cursor-pointer"
                      >
                        <span className="text-[11px] font-medium text-[#041626] dark:text-[#EFF6FA] truncate">
                          <BidiText label={resolveStopLabel(alt.stop, lang)} />
                        </span>
                        <span className="shrink-0 text-[10px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center gap-1">
                          <span dir="ltr">{alt.distanceMeters}</span>
                          <span>{t.planner.metersUnit}</span>
                        </span>
                      </button>

                      <div className="flex flex-wrap gap-1">
                        {alt.servingLines.map((line) => (
                          <button
                            key={line.id}
                            type="button"
                            onClick={() => onOpenLine(line)}
                            className="cursor-pointer hover:opacity-85 transition-opacity"
                          >
                            <LineBadge number={line.number} color={line.color} size="sm" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 2: Origin to Destination Route Planner */}
      <section className="p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#041626] dark:text-[#EFF6FA]">
            <Repeat className="w-3.5 h-3.5 text-[#01A069] dark:text-[#34D399]" strokeWidth={1.75} />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider">
              {t.planner.tripFinderTitle}
            </h2>
          </div>

          {(originPoint || destinationPoint) && (
            <div className="flex items-center gap-1">
              {originPoint && destinationPoint && (
                <ShareButton
                  lang={lang}
                  label={t.planner.shareTrip}
                  testId="share-trip-btn"
                  getSharePayload={() => ({
                    url: buildShareUrl({
                      lang,
                      mode: 'planner',
                      selectedLine: null,
                      direction: 'outbound',
                      originPoint,
                      destinationPoint,
                      nearMePoint: nearMeResult?.userPoint ?? null,
                      selectedItineraryIndex,
                    }),
                    title: t.share.tripShareTitle,
                    text: t.share.tripShareText,
                  })}
                />
              )}
              <button
                type="button"
                onClick={handleSwapPoints}
                title={t.planner.swapPoints}
                className="p-1.5 rounded-md text-[#526D82] hover:text-[#041626] hover:bg-[#F2F7FA] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetOriginPoint(null);
                  onSetDestinationPoint(null);
                }}
                title={t.planner.clearTrip}
                className="p-1.5 rounded-md text-[#526D82] hover:text-[#041626] hover:bg-[#F2F7FA] dark:text-[#85A3BC] dark:hover:text-[#EFF6FA] dark:hover:bg-[#0D2236] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>
          )}
        </div>

        {/* Origin (A) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#4A657A] dark:text-[#85A3BC]">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                dir="ltr"
                className="w-4 h-4 rounded-full bg-[#01A069] text-white text-[9px] font-bold inline-flex items-center justify-center"
              >
                A
              </span>
              <span>{t.planner.originLabel}</span>
            </span>
            {originPoint && (
              <span dir="ltr" className="text-[10px] font-mono tabular-nums text-[#7C97AE] dark:text-[#6B8BA5]">
                {`${originPoint.lat.toFixed(4)}, ${originPoint.lng.toFixed(4)}`}
              </span>
            )}
          </div>

          <div className="flex gap-1.5">
            <StopSearchInput
              lang={lang}
              value={originPoint}
              places={searchablePlaces}
              placeholder={t.planner.searchOriginPlaceholder}
              testId="trip-origin-input"
              onSelectPoint={(pt) => onSetOriginPoint(pt)}
            />

            <button
              type="button"
              onClick={() =>
                onSetPickMode(pickMode === 'trip_origin' ? 'none' : 'trip_origin')
              }
              data-testid="trip-pick-a"
              title={t.planner.pickPointA}
              className={`shrink-0 px-2.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                pickMode === 'trip_origin'
                  ? 'bg-[#01A069] border-[#01A069] text-white'
                  : 'bg-[#F4F8FB] border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span dir="ltr">A</span>
            </button>
          </div>
        </div>

        {/* Destination (B) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#4A657A] dark:text-[#85A3BC]">
            <span className="flex items-center gap-1.5 font-medium">
              <span
                dir="ltr"
                className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold inline-flex items-center justify-center"
              >
                B
              </span>
              <span>{t.planner.destinationLabel}</span>
            </span>
            {destinationPoint && (
              <span dir="ltr" className="text-[10px] font-mono tabular-nums text-[#7C97AE] dark:text-[#6B8BA5]">
                {`${destinationPoint.lat.toFixed(4)}, ${destinationPoint.lng.toFixed(4)}`}
              </span>
            )}
          </div>

          <div className="flex gap-1.5">
            <StopSearchInput
              lang={lang}
              value={destinationPoint}
              places={searchablePlaces}
              placeholder={t.planner.searchDestPlaceholder}
              testId="trip-dest-input"
              onSelectPoint={(pt) => onSetDestinationPoint(pt)}
            />

            <button
              type="button"
              onClick={() =>
                onSetPickMode(pickMode === 'trip_destination' ? 'none' : 'trip_destination')
              }
              data-testid="trip-pick-b"
              title={t.planner.pickPointB}
              className={`shrink-0 px-2.5 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                pickMode === 'trip_destination'
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-[#F4F8FB] border-[#DCE6EE] hover:border-[#B6CBD9] text-[#041626] dark:bg-[#0D2236] dark:border-[#183550] dark:hover:border-[#254E74] dark:text-[#EFF6FA]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span dir="ltr">B</span>
            </button>
          </div>
        </div>

        {/* Empty / Prompt State */}
        {(!originPoint || !destinationPoint) && (
          <p className="text-[11px] text-[#526D82] dark:text-[#85A3BC] leading-relaxed pt-1">
            {t.planner.promptSelectPoints}
          </p>
        )}

        {originPoint && destinationPoint && itineraries.length === 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-md p-2.5 text-xs text-amber-800 dark:text-amber-300">
            {t.planner.noRouteFound}
          </div>
        )}

        {/* Itineraries List */}
        {itineraries.length > 0 && (
          <div className="space-y-2 pt-1">
            {itineraries.map((itinerary, idx) => {
              const active = idx === selectedItineraryIndex;
              return (
                <div
                  key={`${itinerary.type}-${itinerary.legs.map((l) => l.line.id).join('-')}-${idx}`}
                  onClick={() => onSelectItineraryIndex(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectItineraryIndex(idx);
                    }
                  }}
                  data-testid={`itinerary-option-${idx}`}
                  className={`rounded-md border transition-colors cursor-pointer overflow-hidden ${
                    active
                      ? 'bg-white dark:bg-[#0B1D2E] border-[#0155A6] dark:border-[#34D399]'
                      : 'bg-[#F4F8FB] dark:bg-[#0D2236]/50 border-[#DCE6EE] dark:border-[#183550] hover:border-[#B6CBD9] dark:hover:border-[#254E74]'
                  }`}
                >
                  {/* Itinerary Summary Header */}
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-[#DCE6EE] dark:border-[#183550]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          itinerary.type === 'direct'
                            ? 'bg-emerald-50 text-[#018A5B] border-emerald-200 dark:bg-emerald-950/60 dark:text-[#34D399] dark:border-emerald-800/70'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70'
                        }`}
                      >
                        {itinerary.type === 'direct'
                          ? t.planner.directRouteBadge
                          : t.planner.transferRouteBadge}
                      </span>
                      {itinerary.legs.map((leg, lIdx) => (
                        <span
                          key={`${leg.line.id}-${lIdx}`}
                          className="inline-flex items-center gap-1"
                        >
                          {lIdx > 0 && <span className="text-[#85A3BC] text-xs">+</span>}
                          <LineBadge number={leg.line.number} color={leg.line.color} size="sm" />
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        title={t.planner.estimatedTimeLabel}
                        data-testid={`itinerary-duration-${idx}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EEF5F9] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-[11px] font-semibold text-[#0155A6] dark:text-[#34D399] tabular-nums"
                      >
                        <Clock className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span dir="ltr">~{itinerary.totalMinutes}</span>
                        <span>{t.explorer.minutesUnit}</span>
                      </span>

                      <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] tabular-nums flex items-center gap-1">
                        <span dir="ltr">{formatMad(itinerary.totalFareMad)}</span>
                        <span className="text-[11px] text-[#526D82] dark:text-[#85A3BC] font-normal">
                          {t.explorer.currency}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Step-by-step legs */}
                  <div className="divide-y divide-[#E6EFF5] dark:divide-[#152D44] text-[11px]">
                    <div className="px-3 py-1.5 flex items-center justify-between text-[#526D82] dark:text-[#85A3BC]">
                      <span className="flex items-center gap-1.5">
                        <Footprints className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span>{t.planner.walkingDistance}</span>
                      </span>
                      <span className="tabular-nums flex items-center gap-1">
                        <span dir="ltr">{itinerary.walkToBoardMeters}</span>
                        <span>{t.planner.metersUnit}</span>
                        <span>·</span>
                        <span dir="ltr">{itinerary.walkToBoardMinutes}</span>
                        <span>{t.explorer.minutesUnit}</span>
                      </span>
                    </div>

                    {itinerary.legs.map((leg, legIdx) => (
                      <div key={`${leg.line.id}-${legIdx}`} className="px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLine(leg.line);
                            }}
                            className="inline-flex items-center gap-1.5 hover:opacity-80 cursor-pointer"
                          >
                            <LineBadge number={leg.line.number} color={leg.line.color} size="sm" />
                            <span className="text-[10px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center gap-1">
                              <span dir="ltr">{leg.stopCount}</span>
                              <span>{t.explorer.stopsCount}</span>
                              <span>·</span>
                              <span dir="ltr">~{leg.rideMinutes}</span>
                              <span>{t.explorer.minutesUnit}</span>
                            </span>
                          </button>

                          <span className="text-[10px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center gap-1">
                            <span dir="ltr">{formatMad(leg.line.price_mad)}</span>
                            <span>{t.explorer.currency}</span>
                          </span>
                        </div>

                        <div className="text-[#041626] dark:text-[#EFF6FA] flex items-center gap-1 truncate">
                          <span className="text-[#526D82] dark:text-[#85A3BC] shrink-0">
                            {t.planner.boardAt}:
                          </span>
                          <BidiText
                            label={resolveStopLabel(leg.boardStop, lang)}
                            className="truncate font-medium"
                          />
                        </div>

                        <div className="text-[#041626] dark:text-[#EFF6FA] flex items-center gap-1 truncate">
                          <span className="text-[#526D82] dark:text-[#85A3BC] shrink-0">
                            {t.planner.alightAt}:
                          </span>
                          <BidiText
                            label={resolveStopLabel(leg.alightStop, lang)}
                            className="truncate font-medium"
                          />
                        </div>

                        {itinerary.type === 'transfer' && legIdx === 0 && (
                          <div className="pt-1 text-amber-700 dark:text-amber-300 flex items-center gap-1 font-medium">
                            <Repeat className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                            <span>{t.planner.transferAt}:</span>
                            <BidiText
                              label={
                                itinerary.transferHubKey
                                  ? { text: resolveHubName(itinerary.transferHubKey, lang), dir }
                                  : resolveStopLabel(leg.alightStop, lang)
                              }
                              className="font-semibold"
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="px-3 py-1.5 flex items-center justify-between text-[#526D82] dark:text-[#85A3BC]">
                      <span className="flex items-center gap-1.5">
                        <Footprints className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        <span>{t.planner.walkingDistance}</span>
                      </span>
                      <span className="tabular-nums flex items-center gap-1">
                        <span dir="ltr">{itinerary.walkFromAlightMeters}</span>
                        <span>{t.planner.metersUnit}</span>
                        <span>·</span>
                        <span dir="ltr">{itinerary.walkFromAlightMinutes}</span>
                        <span>{t.explorer.minutesUnit}</span>
                      </span>
                    </div>

                    {active && (
                      <div className="p-2.5 bg-[#F4F8FB] dark:bg-[#0D2236]/80">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartRideItinerary(itinerary);
                          }}
                          data-testid={`start-ride-itinerary-${idx}`}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Radio className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                          <span>{t.ride.startTripRideBtn}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
