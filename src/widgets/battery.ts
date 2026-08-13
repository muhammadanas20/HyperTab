/**
 * Battery widget — uses the Battery Status API where available
 * (Chrome on laptops). Hides silently on desktops / unsupported setups.
 */
import type { Settings } from '../types';
import { $ } from '../utils/helpers';

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  addEventListener(type: 'levelchange' | 'chargingchange', listener: () => void): void;
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
  }
}

export class BatteryWidget {
  private settings: Settings;
  private battery: BatteryManager | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    void this.init();
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    this.render();
  }

  private async init(): Promise<void> {
    if (!navigator.getBattery) return;
    try {
      this.battery = await navigator.getBattery();
      this.battery.addEventListener('levelchange', () => this.render());
      this.battery.addEventListener('chargingchange', () => this.render());
      this.render();
    } catch {
      /* unsupported → stays hidden */
    }
  }

  private render(): void {
    const root = $('#battery');
    if (!this.battery || !this.settings.showBattery) {
      root.setAttribute('hidden', '');
      return;
    }
    root.removeAttribute('hidden');
    const pct = Math.round(this.battery.level * 100);
    const charging = this.battery.charging;
    root.title = charging ? `Charging — ${pct}%` : `Battery — ${pct}%`;
    $('#battery-fill').style.width = `${pct}%`;
    $('#battery-fill').style.background =
      pct <= 20 && !charging ? '#f38ba8' : pct <= 45 && !charging ? '#fab387' : 'currentColor';
    $('#battery-label').textContent = `${pct}%`;
    $('#battery-bolt').style.display = charging ? 'block' : 'none';
  }
}
