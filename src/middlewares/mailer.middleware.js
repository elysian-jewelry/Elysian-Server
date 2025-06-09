import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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
    console.log('Login verification email sent successfully');
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
        <p style="font-size: 16px;">Dear <strong>${user.first_name + ' ' + user.last_name || 'User'}</strong>,</p>
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


export const sendOrderConfirmationEmail = async (email, first_name, last_name, order, items, discount) => {
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
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #ffffff; max-width: 650px; margin: 40px auto; padding: 30px; border: 1px solid #f3f3f3; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); color: #111;">
      <h1 style="text-align: center; color: #ff4d88;">Elysian Jewelry 💗</h1>

      <h2 style="color: #111; font-weight: 600;">Thank you for your order, <span style="color: #ff4d88;">${first_name + ' ' + last_name || 'Valued Customer'}</span>!</h2>
      <p style="font-size: 15px; margin-bottom: 20px; color: #111;">Here is your detailed receipt:</p>
    

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #fffafa; border: 1px solid #fce4ec; border-radius: 8px; overflow: hidden;">
        <thead style="background-color: #ffe0eb;">
          <tr>
            <th style="padding: 12px; text-align: left; color: #111;">Product</th>
            <th style="padding: 12px; text-align: left; color: #111;">Type</th>
            <th style="padding: 12px; text-align: left; color: #111;">Quantity</th>
            <th style="padding: 12px; text-align: left; color: #111;">Size</th>
            <th style="padding: 12px; text-align: left; color: #111;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${productListHtml}
        </tbody>
      </table>

      <div style="margin-top: 25px; font-size: 15px; line-height: 1.6; color: #111;">
        <p><strong>Total:</strong> <span style="color: #111;">${order.total_amount.toFixed(2)} EGP</span></p>
        ${discount ? `<p><strong>Discount Applied:</strong> ${discount}%</p>` : ''}
        <p><strong>Estimated Delivery:</strong> 4–7 working days 🚚</p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #f0f0f0;">

      <p style="text-align: center; font-size: 14px; color: #444;">
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
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "🎉 Happy Birthday from Elysian Jewelry 💗",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #fff; color: #111; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #ffc9dc; border-radius: 12px;">
        <h2 style="color: #ff4d88; text-align: center;">Happy Birthday, <span style="color: #111;">${user.first_name + ' ' + user.last_name || 'Lovely Soul'}!</span> 🎂💗</h2>

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

        <p style="font-size: 14px; margin-top: 30px;">Treat yourself to something beautiful — you deserve it!</p>

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
    console.log("🎁 Birthday promo code email sent to:", user.email);
  } catch (error) {
    console.error("Error sending birthday promo code email:", error);
    throw new Error("Error sending birthday promo code email");
  }
};









