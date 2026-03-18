import QuickReplyPanel from '../../features/quickreply/QuickReplyPanel.vue';
import type { PluginModule } from '../types';

export function quickReplyPlugin(): PluginModule {
  return {
    id: 'quickreply',
    displayName: 'Quick Reply',
    version: '0.0.0',
    ui: [
      {
        id: 'quickreply.right',
        title: 'Quick Reply',
        slot: 'right',
        component: QuickReplyPanel,
        order: 70,
      },
    ],
  };
}

