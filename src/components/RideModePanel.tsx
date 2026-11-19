import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Crosshair,
  Flag,
  Radio,
  Repeat,
  RotateCcw,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  BusStop,
  Lang,
  RideGpsPosition,
  RideGpsStatus,
  RideLegPlan,
  RideProgress,
  RideSession,
} from '../types/transit';
import { formatRideDistance, formatStopsRemainingLabel } from '../utils/rideTracker';
import { BidiText, LineBadge } from './BidiText';

interface RideModePanelProps {
  lang: Lang;
  session: RideSession;
  activeLeg: RideLegPlan;
  progress: RideProgress;
  gpsPosition: RideGpsPosition | null;
  gpsStatus: RideGpsStatus;
  soundEnabled: boolean;
  followGps: boolean;
  wakeLockActive: boolean;
  onStopRide: () => void;
  onChangeTargetStop: (targetStopIndex: number) => void;
  onAdvanceLeg: () => void;
  onRetryGps: () => void;
  onManualSyncStop: (stopIndex: number) => void;
  onFocusStop: (stop: BusStop) => void;
  onToggleSound: () => void;
  onToggleFollowGps: () => void;
  onTestAlert: () => void;
}

export function RideModePanel({
  lang,
  session,
  activeLeg,
  progress,
  gpsPosition,
  gpsStatus,
  soundEnabled,
  followGps,
  wakeLockActive,
  onStopRide,
  onChangeTargetStop,
  onAdvanceLeg,
  onRetryGps,
  onManualSyncStop,
  onFocusStop,
  onToggleSound,
  onToggleFollowGps,
  onTestAlert,
}: RideModePanelProps) {
  const t = TRANSLATIONS[lang];
  const r = t.ride;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [testedFeedback, setTestedFeedback] = useState(false);
  const testTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (testTimerRef.current !== null) {
        window.clearTimeout(testTimerRef.current);
      }
    };
  }, []);

  const targetStop =
    activeLeg.stops[activeLeg.targetStopIndex] ?? activeLeg.stops[activeLeg.stops.length - 1];
  const nextStop = activeLeg.stops[progress.nextStopIndex] ?? null;

  const targetDist =
    progress.distanceToTargetMeters !== null
      ? formatRideDistance(progress.distanceToTargetMeters, lang)
      : null;

  const nextDist =
    progress.distanceToNextMeters !== null
      ? formatRideDistance(progress.distanceToNextMeters, lang)
      : null;

  const stopsRemainingLabel =
    progress.stopsRemaining === 0
      ? r.stopsRemainingZero
      : formatStopsRemainingLabel(progress.stopsRemaining, lang);

  const isGpsIssue =
    gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'error';

  const gpsStatusLabel =
    gpsStatus === 'tracking'
      ? r.gpsLive
      : gpsStatus === 'searching'
        ? r.gpsSearching
        : gpsStatus === 'denied'
          ? r.gpsDenied
          : gpsStatus === 'unavailable'
            ? r.gpsUnavailable
            : r.gpsError;

  const heroCardClasses =
    progress.stage === 'arriving'
      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-600'
      : progress.stage === 'approaching'
        ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700'
        : progress.stage === 'passed'
          ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700'
          : 'bg-[#F4F8FB] dark:bg-[#0D2236] border-[#DCE6EE] dark:border-[#183550]';

  function handleTestAlertClick() {
    onTestAlert();
    setTestedFeedback(true);
    if (testTimerRef.current !== null) {
      window.clearTimeout(testTimerRef.current);
    }
    testTimerRef.current = window.setTimeout(() => {
      setTestedFeedback(false);
    }, 1800);
  }

  return (
    <div
      dir={dir}
      data-testid="ride-mode-panel"
      className="flex flex-col h-full bg-white dark:bg-[#081828]"
    >
      {/* Top Companion Bar */}
      <div className="px-3.5 py-2.5 border-b border-[#DCE6EE] dark:border-[#183550] space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <LineBadge number={activeLeg.line.number} color={activeLeg.line.color} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] truncate">
                  {r.title}
                </span>
                {session.legs.length > 1 && (
                  <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF5F9] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#38BDF8] tabular-nums inline-flex items-center gap-1">
                    <span>{r.legIndicator}</span>
                    <span dir="ltr">
                      {session.activeLegIndex + 1}/{session.legs.length}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#526D82] dark:text-[#85A3BC]">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    gpsStatus === 'tracking'
                      ? 'bg-[#01A069] dark:bg-[#34D399]'
                      : gpsStatus === 'searching'
                        ? 'bg-[#0098C8] animate-pulse'
                        : 'bg-amber-500'
                  }`}
                />
                <span className="truncate">{gpsStatusLabel}</span>
                {gpsStatus === 'tracking' && gpsPosition && (
                  <span dir="ltr" className="tabular-nums text-[#7C97AE] dark:text-[#6B8BA5]">
                    ±{gpsPosition.accuracy}m
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleSound}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? r.soundOnAria : r.soundOffAria}
              title={soundEnabled ? r.soundOnAria : r.soundOffAria}
              data-testid="ride-sound-toggle"
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-[#EEF5F9] dark:bg-[#0D2236] border-[#DCE6EE] dark:border-[#183550] text-[#0155A6] dark:text-[#38BDF8]'
                  : 'bg-[#F4F8FB] dark:bg-[#0D2236]/50 border-[#DCE6EE] dark:border-[#183550] text-[#7C97AE] dark:text-[#6B8BA5]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              ) : (
                <VolumeX className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleFollowGps}
              aria-pressed={followGps}
              aria-label={followGps ? r.followOnAria : r.followOffAria}
              title={followGps ? r.followOnAria : r.followOffAria}
              data-testid="ride-follow-toggle"
              className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                followGps
                  ? 'bg-[#E6F4FA] dark:bg-[#0B2D48] border-[#0098C8]/50 text-[#0155A6] dark:text-[#38BDF8]'
                  : 'bg-[#F4F8FB] dark:bg-[#0D2236] border-[#DCE6EE] dark:border-[#183550] text-[#526D82] dark:text-[#85A3BC]'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={onStopRide}
              data-testid="ride-stop-btn"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
              <span>{r.endRide}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto transit-scroll p-3.5 space-y-3">
        {/* Primary Focal Countdown / Stage Card */}
        <div
          data-testid="ride-hero-card"
          data-stage={progress.stage}
          className={`rounded-xl border p-3.5 space-y-3 transition-colors ${heroCardClasses}`}
        >
          {/* Stage Alert Banner (Approaching / Arriving / Passed) */}
          {progress.stage !== 'riding' && (
            <div className="flex items-start gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg shrink-0 inline-flex items-center justify-center ${
                  progress.stage === 'arriving'
                    ? 'bg-[#01A069] text-white'
                    : progress.stage === 'approaching'
                      ? 'bg-amber-500 text-white'
                      : 'bg-rose-600 text-white'
                }`}
              >
                {progress.stage === 'arriving' ? (
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                ) : progress.stage === 'approaching' ? (
                  <BellRing className="w-4 h-4" strokeWidth={1.75} />
                ) : (
                  <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-bold leading-tight ${
                    progress.stage === 'arriving'
                      ? 'text-[#016E48] dark:text-[#34D399]'
                      : progress.stage === 'approaching'
                        ? 'text-amber-800 dark:text-amber-300'
                        : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {progress.stage === 'arriving'
                    ? r.stageArrivingTitle
                    : progress.stage === 'approaching'
                      ? r.stageApproachingTitle
                      : r.stagePassedTitle}
                </div>
                <p className="text-[11px] text-[#4A657A] dark:text-[#A3BDD2] mt-0.5 leading-snug">
                  {progress.stage === 'arriving'
                    ? activeLeg.isTransferLeg
                      ? r.stageArrivingTransferDesc
                      : r.stageArrivingDesc
                    : progress.stage === 'approaching'
                      ? activeLeg.isTransferLeg
                        ? r.stageApproachingTransferDesc
                        : r.stageApproachingDesc
                      : r.stagePassedDesc}
                </p>
              </div>
            </div>
          )}

          {/* Main Countdown Metric */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {progress.stopsRemaining > 0 ? (
                <div className="flex items-baseline gap-2">
                  <span
                    dir="ltr"
                    data-testid="ride-stops-remaining"
                    className="text-3xl font-bold tracking-tight text-[#041626] dark:text-[#EFF6FA] tabular-nums leading-none"
                  >
                    {progress.stopsRemaining}
                  </span>
                  <span className="text-xs font-semibold text-[#4A657A] dark:text-[#9AB5CA]">
                    {stopsRemainingLabel}
                  </span>
                </div>
              ) : (
                <div
                  data-testid="ride-stops-remaining"
                  className="text-base font-bold text-[#018A5B] dark:text-[#34D399]"
                >
                  {r.stopsRemainingZero}
                </div>
              )}
            </div>

            {targetDist && (
              <div className="text-end shrink-0">
                <div className="text-sm font-bold text-[#0155A6] dark:text-[#38BDF8] tabular-nums inline-flex items-baseline gap-1">
                  <span dir="ltr">{targetDist.value}</span>
                  <span className="text-[11px] font-medium">{targetDist.unit}</span>
                </div>
                <div className="text-[10px] text-[#526D82] dark:text-[#85A3BC]">
                  {r.distanceToTarget}
                </div>
              </div>
            )}
          </div>

          {/* Next Stop Sub-row */}
          {progress.stopsRemaining > 0 && nextStop && (
            <div className="pt-2.5 border-t border-[#DCE6EE]/80 dark:border-[#183550]/80 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#0155A6] dark:text-[#38BDF8] shrink-0" strokeWidth={1.75} />
                <span className="text-[11px] text-[#526D82] dark:text-[#85A3BC] shrink-0">
                  {r.nextStopLabel}:
                </span>
                <BidiText
                  label={resolveStopLabel(nextStop, lang)}
                  className="font-semibold text-[#041626] dark:text-[#EFF6FA] truncate"
                />
              </div>
              {nextDist && (
                <span className="shrink-0 text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC] tabular-nums inline-flex items-center gap-0.5">
                  <span dir="ltr">{nextDist.value}</span>
                  <span>{nextDist.unit}</span>
                </span>
              )}
            </div>
          )}

          {/* Contextual Primary CTA at Arrival / Transfer */}
          {progress.stage === 'arriving' && (
            <div className="pt-1">
              {activeLeg.isTransferLeg && activeLeg.nextLineNumber ? (
                <button
                  type="button"
                  onClick={onAdvanceLeg}
                  data-testid="ride-next-leg-btn"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-[#0155A6] hover:bg-[#01468A] dark:bg-[#01A069] dark:hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>{r.boardNextLegBtn}</span>
                  <LineBadge
                    number={activeLeg.nextLineNumber}
                    color={activeLeg.nextLineColor ?? '#0155A6'}
                    size="sm"
                  />
                  <ArrowRight
                    className={`w-3.5 h-3.5 shrink-0 ${lang === 'ar' ? 'rotate-180' : ''}`}
                    strokeWidth={1.75}
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStopRide}
                  data-testid="ride-finish-btn"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-[#01A069] hover:bg-[#018A5B] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span>{r.finishRide}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Target Alighting Stop & Companion Controls */}
        <div className="rounded-lg border border-[#DCE6EE] dark:border-[#183550] bg-white dark:bg-[#081828] p-3 space-y-2.5">
          <div className="space-y-1.5">
            <label
              htmlFor={session.source === 'line' ? 'ride-target-stop-select' : undefined}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#526D82] dark:text-[#85A3BC]"
            >
              <Flag
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeLeg.isTransferLeg
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[#01A069] dark:text-[#34D399]'
                }`}
                strokeWidth={1.75}
              />
              <span>{activeLeg.isTransferLeg ? r.transferStopLabel : r.alightAtLabel}</span>
            </label>

            {session.source === 'line' ? (
              <select
                id="ride-target-stop-select"
                data-testid="ride-target-select"
                aria-label={r.changeAlightStop}
                value={activeLeg.targetStopIndex}
                onChange={(e) => onChangeTargetStop(Number(e.target.value))}
                className="w-full bg-[#F4F8FB] dark:bg-[#0D2236] border border-[#DCE6EE] dark:border-[#183550] focus:border-[#0155A6] dark:focus:border-[#34D399] focus:outline-none rounded-md px-2.5 py-2 text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] cursor-pointer"
              >
                {activeLeg.stops.map((stop, idx) => {
                  if (idx === 0) return null;
                  const label = resolveStopLabel(stop, lang);
                  return (
                    <option key={stop.id} value={idx}>
                      {`${idx + 1}. ${label.text}`}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA] min-w-0 truncate">
                  {targetStop && <BidiText label={resolveStopLabel(targetStop, lang)} />}
                </div>
                {activeLeg.isTransferLeg && activeLeg.nextLineNumber && progress.stage !== 'arriving' && (
                  <button
                    type="button"
                    onClick={onAdvanceLeg}
                    data-testid="ride-skip-next-leg-btn"
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-[#0155A6] dark:hover:border-[#34D399] text-[10px] font-semibold text-[#0155A6] dark:text-[#34D399] cursor-pointer"
                  >
                    <span>{r.boardNextLegBtn}</span>
                    <span dir="ltr">{activeLeg.nextLineNumber}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[#E6EFF5] dark:border-[#152D44] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {wakeLockActive && (
                <span
                  data-testid="ride-wakelock-badge"
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-[#018A5B] dark:text-[#34D399]"
                >
                  <Sun className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                  <span>{r.wakeLockOn}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleTestAlertClick}
              data-testid="ride-test-alert-btn"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#DCE6EE] dark:border-[#183550] bg-[#F4F8FB] dark:bg-[#0D2236] hover:border-[#B6CBD9] dark:hover:border-[#254E74] text-[11px] font-medium text-[#4A657A] dark:text-[#85A3BC] hover:text-[#041626] dark:hover:text-[#EFF6FA] transition-colors cursor-pointer"
            >
              <Bell className="w-3 h-3 shrink-0" strokeWidth={1.75} />
              <span>{testedFeedback ? r.testAlertNotice : r.testAlertBtn}</span>
            </button>
          </div>
        </div>

        {/* Off-route Gentle Notice */}
        {progress.offRoute && gpsStatus === 'tracking' && (
          <div className="rounded-lg border border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-[11px] text-sky-900 dark:text-sky-200 leading-relaxed">
            {r.offRouteWarning}
          </div>
        )}

        {/* GPS Permission / Signal Fallback Notice */}
        {isGpsIssue && (
          <div
            data-testid="ride-gps-warning"
            className="rounded-lg border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 p-2.5 flex items-center justify-between gap-2"
          >
            <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
              {r.gpsManualHint}
            </p>
            <button
              type="button"
              onClick={onRetryGps}
              data-testid="ride-retry-gps-btn"
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-[#0D2236] border border-amber-300 dark:border-amber-700 text-[11px] font-semibold text-amber-800 dark:text-amber-200 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 shrink-0" strokeWidth={1.75} />
              <span>{r.retryGps}</span>
            </button>
          </div>
        )}

        {/* Ordered Stop Progress Timeline */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-[#041626] dark:text-[#EFF6FA]">
              {r.stopsChecklistTitle}
            </h3>
            <span className="text-[11px] text-[#526D82] dark:text-[#85A3BC] tabular-nums flex items-center gap-1">
              <span dir="ltr">{activeLeg.stops.length}</span>
              <span>{t.explorer.stopsCount}</span>
            </span>
          </div>

          <div className="relative ps-5 space-y-0.5">
            <div
              className="absolute top-3 bottom-3 start-[9px] w-0.5 rounded-full opacity-40"
              style={{ backgroundColor: activeLeg.line.color }}
            />

            {activeLeg.stops.map((stop, idx) => {
              const isPassed = idx < progress.currentStopIndex;
              const isCurrent = idx === progress.currentStopIndex;
              const isNext =
                idx === progress.nextStopIndex &&
                progress.stopsRemaining > 0 &&
                !isCurrent;
              const isTarget = idx === activeLeg.targetStopIndex;
              const isAfterTarget = idx > activeLeg.targetStopIndex;
              const label = resolveStopLabel(stop, lang);

              return (
                <button
                  key={`${stop.id}-${idx}`}
                  type="button"
                  data-testid={`ride-stop-row-${idx}`}
                  onClick={() => {
                    onFocusStop(stop);
                    if (gpsStatus !== 'tracking') {
                      onManualSyncStop(idx);
                    }
                  }}
                  className={`relative w-full flex items-center justify-between gap-2 text-start py-2 px-2 rounded-md transition-colors cursor-pointer ${
                    isTarget
                      ? activeLeg.isTransferLeg
                        ? 'bg-amber-50/90 dark:bg-amber-950/40'
                        : 'bg-emerald-50/90 dark:bg-emerald-950/40'
                      : isCurrent || isNext
                        ? 'bg-[#EEF5F9] dark:bg-[#0D2236]'
                        : 'hover:bg-[#F4F8FB] dark:hover:bg-[#0D2236]/70'
                  } ${isPassed || isAfterTarget ? 'opacity-55' : ''}`}
                >
                  <span
                    className={`absolute flex items-center justify-center rounded-full border-2 ${
                      isTarget
                        ? 'w-4 h-4 -start-[19px]'
                        : isCurrent
                          ? 'w-3.5 h-3.5 -start-[18px]'
                          : 'w-2.5 h-2.5 -start-[16px]'
                    }`}
                    style={{
                      backgroundColor: isPassed
                        ? activeLeg.line.color
                        : isTarget
                          ? activeLeg.isTransferLeg
                            ? '#F59E0B'
                            : '#01A069'
                          : isCurrent
                            ? activeLeg.line.color
                            : 'var(--popup-bg)',
                      borderColor: isTarget
                        ? activeLeg.isTransferLeg
                          ? '#F59E0B'
                          : '#01A069'
                        : activeLeg.line.color,
                    }}
                  >
                    {isPassed && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
                  </span>

                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span
                      dir="ltr"
                      className="text-[11px] font-mono tabular-nums text-[#7C97AE] dark:text-[#6B8BA5] w-5 shrink-0"
                    >
                      {idx + 1}
                    </span>
                    <BidiText
                      label={label}
                      className={`text-xs truncate ${
                        isTarget || isCurrent || isNext
                          ? 'font-semibold text-[#041626] dark:text-[#EFF6FA]'
                          : 'font-normal text-[#2D475D] dark:text-[#C8DBE8]'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isCurrent && !isTarget && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#0155A6] dark:bg-[#0284C7] text-white">
                        {r.hereBadge}
                      </span>
                    )}
                    {isNext && !isTarget && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#E6F4FA] dark:bg-[#0B2D48] text-[#0155A6] dark:text-[#38BDF8]">
                        {r.nextBadge}
                      </span>
                    )}
                    {isTarget && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          activeLeg.isTransferLeg
                            ? 'bg-amber-500 text-white'
                            : 'bg-[#01A069] text-white'
                        }`}
                      >
                        {activeLeg.isTransferLeg ? r.transferBadge : r.alightBadge}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
