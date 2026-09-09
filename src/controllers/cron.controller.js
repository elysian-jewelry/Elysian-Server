import cron from 'node-cron';
import crypto from 'crypto';
import User from '../models/user.js';
import PromoCode from '../models/promoCode.js';
import { sendBirthdayPromoCodeEmail, sendMissingBirthdayEmail } from '../middlewares/mailer.middleware.js';

// Ambiguous glyphs (0/O, 1/I) are left out so a code read off a phone screen
// and typed into the checkout box cannot be mistyped.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Six-character promo code.
 *
 * `uuid` was imported here but never declared in package.json — it resolved
 * only because npm hoisted a transitive copy from the Google client
 * libraries. When one of those moved its own uuid range, this import would
 * fail, server.js would exit(1) on its dynamic import, and the instance would
 * enter a restart loop. crypto is built in, so there is nothing to resolve.
 *
 * It is also a far larger keyspace: 32^6 ≈ 1.07e9 versus the old 6 hex
 * characters at 16^6 ≈ 1.7e7 — ~64x more room before collisions matter.
 */
const generatePromoCode = () =>
  Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

/**
 * Persist a promo code, retrying if the unique index rejects a duplicate.
 *
 * At 32^6 a collision is vanishingly unlikely, but `promo_code` is a unique
 * index and an unhandled E11000 used to abort the whole cron run, so the
 * retry costs nothing and removes the failure mode entirely.
 */
const createUniquePromoCode = async (user, expiry, attempts = 5) => {
  for (let i = 0; i < attempts; i++) {
    const promo_code = generatePromoCode();
    try {
      await PromoCode.create({
        user_id: user._id,
        promo_code,
        expiry_date: expiry,
        discount: 20,
      });
      return promo_code;
    } catch (err) {
      if (err?.code !== 11000) throw err; // not a duplicate — real failure
      console.warn(`promo code collision on "${promo_code}", retrying`);
    }
  }
  throw new Error(`Could not generate a unique promo code after ${attempts} attempts`);
};

// Cron job: Runs every day at 4:00 AM
export const birthdayPromoCron = () => {
  cron.schedule('0 4 * * *', async () => {
    const tomorrowAt1AM = new Date();
    tomorrowAt1AM.setDate(tomorrowAt1AM.getDate() + 1);
    tomorrowAt1AM.setHours(1, 0, 0, 0);
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    try {
      // Find users whose birthday (month & day) is today
      const usersWithBirthday = await User.find({
        birthday: {
          $exists: true
        }
      });

      const matchedUsers = usersWithBirthday.filter(user => {
        const bday = new Date(user.birthday);
        return bday.getMonth() + 1 === month && bday.getDate() === day;
      });

      // Per-user isolation: one failure (an SMTP hiccup is the likely one)
      // must not deny every remaining birthday customer their code. The loop
      // previously shared a single try/catch, so the first error ended the run
      // silently for everyone after it.
      let sent = 0;
      let failed = 0;

      for (const user of matchedUsers) {
        try {
          const promoCode = await createUniquePromoCode(user, tomorrowAt1AM);
          await sendBirthdayPromoCodeEmail(user, promoCode);
          sent += 1;
        } catch (err) {
          failed += 1;
          console.error(
            `❌ Birthday promo failed for ${user.email}:`,
            err?.code || err?.message || err
          );
        }
      }

      console.log(
        `✅ Birthday promo codes: ${sent} sent, ${failed} failed, ${matchedUsers.length} matched.`
      );
    } catch (error) {
      console.error("❌ Error running birthday cron:", error);
    }
  }, {
    timezone: "Africa/Cairo"
  });
};


// Core function: run missing birthday reminder logic
export const runMissingBirthdayReminder = async () => {
  try {
    const users = await User.find({
      $or: [
        { birthday: { $exists: false } },
        { birthday: null },
        { birthday: '' }
      ]
    }).select('email');

    let sent = 0, failed = 0;
    for (const user of users) {
      if (!user?.email) continue;
      try {
        console.log('Sending:', user.email);
        await sendMissingBirthdayEmail(user);
        sent++;
      } catch (e) {
        failed++;
        console.error(`❌ Failed for ${user.email}:`, e.code || e.message);
      }
    }

    console.log(`✅ Sent: ${sent}, ❌ Failed: ${failed}`);
    return { sent, failed };
  } catch (err) {
    console.error('❌ Error running missingBirthdayReminder:', err);
    throw err;
  }
};

// Cron wrapper (runs every Friday 18:00 Cairo time)
export const missingBirthdayReminderCron = () => {
  cron.schedule('0 18 * * 5', runMissingBirthdayReminder, {
    timezone: 'Africa/Cairo'
  });
};
