import ConnectionPanel from '../../features/connections/ConnectionPanel.vue';
import type { PluginModule } from '../types';

export function connectionsPlugin(): PluginModule {
  return {
    id: 'connections',
    displayName: 'Connection Manager',
    version: '0.0.0',
    ui: [
      {
        id: 'connections.right',
        title: 'Connection',
        slot: 'right',
        component: ConnectionPanel,
        order: 100,
      },
    ],
  };
}

