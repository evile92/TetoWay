export interface LineServiceStatus {
  isActive: boolean;
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

/**
 * Determine offline whether a bus line is currently within its operating window
 * based strictly on the local device clock (`now`).
 */
export function getLineServiceStatus(
  firstDeparture: string,
  lastDeparture: string,
  now: Date = new Date(),
): LineServiceStatus | null {
  const startMin = parseMinutesOfDay(firstDeparture);
  const endMin = parseMinutesOfDay(lastDeparture);
  if (startMin === null || endMin === null) return null;

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const isActive =
    startMin <= endMin
      ? currentMin >= startMin && currentMin <= endMin
      : currentMin >= startMin || currentMin <= endMin;

  return {
    isActive,
    firstDeparture,
    lastDeparture,
  };
}
