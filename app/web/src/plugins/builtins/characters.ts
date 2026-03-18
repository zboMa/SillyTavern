import CharacterPanel from '../../features/characters/CharacterPanel.vue';
import type { PluginModule } from '../types';

export function charactersPlugin(): PluginModule {
  return {
    id: 'characters',
    displayName: 'Characters',
    version: '0.0.0',
    setup(ctx) {
      ctx.log('characters', 'plugin setup');
    },
    ui: [
      {
        id: 'characters.main',
        title: 'Characters',
        slot: 'main',
        component: CharacterPanel,
        order: 30,
      },
    ],
  };
}

