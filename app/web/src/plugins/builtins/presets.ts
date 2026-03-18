import PresetsPanel from '../../features/presets/PresetsPanel.vue';
import type { PluginModule } from '../types';

export function presetsPlugin(): PluginModule {
  return {
    id: 'presets',
    displayName: 'Presets',
    version: '0.0.0',
    ui: [
      {
        id: 'presets.right',
        title: 'Presets',
        slot: 'right',
        component: PresetsPanel,
        order: 45,
      },
    ],
  };
}

