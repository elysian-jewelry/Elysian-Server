import cron from 'node-cron';
import sequelize from '../../config/database.js'; // 👈 Add this
import { v4 as uuidv4 } from 'uuid';
import User from '../../models/user.js';
import PromoCode from '../../models/promoCode.js';
import { sendBirthdayPromoCodeEmail } from '../../middlewares/mailer.middleware.js';

// Utility: Generate short unique promo code (6 characters)
const generatePromoCode = () => uuidv4().replace(/-/g, '').substring(0, 6).toUpperCase();

// Cron job: Runs every day at 1:00 AM
export const birthdayPromoCron = () => {
  cron.schedule('0 1 * * *', async () => {
    const today = new Date();
    const todayMonth = today.getMonth() + 1; // months are 0-indexed
    const todayDate = today.getDate();

    console.log("🎂 Running birthday promo cron...");

    try {
      // Find users with birthdays today
      const usersWithBirthday = await User.findAll({
        where: sequelize.where(
          sequelize.fn('DATE_FORMAT', sequelize.col('birthday'), '%m-%d'),
          '=',
          `${todayMonth.toString().padStart(2, '0')}-${todayDate.toString().padStart(2, '0')}`
        )
      });

      for (const user of usersWithBirthday) {
        const promoCode = generatePromoCode();

        // Save promo code to DB
        await PromoCode.create({
          user_id: user.user_id,
          promo_code: promoCode,
          expiry_date: today, // expires end of today
          discount: 20
        });

        console.log(`🎉 Sent promo code ${promoCode} to user ${user.email}`);
        

        // Send promo code email
        await sendBirthdayPromoCodeEmail(user, promoCode);
      }

      console.log(`✅ Sent ${usersWithBirthday.length} birthday promo codes.`);
    } catch (error) {
      console.error("❌ Error running birthday cron:", error);
    }
  }, {
    timezone: "Africa/Cairo"
  });
};
