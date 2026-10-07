// Погода с Open-Meteo (без ключа) и «что надеть». Из Sources/Weather.swift и WeatherCard.swift.
import { create } from 'zustand'
import { kv } from './kv'
import { safu } from './bridge'

export type WeatherHour = { time: number; temp: number; feels: number; wind: number; precip: number; code: number }

export const CITIES = {
  arkhangelsk: { title: 'Архангельск', lat: 64.5393, lon: 40.517 },
  severodvinsk: { title: 'Северодвинск', lat: 64.5635, lon: 39.8302 }
}
export type City = keyof typeof CITIES

type W = { hours: WeatherHour[]; fetchedAt: number | null; city: string; loading: boolean }
const cached = kv.get<{ hours: WeatherHour[]; fetchedAt: number; city: string } | null>('weather.cache', null)
export const useWeather = create<W>(() => ({ hours: cached?.hours || [], fetchedAt: cached?.fetchedAt || null, city: cached?.city || '', loading: false }))

export const weather = {
  city: (): City => kv.get<City>('weather.city', 'arkhangelsk') as City,
  async refresh(force = false) {
    const s = useWeather.getState()
    const city = weather.city()
    if (!force && s.fetchedAt && s.city === city && Date.now() - s.fetchedAt < 3600_000) return
    if (s.loading) return
    useWeather.setState({ loading: true })
    try {
      const c = CITIES[city]
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
        '&hourly=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code' +
        '&wind_speed_unit=ms&timezone=auto&forecast_days=3&timeformat=unixtime'
      const r = await safu.net.fetch({ url, timeout: 15_000 })
      if (!r.ok) return
      const h = JSON.parse(r.text).hourly
      const hours: WeatherHour[] = (h.time as number[]).map((t, i) => ({
        time: t * 1000, temp: h.temperature_2m[i], feels: h.apparent_temperature[i] ?? h.temperature_2m[i],
        wind: h.wind_speed_10m[i] ?? 0, precip: h.precipitation[i] ?? 0, code: h.weather_code[i] ?? 0
      })).filter(x => x.temp != null)
      if (!hours.length) return
      const fetchedAt = Date.now()
      useWeather.setState({ hours, fetchedAt, city })
      kv.set('weather.cache', { hours, fetchedAt, city })
    } catch { /* нет связи */ } finally {
      useWeather.setState({ loading: false })
    }
  },
  hourAt(t: number, hours = useWeather.getState().hours): WeatherHour | null {
    let best: WeatherHour | null = null
    for (const h of hours) if (!best || Math.abs(h.time - t) < Math.abs(best.time - t)) best = h
    return best && Math.abs(best.time - t) <= 90 * 60_000 ? best : null
  }
}

export function weatherEmoji(code: number) {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌡️'
}

export const deg = (v: number) => { const r = Math.round(v); return r < 0 ? `−${-r}°` : `${r}°` }

export function sky(code: number) {
  if (code === 0) return 'Ясно'
  if (code <= 2) return 'Переменная облачность'
  if (code === 3) return 'Пасмурно'
  if (code === 45 || code === 48) return 'Туман'
  if (code >= 51 && code <= 57) return 'Морось'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Дождь'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Снег'
  if (code >= 95) return 'Гроза'
  return '—'
}

export function weatherLine(h: WeatherHour) {
  let s = `${weatherEmoji(h.code)} ${deg(h.temp)}`
  if (Math.abs(h.feels - h.temp) >= 3) s += ` · ощущается ${deg(h.feels)}`
  if (h.wind >= 5) s += ` · ветер ${Math.round(h.wind)} м/с`
  return s
}

export function advice(h: WeatherHour): string | null {
  const parts: string[] = []
  if (h.feels <= -25) parts.push('Лютый мороз: выходи на пару минут раньше, автобус может опоздать')
  else if (h.feels <= -15) parts.push('Морозно: шапка, шарф, перчатки')
  else if (h.feels <= -5) parts.push('Холодно, оденься потеплее')
  if ((h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86) parts.push(h.precip >= 1 ? 'Сильный снег — в дороге может быть медленно' : 'Идёт снег')
  else if ((h.code >= 51 && h.code <= 67) || (h.code >= 80 && h.code <= 82)) parts.push('Дождь — возьми зонт')
  else if (h.code >= 95) parts.push('Гроза')
  if (h.wind >= 12) parts.push('Сильный ветер')
  return parts.length ? parts.join('. ') : null
}

export function outfit(h: WeatherHour, soon: WeatherHour[]): { emoji: string; text: string }[] {
  const out: { emoji: string; text: string }[] = []
  const f = h.feels
  if (f < -25) {
    out.push({ emoji: '🥶', text: 'Пуховик, термобельё и тёплые штаны' }, { emoji: '🧤', text: 'Варежки, а не перчатки' }, { emoji: '🧣', text: 'Шапка и шарф — закрой лицо от мороза' })
  } else if (f < -15) {
    out.push({ emoji: '❄️', text: 'Зимняя куртка, шапка, шарф и тёплые перчатки' }, { emoji: '🥾', text: 'Зимняя обувь с толстой подошвой' })
  } else if (f < -5) out.push({ emoji: '❄️', text: 'Тёплая куртка, шапка и перчатки' })
  else if (f < 3) out.push({ emoji: '🧥', text: 'Демисезонная куртка и шапка' })
  else if (f < 10) out.push({ emoji: '🧥', text: 'Лёгкая куртка или ветровка' })
  else if (f < 17) out.push({ emoji: '👕', text: 'Худи или кофта' })
  else out.push({ emoji: '😎', text: 'Можно в футболке — тепло' })
  const win = [h, ...soon]
  const windMax = Math.max(...win.map(x => x.wind))
  if (windMax >= 14) out.push({ emoji: '🌪️', text: `Очень сильный ветер ${Math.round(windMax)} м/с — капюшон и ветрозащита, осторожно у щитов и деревьев` })
  else if (windMax >= 8) out.push({ emoji: '💨', text: `Ветер до ${Math.round(windMax)} м/с — с реки дует, пригодится капюшон` })
  const rain = win.some(x => (x.code >= 51 && x.code <= 67) || (x.code >= 80 && x.code <= 82) || x.code >= 95)
  const snow = win.some(x => (x.code >= 71 && x.code <= 77) || x.code === 85 || x.code === 86)
  if (rain) out.push({ emoji: '☂️', text: 'Будет дождь — зонт или дождевик' })
  if (snow) out.push({ emoji: '🌨️', text: 'Снег — непромокаемая обувь' })
  if ((rain || snow) && win.some(x => x.temp > -3 && x.temp < 2)) out.push({ emoji: '⚠️', text: 'Около нуля — скользко, осторожно на ступеньках' })
  return out
}
