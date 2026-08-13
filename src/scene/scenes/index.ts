/**
 * Scene registry — lazily creates and caches scene instances so
 * switching wallpapers is instant.
 */
import type { Scene, SceneId } from '../../types';
import { ParticlesScene } from './abstract';
import { CityScene } from './city';
import { ForestScene, MountainsScene } from './nature';
import { AuroraScene, SpaceScene } from './sky';
import { StreetScene } from './street';

const cache = new Map<SceneId, Scene>();

const factories: Record<SceneId, () => Scene> = {
  cityRain: () => new CityScene(),
  neonStreet: () => new StreetScene(),
  mountains: () => new MountainsScene(),
  forest: () => new ForestScene(),
  space: () => new SpaceScene(),
  aurora: () => new AuroraScene(),
  particles: () => new ParticlesScene(),
};

export function getScene(id: SceneId): Scene {
  let scene = cache.get(id);
  if (!scene) {
    scene = factories[id]();
    cache.set(id, scene);
  }
  return scene;
}

export const SCENE_LABELS: Record<SceneId, string> = {
  cityRain: 'Rainy Neon City',
  neonStreet: 'Neon Alley',
  mountains: 'Midnight Mountains',
  forest: 'Misty Forest',
  space: 'Deep Space',
  aurora: 'Aurora Borealis',
  particles: 'Particle Field',
};

/** Draw a tiny live preview chip for the settings panel. */
export function scenePreviewAccent(id: SceneId): string {
  switch (id) {
    case 'cityRain': return '#7aa2f7';
    case 'neonStreet': return '#ff2bd6';
    case 'mountains': return '#88c0d0';
    case 'forest': return '#7cff9e';
    case 'space': return '#b4befe';
    case 'aurora': return '#52ffa8';
    case 'particles': return '#89b4fa';
  }
}
