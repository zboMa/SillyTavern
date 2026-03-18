import WorldInfoPanel from '../../features/worldinfo/WorldInfoPanel.vue';
import type { PluginModule } from '../types';

export function worldInfoPlugin(): PluginModule {
  return {
    id: 'worldinfo',
    displayName: 'World Info',
    version: '0.0.0',
    setup(ctx) {
      ctx.log('worldinfo', 'plugin setup');
    },
    ui: [
      {
        id: 'worldinfo.main',
        title: 'World Info',
        slot: 'main',
        component: WorldInfoPanel,
        order: 10,
      },
    ],
  };
}

