/**
 * Clock, date and greeting widget (top-right).
 * Ticks once per second, formats per settings, and picks a
 * time-appropriate greeting.
 */
import type { Settings } from '../types';
import { $ } from '../utils/helpers';

export class ClockWidget {
  private timer = 0;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  updateSettings(s: Settings): void {
    this.settings = s;
    this.tick();
  }

  private greeting(now: Date): string {
    const hr = now.getHours();
    const name = this.settings.userName.trim();
    const who = name ? `, ${name}` : '';
    if (hr < 4) return `Up late${who}?`;
    if (hr < 12) return `Good morning${who}`;
    if (hr < 17) return `Good afternoon${who}`;
    if (hr < 21) return `Good evening${who}`;
    return `Good night${who}`;
  }

  private tick(): void {
    const now = new Date();
    const clockEl = $('#clock');
    const dateEl = $('#date');
    const greetingEl = $('#greeting');

    let hours = now.getHours();
    let suffix = '';
    if (!this.settings.clock24) {
      suffix = hours >= 12 ? ' PM' : ' AM';
      hours = hours % 12 || 12;
    }
    const hh = String(hours).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    clockEl.textContent = this.settings.showSeconds ? `${hh}:${mm}:${ss}${suffix}` : `${hh}:${mm}${suffix}`;

    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    dateEl.toggleAttribute('hidden', !this.settings.showDate);

    greetingEl.textContent = this.greeting(now);
    greetingEl.toggleAttribute('hidden', !this.settings.showGreeting);
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }
}
