import { requireAuth } from "./_auth.js";

const LATITUDE = 46.5197;
const LONGITUDE = 6.6323;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, max-age=0, s-maxage=900, stale-while-revalidate=1800");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!requireAuth(req, res)) return;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(LATITUDE));
  url.searchParams.set("longitude", String(LONGITUDE));
  url.searchParams.set("models", "meteoswiss_icon_seamless");
  url.searchParams.set("timezone", "Europe/Zurich");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day");
  url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max");

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`MeteoSwiss weather returned ${response.status}`);
    const payload = await response.json();
    res.status(200).json({
      source: "MeteoSwiss ICON CH via Open-Meteo",
      refreshedAt: new Date().toISOString(),
      location: "Lausanne",
      current: payload.current,
      currentUnits: payload.current_units,
      hourly: payload.hourly,
      hourlyUnits: payload.hourly_units,
      daily: payload.daily,
      dailyUnits: payload.daily_units,
    });
  } catch (error) {
    console.error("MeteoSwiss weather failed:", error.message);
    res.status(502).json({ error: "Weather is temporarily unavailable." });
  }
}

