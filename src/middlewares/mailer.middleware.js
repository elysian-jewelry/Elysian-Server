import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendVerificationCodeEmail = async (email, full_name, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Elysian Jewelry Signup',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff0f6; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f5c2d1; border-radius: 12px;">
        <h2 style="color: #d63384; text-align: center;">Welcome to <span style="color: #111;">Elysian Jewelry</span> 💖</h2>
        <p style="font-size: 16px;">Dear <strong>${full_name || 'Guest'}</strong>,</p>
        <p style="font-size: 15px;">Thank you for choosing Elysian Jewelry! To complete your account setup, please use the verification code below:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #fff; background-color: #d63384; padding: 12px 30px; border-radius: 10px; letter-spacing: 3px;">${verificationCode}</span>
        </div>
        <p style="font-size: 14px;"><strong>Note:</strong> This code will expire in 5 minutes. If you did not request this, you can safely ignore this email.</p>
        <p style="margin-top: 30px;">With sparkle and love, ✨<br><strong style="color: #d63384;">The Elysian Jewelry Team</strong></p>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #f5c2d1;">
        <p style="font-size: 12px; color: #888; text-align: center;">This is an automated message. Please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully');
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Error sending email');
  }
};


export const sendPasswordResetEmail = async (user, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Elysian Jewelry - Password Reset',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff0f6; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f5c2d1; border-radius: 12px;">
        <h2 style="color: #d63384; text-align: center;">Password Reset Request 🔒</h2>
        <p style="font-size: 16px;">Dear <strong>${user.full_name || 'User'}</strong>,</p>
        <p style="font-size: 15px;">We received a request to reset your password. Please use the verification code below to proceed:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #fff; background-color: #d63384; padding: 12px 30px; border-radius: 10px; letter-spacing: 3px;">${verificationCode}</span>
        </div>
        <p style="font-size: 14px;"><strong>Note:</strong> This code will expire in 5 minutes. If you didn’t request a password reset, no action is required.</p>
        <p style="margin-top: 30px;">Stay fabulous! 💎<br><strong style="color: #d63384;">The Elysian Jewelry Team</strong></p>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #f5c2d1;">
        <p style="font-size: 12px; color: #888; text-align: center;">This is an automated message. Please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully');
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Error sending email');
  }
};


export const sendOrderConfirmationEmail = async (user, order, items, discount) => {
  const productListHtml = items.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px;">${item.name}</td>
      <td style="padding: 10px;">${item.type}</td>
      <td style="padding: 10px;">${item.quantity}</td>
      <td style="padding: 10px;">${item.size || '-'}</td>
      <td style="padding: 10px;">${item.price} EGP</td>
    </tr>
  `).join('');

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #fff; max-width: 650px; margin: 40px auto; padding: 30px; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);">
      <h1 style="text-align: center; color: #d63384;">💖 Elysian Jewelry</h1>

      <h2 style="color: #333;">Thank you for your order, <span style="color: #d63384;">${user.full_name || 'Valued Customer'}</span>!</h2>
      <p style="font-size: 15px; margin-bottom: 20px;">Here is your detailed receipt:</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 8px; overflow: hidden;">
        <thead style="background-color: #ffdce5;">
          <tr>
            <th style="padding: 12px; text-align: left;">Product</th>
            <th style="padding: 12px; text-align: left;">Type</th>
            <th style="padding: 12px; text-align: left;">Qty</th>
            <th style="padding: 12px; text-align: left;">Size</th>
            <th style="padding: 12px; text-align: left;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${productListHtml}
        </tbody>
      </table>

      <div style="margin-top: 25px; font-size: 15px; line-height: 1.6;">
        <p><strong>Total:</strong> <span style="color: #111;">${order.total_amount.toFixed(2)} EGP</span></p>
        ${discount ? `<p><strong>Discount Applied:</strong> ${discount}%</p>` : ''}
        <p><strong>Estimated Delivery:</strong> 4–7 working days 🚚</p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">

      <p style="text-align: center; font-size: 14px;">We hope you love your new jewelry ✨<br><br><span style="color: #888;">This is an automated email. Please do not reply.</span></p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "🧾 Your Elysian Jewelry Order Receipt",
      html: htmlContent,
    });

    console.log(`📧 Order receipt sent to ${user.email}`);
  } catch (err) {
    console.error("Failed to send order receipt:", err.message);
  }
};

export const sendBirthdayPromoCodeEmail = async (user, promoCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "🎉 Happy Birthday from Elysian Jewelry 💖",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #fff0f6; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #f5c2d1; border-radius: 12px;">
        <h2 style="color: #d63384; text-align: center;">Happy Birthday, <span style="color: #111;">${user.full_name || 'Lovely Soul'}!</span> 🎂</h2>
        <p style="font-size: 16px;">We're so glad to have you as part of the <strong>Elysian Jewelry</strong> family. To make your special day sparkle even more, here's a special gift just for you:</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #fff; background-color: #d63384; padding: 12px 30px; border-radius: 10px; letter-spacing: 2px;">${promoCode}</span>
        </div>

        <p style="font-size: 15px; text-align: center;">
          Enjoy <strong>20% OFF</strong> valid only today<br/>
        </p>

        <p style="font-size: 14px; margin-top: 30px;">Treat yourself to something beautiful—you deserve it! </p>

        <p style="margin-top: 30px;">With sparkle and love, ✨<br><strong style="color: #d63384;">The Elysian Jewelry Team</strong></p>

        <hr style="margin-top: 40px; border: none; border-top: 1px solid #f5c2d1;">
        <p style="font-size: 12px; color: #888; text-align: center;">This is an automated message. Please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("🎁 Birthday promo code email sent to:", user.email);
  } catch (error) {
    console.error("Error sending birthday promo code email:", error);
    throw new Error("Error sending birthday promo code email");
  }
};


// Function to send OTP email for payment verification
export const sendPaymentOTPEmail = async (user, OTP) => {
  const mailOptions = {
    from: "tripify.planner@gmail.com",
    to: user.email,
    subject: "Your OTP for Payment Verification",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #00695c;">Payment Verification OTP</h2>
        <p>Dear ${user.name || 'User'},</p>
        <p>To complete your payment, please use the following One-Time Password (OTP):</p>
        <div style="font-size: 24px; font-weight: bold; color: #00695c; text-align: center; margin: 20px 0;">
          ${OTP}
        </div>
        <p>This OTP is valid for the next 10 minutes. Please do not share this code with anyone.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
        <p>Best regards,<br>Your Support Team</p>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999;">This is an automated message, please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully');
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Error sending OTP email');
  }
};







