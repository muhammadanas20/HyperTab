/**
 * Decision policy — what the webhead feels like doing next.
 *
 * A mood system (chill / playful / sleepy / alert) shifts weighted action
 * tables so behaviour feels alive and *unpredictable* without ever
 * repeating the same trick twice in a row. The EggScheduler runs the
 * rare surprise events on long, jittered cooldowns.
 */
import { pick, pickWeighted, rand } from '../utils/helpers';

export type Mood = 'chill' | 'playful' | 'sleepy' | 'alert';

export type BehaviorKind =
  | 'walk' | 'run' | 'hop' | 'swing' | 'hang'
  | 'sitGround' | 'perch' | 'crouch' | 'crawlWall'
  | 'peek' | 'hide' | 'sleep' | 'hammock'
  | 'watch' | 'wave' | 'idle';

/** Weights per mood. Higher = more likely. */
const TABLES: Record<Mood, ReadonlyArray<readonly [BehaviorKind, number]>> = {
  chill: [
    ['walk', 26], ['idle', 12], ['sitGround', 12], ['hang', 12],
    ['crouch', 8], ['watch', 8], ['swing', 10], ['peek', 6],
    ['hammock', 6], ['crawlWall', 8], ['wave', 4], ['perch', 6],
    ['hide', 3], ['hop', 6],
  ],
  playful: [
    ['swing', 26], ['run', 18], ['hop', 16], ['crawlWall', 10],
    ['hang', 8], ['peek', 8], ['hide', 7], ['walk', 8],
    ['perch', 6], ['wave', 5], ['crouch', 4],
  ],
  sleepy: [
    ['idle', 18], ['sleep', 20], ['hammock', 18], ['sitGround', 14],
    ['walk', 12], ['hang', 10], ['crouch', 8], ['watch', 6],
  ],
  alert: [
    ['crouch', 18], ['peek', 14], ['run', 16], ['swing', 16],
    ['crawlWall', 12], ['hide', 10], ['perch', 8], ['walk', 8], ['hop', 8],
  ],
};

const MOOD_NEXT: Record<Mood, ReadonlyArray<readonly [Mood, number]>> = {
  chill: [['playful', 3], ['chill', 4], ['sleepy', 2], ['alert', 1]],
  playful: [['chill', 3], ['playful', 2], ['alert', 2], ['sleepy', 1]],
  sleepy: [['sleepy', 3], ['chill', 2], ['playful', 1]],
  alert: [['chill', 3], ['playful', 3], ['alert', 2]],
};

export class Brain {
  mood: Mood = 'chill';
  private moodTimer = 0;
  private moodDuration = rand(35, 70);
  private recent: BehaviorKind[] = [];

  /** Call every frame; rolls a mood change when the timer expires. */
  tick(dt: number): void {
    this.moodTimer += dt;
    if (this.moodTimer >= this.moodDuration) {
      this.moodTimer = 0;
      this.moodDuration = rand(35, 80);
      this.mood = pickWeighted(MOOD_NEXT[this.mood]);
    }
  }

  /** Choose the next behaviour, avoiding the last few actions. */
  pick(where: 'ground' | 'air' | 'ceiling'): BehaviorKind {
    let table = TABLES[this.mood].filter(([k]) => !this.recent.includes(k));
    if (!table.length) table = TABLES[this.mood].slice();
    // context pruning
    if (where === 'air') table = table.filter(([k]) => k !== 'sleep' && k !== 'hammock');
    let kind = pickWeighted(table);
    // sleeps & hides are long — don't chain them into themselves
    if ((kind === 'sleep' || kind === 'hide') && this.recent.at(-1) === kind) {
      kind = 'walk';
    }
    this.recent.push(kind);
    if (this.recent.length > 4) this.recent.shift();
    return kind;
  }
}

/* ------------------------------------------------------------------ */
/* Speech bubble lines — original quips only                           */
/* ------------------------------------------------------------------ */

export const QUIPS: readonly string[] = [
  'Thwip!',
  'Just hangin’ around.',
  'Nice tab. Very tidy.',
  'I sense… unread emails.',
  'Anyone order a hero?',
  'This ceiling is prime real estate.',
  'Five more minutes…',
  'Did someone say bugs?',
  'Nah, I’d swing by.',
  'Peak hiding spot. Don’t tell anyone.',
];

export function randomQuip(): string {
  return pick(QUIPS);
}
