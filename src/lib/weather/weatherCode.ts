// WMO weather interpretation codes, as used by Open-Meteo:
// https://open-meteo.com/en/docs
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "快晴",
  1: "ほぼ晴れ",
  2: "薄曇り",
  3: "曇り",
  45: "霧",
  48: "霧氷",
  51: "小雨（霧雨）",
  53: "雨（霧雨）",
  55: "強い雨（霧雨）",
  56: "着氷性の霧雨",
  57: "強い着氷性の霧雨",
  61: "小雨",
  63: "雨",
  65: "強い雨",
  66: "着氷性の雨",
  67: "強い着氷性の雨",
  71: "小雪",
  73: "雪",
  75: "大雪",
  77: "霧雪",
  80: "にわか雨",
  81: "強いにわか雨",
  82: "激しいにわか雨",
  85: "にわか雪",
  86: "強いにわか雪",
  95: "雷雨",
  96: "雷雨（ひょうを伴う）",
  99: "激しい雷雨（ひょうを伴う）",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "不明";
}

// True for codes that themselves describe precipitation (drizzle and beyond).
// Codes below this (clear/cloudy/fog) can still coexist with a high
// precipitation probability — a "mostly clear" hour can still include an
// isolated shower risk, which is exactly what the pop-based risk color warns
// about even though the dominant sky condition looks clear.
export function isPrecipitationCode(code: number): boolean {
  return code >= 51;
}

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 86) return "🌧️";
  return "⛈️";
}
