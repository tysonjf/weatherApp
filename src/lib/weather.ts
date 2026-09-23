/**
 * "Pizza weather": optional local conditions from Open-Meteo (free, no API key).
 * Only called when the user taps the button — never in the background.
 */
export interface LocalWeather {
  fetchedAt: number
  tempC: number
  humidity: number
  code: number
  /** Next 48 h of hourly temperatures (°C) for spotting hot/cold spells during a room-temperature ferment. */
  hourly: { time: number; tempC: number }[]
}

const CACHE_KEY = 'pizza-weather:local-weather'

export function readCachedWeather(): LocalWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as LocalWeather) : null
  } catch {
    return null
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(err.message || 'Location denied.')), {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 30 * 60 * 1000,
    })
  })
}

export async function fetchLocalWeather(): Promise<LocalWeather> {
  const pos = await getPosition()
  const lat = pos.coords.latitude.toFixed(2)
  const lon = pos.coords.longitude.toFixed(2)
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code&hourly=temperature_2m&forecast_hours=48&timezone=auto'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather service error (${res.status}).`)
  const data = (await res.json()) as {
    current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number }
    hourly: { time: string[]; temperature_2m: number[] }
    utc_offset_seconds: number
  }
  const weather: LocalWeather = {
    fetchedAt: Date.now(),
    tempC: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    code: data.current.weather_code,
    hourly: data.hourly.time.map((t, i) => ({
      // Open-Meteo returns local wall-clock times without offset when timezone=auto.
      time: Date.parse(`${t}:00Z`) - data.utc_offset_seconds * 1000,
      tempC: data.hourly.temperature_2m[i],
    })),
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(weather))
  } catch {
    /* storage full or blocked — fine */
  }
  return weather
}

/** WMO weather code → emoji + words. */
export function describeWeather(code: number): { emoji: string; text: string } {
  if (code === 0) return { emoji: '☀️', text: 'Clear' }
  if (code <= 2) return { emoji: '🌤️', text: 'Partly cloudy' }
  if (code === 3) return { emoji: '☁️', text: 'Overcast' }
  if (code <= 48) return { emoji: '🌫️', text: 'Fog' }
  if (code <= 57) return { emoji: '🌦️', text: 'Drizzle' }
  if (code <= 67) return { emoji: '🌧️', text: 'Rain' }
  if (code <= 77) return { emoji: '🌨️', text: 'Snow' }
  if (code <= 82) return { emoji: '🌧️', text: 'Showers' }
  if (code <= 86) return { emoji: '🌨️', text: 'Snow showers' }
  return { emoji: '⛈️', text: 'Thunderstorm' }
}

/** Dough-centric advice for the current conditions. */
export function doughOutlook(w: LocalWeather): string {
  const t = w.tempC
  if (t >= 30) return 'Heatwave dough weather: use ice-cold water, trim the yeast and lean on the fridge.'
  if (t >= 25) return 'Warm and lively: fermentation will race. Colder water and a little less yeast will keep it in check.'
  if (t >= 16) return 'Classic pizza weather. Room-temperature ferments should behave just as the forecast says.'
  if (t >= 8) return 'Cool out there — kitchens run colder too. Check your room temperature and use warmer water.'
  return 'Cold snap: a chilly kitchen slows yeast a lot. Warm water, a warm spot (oven with the light on) or more time.'
}
