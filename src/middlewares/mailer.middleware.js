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





// Function to send email notification to admin for all out-of-stock products
export const sendOutOfStockNotificationEmailToAdmin = async (adminEmail, outOfStockProducts) => {
  // Create a formatted list of product names
  const productList = outOfStockProducts.map((product) => `<li>${product}</li>`).join("");

  const mailOptions = {
    from: "tripify.planner@gmail.com",
    to: adminEmail,
    subject: "Alert: Products Out of Stock",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #d9534f;">Out of Stock Products Notification</h2>
        <p>Dear Admin,</p>
        <p>The following products are currently out of stock:</p>
        <ul>
          ${productList}
        </ul>
        <p>Please take appropriate action to coordinate with sellers for restocking these items.</p>
        <p>Best regards,<br>Your Tripify Support Team</p>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999;">This is an automated message, please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Out of stock notification email sent to admin successfully");
  } catch (error) {
    console.error("Error sending out of stock notification email to admin:", error);
    throw new Error("Error sending out of stock notification email to admin");
  }
};



// Function to send email notification for unflagged (now visible) content
export const sendContentRestoredNotificationEmail = async (user, contentName, contentType) => {
  const mailOptions = {
    from: "tripify.planner@gmail.com",
    to: user.email,
    subject: "Notification: Your Content is Now Visible",
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #5cb85c;">Content Visibility Restored</h2>
        <p>Dear ${user.name || 'User'},</p>
        <p>We are pleased to inform you that your ${contentType.toLowerCase()} titled "${contentName}" has been reviewed and is now visible to tourists on our platform.</p>
        <p>Thank you for your patience and for contributing quality content to our community. If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>Your Support Team</p>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999;">This is an automated message, please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Content restored notification email sent successfully');
  } catch (error) {
    console.error('Error sending content restored notification email:', error);
    throw new Error('Error sending content restored notification email');
  }
};


export const sendPromoCodeEmail = async (user, discount, expiryDate, promoCode) => {
  const mailOptions = {
    from: "tripify.planner@gmail.com",
    to: user.email,
    subject: "Exclusive Promo Code Just for You!",
    text: `Dear ${user.name || 'User'},\n\nYou have received an exclusive promo code: ${promoCode}. Enjoy a ${discount}% discount on your next purchase! Use it before ${new Date(expiryDate).toLocaleDateString()}.\n\nHappy Shopping!\nYour Support Team`, // Plain text fallback
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #00695c;">Congratulations!</h2>
        <p>Dear ${user.name || 'User'},</p>
        <p>We are thrilled to offer you an exclusive promo code as a token of appreciation:</p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #00695c; background-color: #f4f4f4; padding: 10px 20px; border-radius: 8px;">${promoCode}</span>
        </div>
        <p><strong>Discount:</strong> ${discount}%</p>
        <p><strong>Expiry Date:</strong> ${new Date(expiryDate).toLocaleDateString()}</p>
        <p>Don't miss out! Use this code at checkout to enjoy your discount.</p>
        <p>Best regards,<br>Your Support Team</p>
        <hr style="border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #999;">This is an automated message, please do not reply.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Promo code email sent successfully');
  } catch (error) {
    console.error('Error sending promo code email:', error);
    throw new Error('Error sending promo code email');
  }
};


export const sendPaymentReceiptEmail = async (user, bookingDetails, tickets, totalAmount, discount) => {
  const today = new Date().toLocaleDateString();

  const eventDate = new Date(bookingDetails.date).toLocaleDateString();


  const mailOptions = {
    from: "tripify.planner@gmail.com",
    to: user.email,
    subject: "🧾 Payment Receipt for Your Booking",
    text: `Dear ${user.name || 'User'},\n\nThank you for your payment! We’re excited to confirm your booking.\n\nHere are the details of your booking and payment:\n\n- Booking Type: ${bookingDetails.type}\n- Booking Name: ${bookingDetails.name}\n- Number of Tickets: ${tickets}\n- Total Amount Paid: $${totalAmount}\n- Discount Applied: ${discount}%\n- Payment Date: ${today}\n\nWe appreciate your trust in us and look forward to providing you with an amazing experience!\n\nIf you have any questions or need assistance, please don’t hesitate to reach out.\n\nBest regards,\nYour Support Team`, // Plain text fallback
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ccc; border-radius: 12px; background-color: #f9f9f9;">
        <h1 style="color: #4caf50; text-align: center;">🧾 Payment Receipt</h1>
        <p style="font-size: 18px; color: #555; text-align: center;">
          Thank you, <strong>${user.name || 'User'}</strong>, for your payment! We are delighted to confirm your booking.
        </p>
        <h2 style="color: #1976d2; text-align: center; margin: 20px 0;">"${bookingDetails.name}"</h2>
        <div style="font-size: 16px; color: #333; margin: 20px 0;">
          <p><strong>Booking Details:</strong></p>
          <ul style="list-style-type: none; padding: 0;">
            <li>📝 <strong>Booking Type:</strong> ${bookingDetails.type}</li>
            <li>🎟️ <strong>Number of Tickets:</strong> ${tickets}</li>
            <li>💰 <strong>Total Amount Paid:</strong> ${totalAmount} EGP</li>
            <li>🎉 <strong>Discount Applied:</strong> ${discount}%</li>
            <li>📅 <strong>Event Date:</strong> ${eventDate}</li>
            <li>📅 <strong>Payment Date:</strong> ${today}</li>
          </ul>
        </div>
        <p style="font-size: 16px; text-align: center; color: #555;">
          Please keep this receipt for your records. If you have any questions or need further assistance, feel free to reach out to our support team.
        </p>
        <div style="text-align: center; margin-top: 30px;">
          <img src="https://example.com/payment-confirmation.png" alt="Payment Confirmed" style="max-width: 100%; height: auto; border-radius: 12px;">
        </div>
        <p style="font-size: 16px; text-align: center; margin-top: 20px; color: #555;">
          Thank you for choosing us! We look forward to making your experience memorable. 😊
        </p>
        <p style="font-size: 14px; text-align: center; color: #999; margin-top: 20px;">
          This is an automated message, please do not reply.
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





