// ✅ MUST come first
import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,            // STARTTLS port
  secure: false,        // STARTTLS instead of direct SSL
  auth: {
    user: process.env.EMAIL_USER,   // Gmail address
    pass: process.env.EMAIL_PASS,   // 16-char Gmail App Password
  },
  requireTLS: true,                 // force encryption
  connectionTimeout: 20000,         // 20s to connect
  greetingTimeout: 15000,           // 15s to wait for server greeting
  socketTimeout: 30000,             // 30s of inactivity before disconnect
  pool: true,                        // reuse connections
  maxConnections: 3,                 // max concurrent connections
  rateDelta: 60000,                   // rate limit window (1 min)
  rateLimit: 60,                      // max emails per window
});

export const sendVerificationCodeEmail = async (email, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Elysian Jewelry Login Verification',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff0f6; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f5c2d1; border-radius: 12px;">
        <h2 style="color: #d63384; text-align: center;">Login Verification Code</h2>
        <p style="font-size: 15px;">To continue logging into your Elysian Jewelry account, please use the verification code below:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #fff; background-color: #d63384; padding: 12px 30px; border-radius: 10px; letter-spacing: 3px;">${verificationCode}</span>
        </div>
        <p style="font-size: 14px;"><strong>Note:</strong> This code will expire in 5 minutes. If you didn’t try to log in, you can safely ignore this email.</p>
        <p style="margin-top: 30px;">With sparkle and love, ✨<br><strong style="color: #d63384;">The Elysian Jewelry Team</strong></p>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #f5c2d1;">
        <p style="font-size: 12px; color: #888; text-align: center;">This is an automated message. Please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Error sending email');
  }
};


export const sendOrderConfirmationEmail = async (
  email,
  first_name,
  last_name,
  address,
  discount,
  subtotal,
  shipping_cost,
  order,
  items
) => {
  // Build product rows
  const productListHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px; text-align: center;">${item.name}</td>
        <td style="padding: 10px; text-align: center;">${item.type}</td>
        <td style="padding: 10px; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; text-align: center;">${item.size || '-'}</td>
        <td style="padding: 10px; text-align: center;">${item.color || '-'}</td>
        <td style="padding: 10px; text-align: center;">${item.price} EGP</td>
      </tr>
    `
    )
    .join('');

  // Build summary section
  const summaryHtml = `
    <div style="margin-top: 20px; font-size: 15px; line-height: 1.6; color: #111; text-align: center;">
      <p><strong>Shipping Address:</strong> ${address}</p>
      <p><strong>Shipping Cost:</strong> ${shipping_cost} EGP</p>
      <p><strong>Total Amount:</strong> ${order.total_amount} EGP</p>
      <p><strong>Estimated Delivery:</strong> 4–7 working days 🚚</p>
    </div>
  `;

  // Full HTML content
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #ffffff; max-width: 650px; margin: 40px auto; padding: 30px; border: 1px solid #f3f3f3; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); color: #111; text-align: center;">
      <h1 style="color: #ff4d88;">Elysian Jewelry</h1>
      <h2 style="color: #111; font-weight: 600;">
        Thank you for your order, <span style="color: #ff4d88;">${first_name + ' ' + last_name || 'Valued Customer'}</span>!💗
      </h2>
      <p style="font-size: 15px; margin-bottom: 20px; color: #111;">
        Here is your detailed receipt:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #fffafa; border: 1px solid #fce4ec; border-radius: 8px; overflow: hidden; margin: 0 auto;">
        <thead style="background-color: #ffe0eb;">
          <tr>
            <th style="padding: 12px; text-align: center; color: #111;">Product</th>
            <th style="padding: 12px; text-align: center; color: #111;">Type</th>
            <th style="padding: 12px; text-align: center; color: #111;">Quantity</th>
            <th style="padding: 12px; text-align: center; color: #111;">Size</th>
            <th style="padding: 12px; text-align: center; color: #111;">Color</th>
            <th style="padding: 12px; text-align: center; color: #111;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${productListHtml}
        </tbody>
      </table>

      ${summaryHtml}

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #f0f0f0;">

      <p style="font-size: 14px; color: #444;">
        We hope you love your jewelry as much as we loved making it! 💗<br><br>
        <span style="color: #aaa;">This is an automated email. Please do not reply.</span>
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "🧾 Your Elysian Jewelry Order Receipt",
      html: htmlContent,
    });
  } catch (err) {
    console.error("Failed to send order receipt:", err.message);
  }
};


export const sendBirthdayPromoCodeEmail = async (user, promoCode) => {

    const { first_name, last_name } = user;
  const displayName =
    first_name && last_name
      ? `${first_name} ${last_name}`
      : '';

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "🎉 Happy Birthday from Elysian Jewelry 💗",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #fff; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #ffc9dc; border-radius: 12px;">
        <h2 style="color: #ff4d88; text-align: center;">Happy Birthday!<span style="color: #111;">${displayName}</span> 🎂💗</h2>

        <p style="font-size: 16px; margin-top: 15px;">
          We're so glad to have you as part of the <strong>Elysian Jewelry</strong> family.
          To make your special day sparkle even more, here's a special gift just for you:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #fff; background-color: #ff4d88; padding: 12px 30px; border-radius: 10px; letter-spacing: 2px;">
            ${promoCode}
          </span>
        </div>

        <p style="font-size: 15px; text-align: center;">
          Enjoy <strong>20% OFF</strong> valid <strong>today only</strong>
        </p>

        <p style="font-size: 14px; margin-top: 30px;">Treat yourself to something beautiful you deserve it!</p>

        <p style="margin-top: 30px;">With sparkle and love ✨<br/>
          <strong style="color: #ff4d88;">The Elysian Jewelry Team</strong>
        </p>

        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ffc9dc;">

        <p style="font-size: 12px; color: #888; text-align: center;">
          This is an automated message. Please do not reply.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending birthday promo code email:", error);
    throw new Error("Error sending birthday promo code email");
  }
};

// in middlewares/mailer.middleware.js
export const sendMissingBirthdayEmail = async (user) => {
  const { email } = user || {};
  const profileLink = 'https://elysianjewelry.store/'; // homepage; update to /account/profile if you have a direct profile URL

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Don't miss your 20% Birthday Gift 🎁 | Elysian Jewelry",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #fff; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #ffc9dc; border-radius: 12px;">
        <h2 style="color: #ff4d88; text-align: center;">
          Keep the sparkle, elysian girlies ✨
        </h2>

        <p style="font-size: 16px; margin-top: 15px;">
          We love celebrating you! Add your birthdate so you don't miss your
          <strong>exclusive 20% OFF</strong> code on your special day.
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${profileLink}" style="display:inline-block; font-size: 16px; font-weight: 600; color: #fff; background-color: #ff4d88; padding: 12px 24px; border-radius: 10px; text-decoration: none;">
            Update your birthdate
          </a>
        </div>

        <p style="font-size: 14px; margin-top: 8px; text-align: center;">
          It only takes a moment, then we’ll send you a <strong>20% OFF</strong> gift on your birthday 🎂
        </p>

        <p style="margin-top: 30px;">
          With sparkle and love ✨<br/>
          <strong style="color: #ff4d88;">The Elysian Jewelry Team</strong>
        </p>

        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ffc9dc;">

        <p style="font-size: 12px; color: #888; text-align: center;">
          This is an automated message. Please do not reply.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending missing birthday email:", error);
    throw new Error("Error sending missing birthday email");
  }
};



