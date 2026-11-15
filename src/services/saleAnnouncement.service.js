// services/saleAnnouncement.service.js
//
// "Email customers" on a running sale: sends the "don't miss the sale" email
// (mailer.middleware.js) to customers who haven't received it yet.
//
// At most SALE_EMAIL_DAILY_LIMIT sale emails go out in any 24 hours, across
// every press of the button (config/saleEmail.js). Each customer's
// `sale_email_log` records the sales they've been emailed about, so a press
// sends to the next customers waiting, never to someone a second time, and
// the rest can be emailed with another press once the limit allows.
//
// A send takes minutes, so it runs in the background after the admin's
// request has been answered, one email at a time. Before each email it looks
// at the sale again: it stops if the sale has ended or been deleted, and an
// edited title, percentage or end date is used from then on.
//
// The send in progress is kept in memory: the app runs as a single instance
// (app.yaml), so that is enough to stop two sends at once. When a send
// finishes, the sale keeps a record of it, shown on the admin page.

import mongoose from "mongoose";
import Sale from "../models/sale.js";
import User from "../models/user.js";
import { getActiveSale } from "./sale.service.js";
import { sendSaleAnnouncementEmail } from "../middlewares/mailer.middleware.js";
import {
  SALE_EMAIL_DAILY_LIMIT,
  SALE_EMAIL_GAP_MS,
  SALE_EMAIL_MAX_FAILURES_IN_A_ROW,
} from "../config/saleEmail.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends in progress, by sale id: { total, sent, failed, started_at }. */
const inProgress = new Map();

/**
 * From every customer's sale_email_log: how many customers each sale has
 * reached (`perSale`), the sale emails sent in the last 24 hours, how many
 * more may go out now, and when more will be allowed if none may now.
 */
export const saleEmailStats = async (now = new Date()) => {
  const since = now.getTime() - DAY_MS;
  const users = await User.find({ "sale_email_log.0": { $exists: true } }, { sale_email_log: 1 }).lean();

  const perSale = new Map();
  const recent = [];
  for (const user of users) {
    for (const entry of user.sale_email_log || []) {
      const id = String(entry.sale_id);
      perSale.set(id, (perSale.get(id) || 0) + 1);
      const at = new Date(entry.sent_at).getTime();
      if (at > since) recent.push(at);
    }
  }
  recent.sort((a, b) => a - b);

  const sentLast24h = recent.length;
  const availableNow = Math.max(0, SALE_EMAIL_DAILY_LIMIT - sentLast24h);
  // Full: one more may go once enough of the oldest are 24 hours old.
  const moreAt =
    availableNow > 0 ? null : new Date(recent[sentLast24h - SALE_EMAIL_DAILY_LIMIT] + DAY_MS);
  return { perSale, sentLast24h, availableNow, moreAt };
};

/** Customers who haven't received this sale's email, each address once, oldest accounts first. */
const waitingCustomers = async (saleId) => {
  const users = await User.find(
    { "sale_email_log.sale_id": { $ne: new mongoose.Types.ObjectId(saleId) } },
    { email: 1 }
  )
    .sort({ _id: 1 })
    .lean();
  const seen = new Set();
  const waiting = [];
  for (const user of users) {
    const email = String(user.email ?? "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    waiting.push({ id: user._id, email });
  }
  return waiting;
};

/** For the admin page: the send in progress, else the last send, else null. */
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
  };
};

const run = async (saleId, recipients, progress) => {
  let stopped = null;
  let failuresInARow = 0;
  try {
    for (const [i, { id, email }] of recipients.entries()) {
      if (i > 0) await wait(SALE_EMAIL_GAP_MS);
      const sale = await getActiveSale();
      if (!sale || String(sale._id) !== saleId) {
        stopped = "sale_ended";
        break;
      }
      try {
        await sendSaleAnnouncementEmail(email, sale);
      } catch (error) {
        progress.failed++;
        failuresInARow++;
        console.error(`Sale email to ${email} failed:`, error?.code || error?.message);
        if (failuresInARow >= SALE_EMAIL_MAX_FAILURES_IN_A_ROW) {
          stopped = "too_many_failures";
          break;
        }
        continue; // not recorded, so a later send tries this customer again
      }
      progress.sent++;
      failuresInARow = 0;
      try {
        await User.updateOne(
          { _id: id },
          { $push: { sale_email_log: { sale_id: saleId, sent_at: new Date() } } },
          { timestamps: false }
        );
      } catch (error) {
        console.error(`Couldn't record the sale email to ${email}:`, error);
      }
    }
  } catch (error) {
    stopped = "error";
    console.error("Sale email send stopped:", error);
  }

  console.log(
    `Sale email for ${saleId}: ${progress.sent} sent, ${progress.failed} failed of ` +
      `${progress.total}${stopped ? `, stopped (${stopped})` : ""}`
  );

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
 * Starts emailing `sale` (a running sale) to as many waiting customers as
 * the daily limit allows. Returns `{ progress, done, leftAfter }`, where
 * `done` settles once every email has been tried (it never rejects) and
 * `leftAfter` is how many customers will still be waiting; or
 * `{ error: "busy", progress }` while a send is running,
 * `{ error: "daily_limit", moreAt }` when the limit is used up, or
 * `{ error: "everyone_emailed" }`.
 */
export const startSaleAnnouncement = async (sale) => {
  const saleId = String(sale._id);
  const busy = [...inProgress.values()][0];
  if (busy) return { error: "busy", progress: busy };

  // Claimed before anything is awaited, so a double click can't start two sends.
  const progress = { total: 0, sent: 0, failed: 0, started_at: new Date() };
  inProgress.set(saleId, progress);

  let recipients;
  let leftAfter;
  try {
    const stats = await saleEmailStats();
    if (stats.availableNow === 0) {
      inProgress.delete(saleId);
      return { error: "daily_limit", moreAt: stats.moreAt };
    }
    const waiting = await waitingCustomers(saleId);
    if (waiting.length === 0) {
      inProgress.delete(saleId);
      return { error: "everyone_emailed" };
    }
    recipients = waiting.slice(0, stats.availableNow);
    leftAfter = waiting.length - recipients.length;
  } catch (error) {
    inProgress.delete(saleId);
    throw error;
  }

  progress.total = recipients.length;
  const done = run(saleId, recipients, progress).finally(() => inProgress.delete(saleId));
  return { progress, done, leftAfter };
};
