// services/birthdayPromo.service.js
//
// Birthday promo codes, modelled as an entitlement rather than a scan:
// every user is owed exactly one code per birthday-year, and
// grantBirthdayPromoIfDue() hands it out whenever we notice it is owed —
// from the twice-daily cron, from the profile page the moment a user sets
// today's date, or from an admin correcting a birthday. All of those paths
// share this file, and all of them are safe to call any number of times.

import crypto from "crypto";
import User from "../models/user.js";
import PromoCode from "../models/promoCode.js";
import { sendBirthdayPromoCodeEmail } from "../middlewares/mailer.middleware.js";

/** The store's calendar. "Today" for birthday purposes is today in Cairo. */
export const STORE_TIMEZONE = "Africa/Cairo";

/**
 * How long a birthday code stays redeemable, as an absolute duration from
 * the moment it is issued. A duration (rather than "1 AM tomorrow") is
 * deliberate: it is the same length for a code issued by the 04:00 cron and
 * one issued inline at 23:00 when a user sets their birthday, and it does not
 * depend on the server process's timezone.
 */
export const BIRTHDAY_PROMO_VALID_DAYS = 7;
export const BIRTHDAY_PROMO_DISCOUNT = 20;

// Ambiguous glyphs (0/O, 1/I) are left out so a code read off a phone screen
// and typed into the checkout box cannot be mistyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Six-character promo code: 32^6 ≈ 1.07e9 possibilities. */
const generatePromoCode = () =>
  Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

/**
 * Persist a promo code, retrying if the unique index rejects a duplicate.
 * A collision is vanishingly unlikely at 32^6, but `promo_code` is a unique
 * index and an unhandled E11000 must not abort the caller.
 */
const createUniquePromoCode = async (user, expiry, attempts = 5) => {
  for (let i = 0; i < attempts; i++) {
    const promo_code = generatePromoCode();
    try {
      await PromoCode.create({
        user_id: user._id,
        promo_code,
        expiry_date: expiry,
        discount: BIRTHDAY_PROMO_DISCOUNT,
      });
      return promo_code;
    } catch (err) {
      if (err?.code !== 11000) throw err; // not a duplicate — real failure
      console.warn(`promo code collision on "${promo_code}", retrying`);
    }
  }
  throw new Error(`Could not generate a unique promo code after ${attempts} attempts`);
};

const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Calendar date in the store's timezone for an instant, independent of the
 * process's TZ. This is the only place "today" is computed.
 */
export const storeDateParts = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day") };
};

/**
 * Which stored birth days count as "today". Normally just today's day of
 * month; on Feb 28 of a non-leap year it is also the 29th, so a Feb 29
 * birthday is celebrated every year instead of one in four.
 */
export const birthdayDaysMatching = ({ year, month, day }) =>
  month === 2 && day === 28 && !isLeapYear(year) ? [28, 29] : [day];

/**
 * Does a stored birthday fall on `today` (store-timezone parts)?
 * Birthdays are stored as UTC midnight (Mongoose casts "YYYY-MM-DD" that
 * way, and the admin endpoint builds the same value), so the stored month
 * and day are read in UTC — never with the process's local getters.
 */
export const birthdayIsToday = (birthday, today) => {
  if (!(birthday instanceof Date) || Number.isNaN(birthday.getTime())) return false;
  return (
    birthday.getUTCMonth() + 1 === today.month &&
    birthdayDaysMatching(today).includes(birthday.getUTCDate())
  );
};

const promoExpiry = (now) =>
  new Date(now.getTime() + BIRTHDAY_PROMO_VALID_DAYS * 24 * 60 * 60 * 1000);

/**
 * Issue this year's birthday code to `user` if it is their birthday today
 * and they have not had one yet this year.
 *
 * `user` needs `_id`, `email` and `birthday`. Returns one of:
 *   { status: "no-birthday" | "not-today" | "already-sent" }
 *   { status: "sent", promo_code, expiry_date }
 * and throws only if the code could not be created or the email could not
 * be sent — in which case the year claim is released so a later run retries.
 *
 * Idempotency: the year is claimed with a conditional findOneAndUpdate
 * BEFORE any code is created. Two concurrent callers (cron tick + profile
 * save, or two cron ticks) race on that single atomic write and exactly one
 * of them proceeds.
 */
export const grantBirthdayPromoIfDue = async (user, now = new Date()) => {
  if (!user?.birthday) return { status: "no-birthday" };

  const today = storeDateParts(now);
  if (!birthdayIsToday(new Date(user.birthday), today)) {
    return { status: "not-today" };
  }

  const claimed = await User.findOneAndUpdate(
    { _id: user._id, birthday_promo_sent_year: { $ne: today.year } },
    { $set: { birthday_promo_sent_year: today.year } },
    { new: false, projection: { birthday_promo_sent_year: 1 } }
  );
  if (!claimed) return { status: "already-sent" };

  try {
    const expiry_date = promoExpiry(now);
    const promo_code = await createUniquePromoCode(user, expiry_date);
    await sendBirthdayPromoCodeEmail(user, promo_code);
    return { status: "sent", promo_code, expiry_date };
  } catch (err) {
    // Hand the year back so the next run can retry, but only if nobody else
    // has claimed it since.
    await User.updateOne(
      { _id: user._id, birthday_promo_sent_year: today.year },
      { $set: { birthday_promo_sent_year: claimed.birthday_promo_sent_year ?? null } }
    ).catch((rollbackErr) =>
      console.error(`Could not release birthday claim for ${user.email}:`, rollbackErr)
    );
    throw err;
  }
};

/**
 * Find everyone whose birthday is today (store timezone) and who has not
 * received this year's code, and grant it. Filtering happens in the
 * database via $month/$dayOfMonth on the UTC-midnight stored value, so this
 * never loads the whole users collection.
 *
 * Safe to run as often as you like: the per-user claim in
 * grantBirthdayPromoIfDue is what prevents duplicates, not the schedule.
 */
export const runBirthdayPromoJob = async (now = new Date()) => {
  const today = storeDateParts(now);
  const days = birthdayDaysMatching(today);

  const dueUsers = await User.find({
    birthday: { $type: "date" },
    birthday_promo_sent_year: { $ne: today.year },
    $expr: {
      $and: [
        { $eq: [{ $month: { date: "$birthday", timezone: "UTC" } }, today.month] },
        { $in: [{ $dayOfMonth: { date: "$birthday", timezone: "UTC" } }, days] },
      ],
    },
  }).select("_id email birthday");

  // Per-user isolation: one SMTP hiccup must not deny everyone after it.
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const user of dueUsers) {
    try {
      const result = await grantBirthdayPromoIfDue(user, now);
      if (result.status === "sent") sent += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `❌ Birthday promo failed for ${user.email}:`,
        err?.code || err?.message || err
      );
    }
  }

  const summary = { matched: dueUsers.length, sent, skipped, failed };
  console.log(
    `✅ Birthday promo job: ${sent} sent, ${skipped} skipped, ${failed} failed, ${dueUsers.length} matched.`
  );
  return summary;
};
