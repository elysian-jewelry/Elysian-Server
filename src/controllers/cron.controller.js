import cron from 'node-cron';
import User from '../models/user.js';
import { sendMissingBirthdayEmail } from '../middlewares/mailer.middleware.js';
import {
  runBirthdayPromoJob,
  STORE_TIMEZONE,
} from '../services/birthdayPromo.service.js';

/**
 * Birthday promo codes — runs every 12 hours (04:00 and 16:00 Cairo).
 *
 * The schedule is only a safety net. A user who sets today's birthday gets
 * their code inline from the profile/admin controllers, and the job itself
 * is idempotent (one code per user per year, claimed atomically in
 * birthdayPromo.service.js), so a second tick, a manual re-run, or a tick
 * missed during a deploy can neither double-send nor lose anyone: the next
 * run picks up whoever is still owed a code.
 */
export const birthdayPromoCron = () => {
  cron.schedule('0 4,16 * * *', async () => {
    try {
      await runBirthdayPromoJob();
    } catch (error) {
      console.error("❌ Error running birthday cron:", error);
    }
  }, {
    timezone: STORE_TIMEZONE
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
