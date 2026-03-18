import RegexPanel from '../../features/regex/RegexPanel.vue';
import type { PluginModule } from '../types';

export function regexPlugin(): PluginModule {
  return {
    id: 'regex',
    displayName: 'Regex',
    version: '0.0.0',
    ui: [
      {
        id: 'regex.right',
        title: 'Regex',
        slot: 'right',
        component: RegexPanel,
        order: 80,
      },
    ],
  };
}

