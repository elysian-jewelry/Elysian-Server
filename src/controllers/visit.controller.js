import crypto from "crypto";
import axios from "axios";
import Visit from "../models/visit.js";

const getToday = () => new Date().toISOString().slice(0, 10);

const hashFingerprint = (ip, ua) =>
  crypto.createHash("sha256").update(`${ip}||${ua}`).digest("hex");

const getClientIp = (req) => {
  const gaeIp = req.headers["x-appengine-user-ip"];
  if (gaeIp) return String(gaeIp).trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const parseDevice = (ua) => {
  if (!ua) return { device: "Unknown", browser: "Unknown" };

  let device = "Desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) device = "Tablet";
  else if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile/i.test(ua)) device = "Mobile";

  let browser = "Unknown";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox\//i.test(ua)) browser = "Firefox";

  return { device, browser };
};

// ISO 3166-1 alpha-2 country code → country name
const COUNTRY_NAMES = {
  EG: "Egypt", SA: "Saudi Arabia", AE: "United Arab Emirates", KW: "Kuwait",
  QA: "Qatar", BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon",
  SY: "Syria", IQ: "Iraq", YE: "Yemen", PS: "Palestine", IL: "Israel",
  TR: "Turkey", IR: "Iran", MA: "Morocco", DZ: "Algeria", TN: "Tunisia",
  LY: "Libya", SD: "Sudan", US: "United States", GB: "United Kingdom",
  CA: "Canada", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  NL: "Netherlands", BE: "Belgium", PT: "Portugal", CH: "Switzerland",
  AT: "Austria", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  IE: "Ireland", PL: "Poland", CZ: "Czech Republic", GR: "Greece",
  RU: "Russia", UA: "Ukraine", IN: "India", PK: "Pakistan", BD: "Bangladesh",
  CN: "China", JP: "Japan", KR: "South Korea", TH: "Thailand", VN: "Vietnam",
  ID: "Indonesia", MY: "Malaysia", PH: "Philippines", SG: "Singapore",
  AU: "Australia", NZ: "New Zealand", BR: "Brazil", AR: "Argentina",
  MX: "Mexico", CL: "Chile", CO: "Colombia", PE: "Peru", ZA: "South Africa",
  NG: "Nigeria", KE: "Kenya", ET: "Ethiopia", GH: "Ghana",
};

const codeToCountry = (code) => {
  if (!code) return "Unknown";
  const c = String(code).toUpperCase().trim();
  return COUNTRY_NAMES[c] || c;
};

const getGeoFromHeaders = (req) => {
  const country = req.headers["x-appengine-country"];
  const city = req.headers["x-appengine-city"];
  const result = {};
  if (country && country !== "ZZ") {
    result.country = codeToCountry(country);
  }
  if (city) {
    const c = String(city).trim();
    if (c && c !== "?") {
      result.city = c
        .split(/[\s-]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }
  return result;
};

const lookupGeoByApi = async (ip) => {
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { city: "Unknown", country: "Unknown" };
  }
  try {
    const { data } = await axios.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: 4000 });
    if (data && !data.error) {
      return {
        city: data.city || "Unknown",
        country: data.country_name || codeToCountry(data.country) || "Unknown",
      };
    }
  } catch {
    // first source failed — try second
  }
  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country`, { timeout: 4000 });
    if (data?.status === "success") {
      return { city: data.city || "Unknown", country: data.country || "Unknown" };
    }
  } catch {
    // both sources failed
  }
  return { city: "Unknown", country: "Unknown" };
};

export const trackVisit = async (req, res) => {
  try {
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "";
    const fingerprint = hashFingerprint(ip, ua);
    const date = getToday();

    const existing = await Visit.findOne({ fingerprint, date });
    if (existing) return res.status(200).json({ tracked: true });

    const { device, browser } = parseDevice(ua);

    // 1) Prefer Google App Engine native geo headers (instant, free, accurate)
    const headerGeo = getGeoFromHeaders(req);
    let city = headerGeo.city || "Unknown";
    let country = headerGeo.country || "Unknown";

    // 2) Fallback: external IP lookup if GAE headers missing or unknown
    if (city === "Unknown" || country === "Unknown") {
      const apiGeo = await lookupGeoByApi(ip);
      if (city === "Unknown") city = apiGeo.city;
      if (country === "Unknown") country = apiGeo.country;
    }

    await Visit.create({ fingerprint, date, city, country, device, browser });

    res.status(200).json({ tracked: true });
  } catch (err) {
    if (err.code === 11000) return res.status(200).json({ tracked: true });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * POST /admin/maintenance/backfill-visit-geo
 * Re-runs geo lookup for any visits stored as "Unknown" — useful for
 * old rows captured before geo detection was wired up correctly.
 */
export const backfillVisitGeo = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? "500", 10), 1000);
    const unknownVisits = await Visit.find({
      $or: [{ city: "Unknown" }, { country: "Unknown" }],
    }).limit(limit);

    let updated = 0;
    for (const v of unknownVisits) {
      // We don't have the original IP stored (only the fingerprint hash), so
      // we can't backfill old rows. This endpoint stays here for future use
      // if you add an `ip` field to the schema.
      // For now, just count unknowns.
      void v;
    }
    return res.status(200).json({
      message: "Backfill skipped — IPs are not stored (privacy-preserving). New visits will be geo-tagged correctly.",
      unknown_total: unknownVisits.length,
      updated,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const getVisitStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = getToday();
    const dateFrom = from || today;
    const dateTo = to || today;

    const matchStage = { date: { $gte: dateFrom, $lte: dateTo } };

    const [daily, byCountry, byCity, byDevice, byBrowser, todayCountResult] = await Promise.all([
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$date", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$country", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: { city: "$city", country: "$country" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $project: { _id: 0, city: "$_id.city", country: "$_id.country", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$device", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.aggregate([
        { $match: matchStage },
        { $group: { _id: "$browser", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ]),
      Visit.countDocuments({ date: today }),
    ]);

    const totalRange = daily.reduce((sum, d) => sum + d.count, 0);

    res.status(200).json({
      today: todayCountResult,
      total: totalRange,
      daily,
      byCountry,
      byCity,
      byDevice,
      byBrowser,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
