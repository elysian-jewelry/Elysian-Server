// Shared geolocation helpers. Used by visit tracking and login user-location capture.
import axios from "axios";

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

export const codeToCountry = (code) => {
  if (!code) return "Unknown";
  const c = String(code).toUpperCase().trim();
  return COUNTRY_NAMES[c] || c;
};

export const getClientIp = (req) => {
  const gaeIp = req.headers["x-appengine-user-ip"];
  if (gaeIp) return String(gaeIp).trim();
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
};

const titleCase = (s) =>
  String(s).trim()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

export const getGeoFromHeaders = (req) => {
  const country = req.headers["x-appengine-country"];
  const city = req.headers["x-appengine-city"];
  const region = req.headers["x-appengine-region"]; // e.g. "c" or country subdivision code
  const result = {};
  if (country && country !== "ZZ") {
    result.country = codeToCountry(country);
  }
  if (city) {
    const c = String(city).trim();
    if (c && c !== "?") {
      result.city = titleCase(c);
    }
  }
  if (region) {
    const r = String(region).trim();
    if (r && r !== "?") {
      result.region = r;
    }
  }
  return result;
};

const EG_GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia",
  "Gharbia", "Monufia", "Beheira", "Kafr El Sheikh", "Damietta",
  "Port Said", "Ismailia", "Suez", "North Sinai", "South Sinai",
  "Beni Suef", "Faiyum", "Minya", "Asyut", "Sohag", "Qena", "Luxor",
  "Aswan", "Red Sea", "New Valley", "Matrouh",
];

/** Infer the governorate from a city name when country is Egypt. */
export const inferEgyptGovernorate = (city) => {
  if (!city) return "Unknown";
  const norm = city.toLowerCase().trim();
  // Direct match against any governorate name
  const hit = EG_GOVERNORATES.find(
    (g) => g.toLowerCase() === norm || norm.includes(g.toLowerCase())
  );
  if (hit) return hit;
  // Common city → governorate mappings
  const map = {
    "nasr city": "Cairo", "heliopolis": "Cairo", "maadi": "Cairo",
    "new cairo": "Cairo", "shubra": "Cairo", "zamalek": "Cairo",
    "6th of october": "Giza", "sheikh zayed": "Giza", "haram": "Giza",
    "dokki": "Giza", "mohandessin": "Giza", "agouza": "Giza",
    "mansoura": "Dakahlia", "tanta": "Gharbia", "mahalla": "Gharbia",
    "zagazig": "Sharqia", "10th of ramadan": "Sharqia",
    "banha": "Qalyubia", "shubra el kheima": "Qalyubia",
    "damanhour": "Beheira", "marsa matrouh": "Matrouh",
    "hurghada": "Red Sea", "sharm el sheikh": "South Sinai",
    "el arish": "North Sinai",
  };
  return map[norm] || "Unknown";
};

export const lookupGeoByApi = async (ip) => {
  if (!ip || ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { city: "Unknown", country: "Unknown", region: "" };
  }
  try {
    const { data } = await axios.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: 4000 });
    if (data && !data.error) {
      return {
        city: data.city || "Unknown",
        country: data.country_name || codeToCountry(data.country) || "Unknown",
        region: data.region || "",
      };
    }
  } catch {
    // first source failed — try second
  }
  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,country,regionName`, { timeout: 4000 });
    if (data?.status === "success") {
      return {
        city: data.city || "Unknown",
        country: data.country || "Unknown",
        region: data.regionName || "",
      };
    }
  } catch {
    // both sources failed
  }
  return { city: "Unknown", country: "Unknown", region: "" };
};

/**
 * Resolve { country, governorate, city } from request headers and IP fallback.
 * For Egyptian visitors, governorate is inferred from city when not provided
 * by upstream geo headers.
 */
export const resolveRequestLocation = async (req) => {
  const headerGeo = getGeoFromHeaders(req);
  let country = headerGeo.country || "Unknown";
  let city = headerGeo.city || "Unknown";
  let region = headerGeo.region || "";

  if (country === "Unknown" || city === "Unknown") {
    const ip = getClientIp(req);
    const api = await lookupGeoByApi(ip);
    if (country === "Unknown") country = api.country;
    if (city === "Unknown") city = api.city;
    if (!region) region = api.region;
  }

  let governorate = region ? titleCase(region) : "Unknown";
  if (country === "Egypt" && (governorate === "Unknown" || governorate.length <= 2)) {
    governorate = inferEgyptGovernorate(city);
  }

  return { country, governorate, city };
};
