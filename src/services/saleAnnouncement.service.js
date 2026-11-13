// services/saleAnnouncement.service.js
//
// "Email customers" on a running sale: sends the "don't miss the sale" email
// (mailer.middleware.js) to every customer, or only to the test addresses
// while test mode is on (config/saleEmail.js).
//
// A send to every customer takes minutes, so it runs in the background after
// the admin's request has been answered, one email at a time. Before each
// email it looks at the sale again: it stops if the sale has ended or been
// deleted, and an edited title, percentage or end date is used from then on.
//
// The send in progress is kept in memory: the app runs as a single instance
// (app.yaml), so that is enough to stop the same sale being sent twice at
// once. When a send to customers finishes, the sale keeps a record of it
// (sent when, to how many), shown on the admin page. Test sends aren't kept.

import Sale from "../models/sale.js";
import User from "../models/user.js";
import { getActiveSale } from "./sale.service.js";
import { sendSaleAnnouncementEmail } from "../middlewares/mailer.middleware.js";
import {
  SALE_EMAIL_TEST_MODE,
  SALE_EMAIL_TEST_RECIPIENTS,
  SALE_EMAIL_GAP_MS,
  SALE_EMAIL_MAX_FAILURES_IN_A_ROW,
} from "../config/saleEmail.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends in progress, by sale id: { total, sent, failed, test, started_at }. */
const inProgress = new Map();

/** Who gets the email: the test addresses in test mode, else every customer once. */
const recipients = async () => {
  if (SALE_EMAIL_TEST_MODE) return [...SALE_EMAIL_TEST_RECIPIENTS];
  const users = await User.find({}, { email: 1, _id: 0 }).lean();
  const emails = new Set();
  for (const { email } of users) {
    const clean = String(email ?? "").trim().toLowerCase();
    if (EMAIL_PATTERN.test(clean)) emails.add(clean);
  }
  return [...emails];
};

/** For the admin page: the send in progress, else the last send to customers, else null. */
export const announcementStatus = (sale) => {
  const live = inProgress.get(String(sale._id));
  if (live) return { status: "sending", ...live };
  const last = sale.announcement;
  if (!last?.sent_at) return null;
  return {
    status: last.stopped ? "stopped" : "sent",
    total: last.total,
    sent: last.sent,
    failed: last.failed,
    stopped: last.stopped ?? null,
    sent_at: last.sent_at,
    test: false,
  };
};

const run = async (saleId, emails, progress) => {
  let stopped = null;
  let failuresInARow = 0;
  try {
    for (const [i, email] of emails.entries()) {
      if (i > 0) await wait(SALE_EMAIL_GAP_MS);
      const sale = await getActiveSale();
      if (!sale || String(sale._id) !== saleId) {
        stopped = "sale_ended";
        break;
      }
      try {
        await sendSaleAnnouncementEmail(email, sale);
        progress.sent++;
        failuresInARow = 0;
      } catch (error) {
        progress.failed++;
        failuresInARow++;
        console.error(`Sale email to ${email} failed:`, error?.code || error?.message);
        if (failuresInARow >= SALE_EMAIL_MAX_FAILURES_IN_A_ROW) {
          stopped = "too_many_failures";
          break;
        }
      }
    }
  } catch (error) {
    stopped = "error";
    console.error("Sale email send stopped:", error);
  }

  console.log(
    `Sale email ${progress.test ? "(test) " : ""}for ${saleId}: ${progress.sent} sent, ` +
      `${progress.failed} failed of ${progress.total}${stopped ? `, stopped (${stopped})` : ""}`
  );
  if (progress.test) return { ...progress, stopped };

  try {
    // timestamps: false keeps the sale's version (updated_at) as it is, so
    // customers in the middle of checkout aren't told the prices changed.
    await Sale.updateOne(
      { _id: saleId },
      {
        $set: {
          announcement: {
            sent_at: new Date(),
            total: progress.total,
            sent: progress.sent,
            failed: progress.failed,
            stopped,
          },
        },
      },
      { timestamps: false }
    );
  } catch (error) {
    console.error("Couldn't record the sale email send:", error);
  }
  return { ...progress, stopped };
};

/**
 * Starts sending the email for `sale` (a running sale). Returns
 * `{ progress, done }`, where `done` settles with the result once every
 * email has been tried (it never rejects), or `{ error: "busy", progress }`
 * if this sale is already being sent, or `{ error: "no_recipients" }`.
 */
export const startSaleAnnouncement = async (sale) => {
  const saleId = String(sale._id);
  const busy = inProgress.get(saleId);
  if (busy) return { error: "busy", progress: busy };

  // Claimed before anything is awaited, so a double click can't start two sends.
  const progress = { total: 0, sent: 0, failed: 0, test: SALE_EMAIL_TEST_MODE, started_at: new Date() };
  inProgress.set(saleId, progress);

  let emails;
  try {
    emails = await recipients();
  } catch (error) {
    inProgress.delete(saleId);
    throw error;
  }
  if (emails.length === 0) {
    inProgress.delete(saleId);
    return { error: "no_recipients" };
  }

  progress.total = emails.length;
  const done = run(saleId, emails, progress).finally(() => inProgress.delete(saleId));
  return { progress, done };
};
