import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveStopLabel, TRANSLATIONS } from '../i18n';
import type {
  BusLine,
  DirectionMode,
  Lang,
  RideAlertStage,
  RideGpsPosition,
  RideGpsStatus,
  RideLegPlan,
  RideProgress,
  RideSession,
  TripItinerary,
} from '../types/transit';
import {
  cancelRideSpeech,
  playRideAlertTone,
  releaseScreenWakeLock,
  requestScreenWakeLock,
  speakRideAnnouncement,
  triggerRideVibration,
  unlockRideAudio,
} from '../utils/rideAlerts';
import {
  buildRideSessionFromItinerary,
  buildRideSessionFromLine,
  computeManualRideProgress,
  computeRideProgress,
  getInitialRideProgress,
} from '../utils/rideTracker';

export interface UseRideModeResult {
  session: RideSession | null;
  activeLeg: RideLegPlan | null;
  progress: RideProgress | null;
  gpsPosition: RideGpsPosition | null;
  gpsStatus: RideGpsStatus;
  soundEnabled: boolean;
  followGps: boolean;
  wakeLockActive: boolean;
  startFromItinerary: (itinerary: TripItinerary) => void;
  startFromLine: (line: BusLine, direction: DirectionMode, targetStopIndex?: number) => void;
  stopRide: () => void;
  setTargetStopIndex: (targetStopIndex: number) => void;
  advanceToNextLeg: () => void;
  retryGps: () => void;
  manualSyncStop: (stopIndex: number) => void;
  toggleSound: () => void;
  setFollowGps: (follow: boolean) => void;
  testAlert: () => void;
}

export function useRideMode(lang: Lang): UseRideModeResult {
  const [session, setSession] = useState<RideSession | null>(null);
  const [progress, setProgress] = useState<RideProgress | null>(null);
  const [gpsPosition, setGpsPosition] = useState<RideGpsPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<RideGpsStatus>('searching');
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [followGps, setFollowGps] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const activeLeg = useMemo(
    () => (session ? (session.legs[session.activeLegIndex] ?? null) : null),
    [session],
  );

  const langRef = useRef(lang);
  const soundEnabledRef = useRef(soundEnabled);
  const sessionRef = useRef<RideSession | null>(session);
  const activeLegRef = useRef<RideLegPlan | null>(activeLeg);
  const progressRef = useRef<RideProgress | null>(progress);
  const gpsPositionRef = useRef<RideGpsPosition | null>(gpsPosition);
  const lastStopIndexRef = useRef<number | null>(null);
  const firedAlertsRef = useRef<Set<RideAlertStage>>(new Set());

  useEffect(() => {
    langRef.current = lang;
    soundEnabledRef.current = soundEnabled;
    sessionRef.current = session;
    activeLegRef.current = activeLeg;
    progressRef.current = progress;
    gpsPositionRef.current = gpsPosition;
  }, [lang, soundEnabled, session, activeLeg, progress, gpsPosition]);

  const fireStageAlert = useCallback((stage: RideAlertStage, leg: RideLegPlan) => {
    if (stage === 'riding') return;
    if (firedAlertsRef.current.has(stage)) return;
    firedAlertsRef.current.add(stage);

    triggerRideVibration(stage);

    if (!soundEnabledRef.current) return;

    playRideAlertTone(stage);

    const currentLang = langRef.current;
    const tr = TRANSLATIONS[currentLang].ride;
    const targetStop = leg.stops[leg.targetStopIndex] ?? leg.stops[leg.stops.length - 1];
    const targetName = targetStop ? resolveStopLabel(targetStop, currentLang).text : '';

    if (stage === 'approaching') {
      speakRideAnnouncement(`${tr.voiceApproachingPrefix} ${targetName}`, currentLang);
    } else if (stage === 'arriving') {
      const prefix = leg.isTransferLeg ? tr.voiceTransferPrefix : tr.voiceArrivingPrefix;
      speakRideAnnouncement(`${prefix} ${targetName}`, currentLang);
    } else if (stage === 'passed') {
      speakRideAnnouncement(tr.voicePassedText, currentLang);
    }
  }, []);

  const isActive = session !== null;

  // Geolocation live watch lifecycle
  useEffect(() => {
    if (!isActive) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nextPos: RideGpsPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : 50,
          heading:
            typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading)
              ? pos.coords.heading
              : null,
          speed:
            typeof pos.coords.speed === 'number' && Number.isFinite(pos.coords.speed)
              ? pos.coords.speed
              : null,
          timestamp: pos.timestamp || Date.now(),
        };

        setGpsPosition(nextPos);
        setGpsStatus('tracking');

        const currentLeg = activeLegRef.current;
        if (!currentLeg) return;

        const nextProgress = computeRideProgress(currentLeg, nextPos, lastStopIndexRef.current);
        lastStopIndexRef.current = nextProgress.offRoute ? lastStopIndexRef.current : nextProgress.currentStopIndex;
        setProgress(nextProgress);

        if (!nextProgress.offRoute && nextProgress.stage !== 'riding') {
          fireStageAlert(nextProgress.stage, currentLeg);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('error');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 15000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isActive, gpsAttempt, fireStageAlert]);

  // Screen Wake Lock lifecycle with visibilitychange re-acquisition
  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    let sentinel: Awaited<ReturnType<typeof requestScreenWakeLock>> = null;

    const acquire = async () => {
      const next = await requestScreenWakeLock(() => {
        if (!cancelled) {
          setWakeLockActive(false);
        }
      });
      if (cancelled) {
        void releaseScreenWakeLock(next);
        return;
      }
      sentinel = next;
      setWakeLockActive(Boolean(next));
    };

    void acquire();

    const handleVisibilityChange = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        void acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseScreenWakeLock(sentinel);
    };
  }, [isActive]);

  const initializeSession = useCallback((nextSession: RideSession) => {
    unlockRideAudio();
    firedAlertsRef.current.clear();
    lastStopIndexRef.current = null;

    const firstLeg = nextSession.legs[nextSession.activeLegIndex] ?? null;
    const initialProgress = firstLeg ? getInitialRideProgress(firstLeg) : null;
    const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator;

    sessionRef.current = nextSession;
    activeLegRef.current = firstLeg;
    progressRef.current = initialProgress;
    gpsPositionRef.current = null;

    setSession(nextSession);
    setProgress(initialProgress);
    setGpsPosition(null);
    setGpsStatus(hasGeo ? 'searching' : 'unavailable');
    setFollowGps(true);
    setWakeLockActive(false);
    setGpsAttempt((prev) => prev + 1);

    if (soundEnabledRef.current) {
      playRideAlertTone('start');
    }
  }, []);

  const startFromItinerary = useCallback(
    (itinerary: TripItinerary) => {
      if (itinerary.legs.length === 0) return;
      initializeSession(buildRideSessionFromItinerary(itinerary));
    },
    [initializeSession],
  );

  const startFromLine = useCallback(
    (line: BusLine, direction: DirectionMode, targetStopIndex?: number) => {
      if (line.stops.length < 2) return;
      initializeSession(buildRideSessionFromLine(line, direction, targetStopIndex));
    },
    [initializeSession],
  );

  const stopRide = useCallback(() => {
    cancelRideSpeech();
    firedAlertsRef.current.clear();
    lastStopIndexRef.current = null;
    sessionRef.current = null;
    activeLegRef.current = null;
    progressRef.current = null;
    gpsPositionRef.current = null;
    setSession(null);
    setProgress(null);
    setGpsPosition(null);
    setWakeLockActive(false);
  }, []);

  const setTargetStopIndex = useCallback((nextTargetIdx: number) => {
    const prev = sessionRef.current;
    if (!prev) return;
    const leg = prev.legs[prev.activeLegIndex];
    if (!leg) return;

    const maxIdx = Math.max(0, leg.stops.length - 1);
    const clamped = Math.min(maxIdx, Math.max(Math.min(1, maxIdx), nextTargetIdx));
    const updatedLeg: RideLegPlan = { ...leg, targetStopIndex: clamped };
    const updatedSession: RideSession = {
      ...prev,
      legs: prev.legs.map((item, idx) => (idx === prev.activeLegIndex ? updatedLeg : item)),
    };

    firedAlertsRef.current.clear();
    sessionRef.current = updatedSession;
    activeLegRef.current = updatedLeg;

    const currentPos = gpsPositionRef.current;
    const nextProgress = currentPos
      ? computeRideProgress(updatedLeg, currentPos, lastStopIndexRef.current)
      : computeManualRideProgress(updatedLeg, progressRef.current?.currentStopIndex ?? 0);

    progressRef.current = nextProgress;
    setSession(updatedSession);
    setProgress(nextProgress);
  }, []);

  const advanceToNextLeg = useCallback(() => {
    unlockRideAudio();
    cancelRideSpeech();

    const prev = sessionRef.current;
    if (!prev) return;
    const nextIdx = prev.activeLegIndex + 1;
    const nextLeg = prev.legs[nextIdx];
    if (!nextLeg) return;

    const updatedSession: RideSession = { ...prev, activeLegIndex: nextIdx };
    firedAlertsRef.current.clear();
    lastStopIndexRef.current = null;
    sessionRef.current = updatedSession;
    activeLegRef.current = nextLeg;

    const currentPos = gpsPositionRef.current;
    let nextProgress: RideProgress;
    if (currentPos) {
      nextProgress = computeRideProgress(nextLeg, currentPos, null);
      lastStopIndexRef.current = nextProgress.offRoute ? null : nextProgress.currentStopIndex;
    } else {
      nextProgress = getInitialRideProgress(nextLeg);
    }

    progressRef.current = nextProgress;
    setSession(updatedSession);
    setProgress(nextProgress);

    if (soundEnabledRef.current) {
      playRideAlertTone('start');
    }
  }, []);

  const retryGps = useCallback(() => {
    unlockRideAudio();
    const hasGeo = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    if (!hasGeo) {
      setGpsStatus('unavailable');
      return;
    }
    setGpsStatus('searching');
    setGpsAttempt((prev) => prev + 1);
  }, []);

  const manualSyncStop = useCallback(
    (stopIndex: number) => {
      unlockRideAudio();
      const leg = activeLegRef.current;
      if (!leg) return;

      lastStopIndexRef.current = stopIndex;
      const nextProgress = computeManualRideProgress(leg, stopIndex);
      setProgress(nextProgress);

      if (nextProgress.stage !== 'riding') {
        fireStageAlert(nextProgress.stage, leg);
      }
    },
    [fireStageAlert],
  );

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        unlockRideAudio();
      } else {
        cancelRideSpeech();
      }
      return next;
    });
  }, []);

  const testAlert = useCallback(() => {
    unlockRideAudio();
    triggerRideVibration('approaching');
    if (soundEnabledRef.current) {
      playRideAlertTone('approaching');
      const currentLang = langRef.current;
      speakRideAnnouncement(TRANSLATIONS[currentLang].ride.voiceTestText, currentLang);
    }
  }, []);

  return {
    session,
    activeLeg,
    progress,
    gpsPosition,
    gpsStatus,
    soundEnabled,
    followGps,
    wakeLockActive,
    startFromItinerary,
    startFromLine,
    stopRide,
    setTargetStopIndex,
    advanceToNextLeg,
    retryGps,
    manualSyncStop,
    toggleSound,
    setFollowGps,
    testAlert,
  };
}
