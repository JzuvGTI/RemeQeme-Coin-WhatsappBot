const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const DEFAULT_REASON = "Unspecified Reason.";

const formatJakartaDateTime = (value) => {
  if (!value) {
    return "Permanent";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const datePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);

  const timePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);

  return `${datePart} ${timePart} WIB`;
};

const normalizeReason = (value, fallback = DEFAULT_REASON) => {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
};

const isExpiredAt = (value, now = Date.now()) => {
  if (!value) {
    return false;
  }

  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
};

module.exports = {
  JAKARTA_TIME_ZONE,
  DEFAULT_REASON,
  formatJakartaDateTime,
  normalizeReason,
  isExpiredAt
};
