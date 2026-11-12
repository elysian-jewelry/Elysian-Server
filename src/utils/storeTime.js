// Wall-clock times in the store's time zone (Cairo), as the admin types them
// into a date-and-time field: "2026-11-11T23:59". The server runs in UTC, so
// these convert explicitly instead of trusting the process or browser zone,
// and they follow Egypt's daylight-saving changes.

import { STORE_TIMEZONE } from "../config/store.js";

export const STORE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partsIn = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TIMEZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );

/** How far the store's clock is ahead of UTC at `date`, in ms. */
const offsetAt = (date) => {
  const p = partsIn(date);
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * "2026-11-11T23:59" in Cairo → the Date it names, or null when the text is
 * not a real date and time.
 */
export const storeTimeToDate = (text) => {
  const m = STORE_TIME_PATTERN.exec(String(text ?? ""));
  if (!m) return null;
  const wallAsUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // The offset depends on the instant, which depends on the offset: start
  // from the offset at the wall time read as UTC, then correct once, which
  // settles it even across a daylight-saving change.
  let ts = wallAsUtc - offsetAt(new Date(wallAsUtc));
  ts = wallAsUtc - offsetAt(new Date(ts));
  const date = new Date(ts);
  // Rejects dates that don't exist ("2026-02-30T10:00") and the hour skipped
  // when clocks move forward, which would otherwise shift silently.
  return dateToStoreTime(date) === text ? date : null;
};

/** A Date → "2026-11-11T23:59" in Cairo, for filling a date-and-time field. */
export const dateToStoreTime = (date) => {
  const p = partsIn(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
