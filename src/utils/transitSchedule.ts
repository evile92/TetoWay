export interface LineServiceStatus {
  isActive: boolean;
  isEndingSoon: boolean;
  minutesUntilEnd: number | null;
  firstDeparture: string;
  lastDeparture: string;
}

function parseMinutesOfDay(hhmm: string): number | null {
  const parts = hhmm.trim().split(':');
  if (parts.length !== 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const mins = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

function getMoroccoMinutesOfDay(now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '', 10);
    const minute = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '', 10);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      return (hour % 24) * 60 + minute;
    }
  } catch {
    // Fallback to device local clock if Intl timeZone data is unavailable
  }
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Determine offline whether a bus line is currently within its operating window
 * and whether its final departure is within 60 minutes based on Morocco local time (`Africa/Casablanca`).
 */
export function getLineServiceStatus(
  firstDeparture: string,
  lastDeparture: string,
  now: Date = new Date(),
): LineServiceStatus | null {
  const startMin = parseMinutesOfDay(firstDeparture);
  const endMin = parseMinutesOfDay(lastDeparture);
  if (startMin === null || endMin === null) return null;

  const currentMin = getMoroccoMinutesOfDay(now);
  const isActive =
    startMin <= endMin
      ? currentMin >= startMin && currentMin <= endMin
      : currentMin >= startMin || currentMin <= endMin;

  let minutesUntilEnd: number | null = null;
  if (isActive) {
    minutesUntilEnd =
      startMin <= endMin
        ? endMin - currentMin
        : currentMin <= endMin
          ? endMin - currentMin
          : 1440 - currentMin + endMin;
  }

  return {
    isActive,
    isEndingSoon: minutesUntilEnd !== null && minutesUntilEnd <= 60,
    minutesUntilEnd,
    firstDeparture,
    lastDeparture,
  };
}
