/**
 * Weather widget — Open-Meteo (free, no API key). Geocodes the configured
 * city once, caches results for 30 minutes, and degrades gracefully:
 * if offline or disabled the widget hides instead of showing an error.
 */
import type { Settings, WeatherData } from '../types';
import { WEATHER_CACHE_KEY } from '../settings/schema';
import { $ } from '../utils/helpers';

const CACHE_TTL = 30 * 60 * 1000;

/** WMO weather-code → (icon key, label) */
function describe(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: 'clear', label: 'Clear sky' };
  if (code <= 2) return { icon: 'partly', label: 'Partly cloudy' };
  if (code === 3) return { icon: 'cloudy', label: 'Overcast' };
  if (code <= 48) return { icon: 'fog', label: 'Foggy' };
  if (code <= 57) return { icon: 'drizzle', label: 'Drizzle' };
  if (code <= 67) return { icon: 'rain', label: 'Rain' };
  if (code <= 77) return { icon: 'snow', label: 'Snow' };
  if (code <= 82) return { icon: 'rain', label: 'Showers' };
  if (code <= 86) return { icon: 'snow', label: 'Snow showers' };
  return { icon: 'storm', label: 'Thunderstorm' };
}

/** Inline SVG icons — crisp at any DPI, no emoji, no external assets. */
const ICONS: Record<string, string> = {
  clear: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  partly: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="8" cy="9" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 15.5a3.5 3.5 0 0 1 .6-7M22 17a3.5 3.5 0 0 0-3.5-3.5h-.4A5 5 0 0 0 8.5 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  cloudy: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 18a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 16.5 8.6 4.5 4.5 0 0 1 17.5 18z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  fog: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 13a4 4 0 0 1 .8-7.9A5.5 5.5 0 0 1 15.5 4.6 4.5 4.5 0 0 1 18 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 17h16M7 20.5h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  drizzle: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 14a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 16.5 4.6 4.5 4.5 0 0 1 17.5 14z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 17v2M12 17.5v2.5M16 17v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  rain: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 13a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 16.5 3.6 4.5 4.5 0 0 1 17.5 13z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 16l-1 3M12 16.5l-1 3M16 16l-1 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  snow: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 13a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 16.5 3.6 4.5 4.5 0 0 1 17.5 13z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="17.4" r="1" fill="currentColor"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/><circle cx="16" cy="17.4" r="1" fill="currentColor"/></svg>',
  storm: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6.5 12a4 4 0 0 1-.7-7.94A5.5 5.5 0 0 1 16.5 2.6 4.5 4.5 0 0 1 17.5 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12.5 12.5 10 17h3l-1.5 4.5L15 16h-3z" fill="currentColor"/></svg>',
};

export class WeatherWidget {
  private settings: Settings;
  private timer = 0;

  constructor(settings: Settings) {
    this.settings = settings;
    void this.refresh();
    // re-check every 15 min (cache prevents network spam)
    this.timer = window.setInterval(() => void this.refresh(), 15 * 60 * 1000);
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    void this.refresh(true);
  }

  private hide(): void {
    $('#weather').setAttribute('hidden', '');
  }

  private show(data: WeatherData): void {
    const root = $('#weather');
    root.removeAttribute('hidden');
    const unit = this.settings.weatherUnit;
    const temp = unit === 'c' ? data.tempC : data.tempC * 9 / 5 + 32;
    const d = describe(data.code);
    root.title = `${d.label} in ${data.city}`;
    const icon = $('#weather-icon');
    icon.innerHTML = ICONS[d.icon] ?? ICONS.cloudy;
    $('#weather-temp').textContent = `${Math.round(temp)}°`;
    $('#weather-city').textContent = data.city;
    $('#weather-desc').textContent = d.label;
  }

  private async geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ latitude: number; longitude: number; name: string }> };
    const hit = json.results?.[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null;
  }

  private async fetchWeather(): Promise<WeatherData | null> {
    let place = { lat: 24.8607, lon: 67.0011, name: 'Karachi' };
    const wanted = this.settings.weatherCity.trim();
    if (wanted) {
      const found = await this.geocode(wanted);
      if (found) place = found;
      else return null;
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
    if (!json.current) return null;
    return {
      tempC: json.current.temperature_2m,
      code: json.current.weather_code,
      isDay: json.current.is_day === 1,
      city: place.name,
      fetchedAt: Date.now(),
    };
  }

  private async refresh(force = false): Promise<void> {
    if (!this.settings.weatherEnabled) {
      this.hide();
      return;
    }
    try {
      if (!force) {
        const stored = await chrome.storage.local.get(WEATHER_CACHE_KEY);
        const cached = stored[WEATHER_CACHE_KEY] as { city?: string; data?: WeatherData } | undefined;
        if (
          cached?.data &&
          cached.city === this.settings.weatherCity.trim() &&
          Date.now() - cached.data.fetchedAt < CACHE_TTL
        ) {
          this.show(cached.data);
          return;
        }
      }
      const data = await this.fetchWeather();
      if (!data) {
        // keep showing whatever was cached, otherwise hide quietly
        const stored = await chrome.storage.local.get(WEATHER_CACHE_KEY);
        const cached = (stored[WEATHER_CACHE_KEY] as { data?: WeatherData } | undefined)?.data;
        if (cached) this.show(cached);
        else this.hide();
        return;
      }
      await chrome.storage.local.set({ [WEATHER_CACHE_KEY]: { city: this.settings.weatherCity.trim(), data } });
      this.show(data);
    } catch {
      this.hide();
    }
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }
}
