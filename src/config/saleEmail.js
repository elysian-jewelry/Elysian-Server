// The "Email customers" button on a running sale (admin Sales page).

// Pause between two customer emails. The mailbox sends at most 60 emails a
// minute (mailer.middleware.js); about 40 sale emails a minute leaves room
// for login codes and order receipts sent at the same time.
export const SALE_EMAIL_GAP_MS = 1500;

// Stop the send if this many emails in a row fail (for example, when the
// mailbox has reached its daily sending limit) instead of trying everyone.
export const SALE_EMAIL_MAX_FAILURES_IN_A_ROW = 10;
