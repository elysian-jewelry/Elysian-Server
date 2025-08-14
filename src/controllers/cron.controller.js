import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/user.js';
import PromoCode from '../models/promoCode.js';
import { sendBirthdayPromoCodeEmail, sendMissingBirthdayEmail } from '../middlewares/mailer.middleware.js';

// Utility: Generate short unique promo code (6 characters)
const generatePromoCode = () => uuidv4().replace(/-/g, '').substring(0, 6).toUpperCase();

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

      for (const user of matchedUsers) {
        const promoCode = generatePromoCode();

        // Save promo code to DB
        await PromoCode.create({
          user_id: user._id,
          promo_code: promoCode,
          expiry_date: tomorrowAt1AM,
          discount: 20
        });

        // console.log(`🎉 Sent promo code ${promoCode} to user ${user.email}`);

        // Send promo code email
        await sendBirthdayPromoCodeEmail(user, promoCode);
      }

      console.log(`✅ Sent ${matchedUsers.length} birthday promo codes.`);
    } catch (error) {
      console.error("❌ Error running birthday cron:", error);
    }
  }, {
    timezone: "Africa/Cairo"
  });
};




export const missingBirthdayReminderCron = () => {
  // ┌ min (0) ┬ hour (18) ┬ day-of-month (*) ┬ month (*) ┬ day-of-week (5=Fri)
  // 0 18 * * 5  -> Every Friday 18:00
  cron.schedule('11 23 * * *', async () => {
    try {
      // Users with no birthday stored
      const users = await User.find({
        $or: [
          { birthday: { $exists: false } },
          { birthday: null },
          { birthday: '' } // just in case schema allows empty string
        ]
      }).select('email first_name last_name');

    let sent = 0, failed = 0;
    for (const user of users) {
      if (!user?.email) continue;
      try {
        console.log('Sending:', user.email);
        await sendMissingBirthdayEmail(user); // uses the transporter above
        sent++;
      } catch (e) {
        failed++;
        console.error(`❌ Failed for ${user.email}:`, e.code || e.message);
      }
    }
    console.log(`✅ Sent: ${sent}, ❌ Failed: ${failed}`);

    } catch (err) {
      console.error('❌ Error running missingBirthdayReminderCron:', err);
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};



export const missingBirthdayReminderCronTest = () => {
  // Instead of Friday 6PM, run every minute for testing
  cron.schedule('43 23 * * *', async () => {
    try {
      // 🔹 Your test email list
      const testEmails = [
        'mennamohamedomar89@icloud.com',
        'shadennwaleedd@yahoo.com',
        'nosaya2008@icloud.com',
        'alyahamada9@gmail.com',
        'karma.mansour302@gmail.com',
        'noufsaghier@gmail.com',
        'samirelbatal0@gmail.com',
      ];

      // Fetch users by those emails
      const users = await User.find({
        email: { $in: testEmails }
      }).select('email first_name last_name');

      let sent = 0, failed = 0;
    for (const user of users) {
      if (!user?.email) continue;
      try {
        console.log('Sending:', user.email);
        await sendMissingBirthdayEmail(user); // uses the transporter above
        sent++;
      } catch (e) {
        failed++;
        console.error(`❌ Failed for ${user.email}:`, e.code || e.message);
      }
    }
    console.log(`✅ Sent: ${sent}, ❌ Failed: ${failed}`);

    } catch (err) {
      console.error('❌ Error running test missingBirthdayReminderCron:', err);
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};
