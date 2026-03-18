import BackupsPanel from '../../features/backups/BackupsPanel.vue';
import type { PluginModule } from '../types';

export function backupsPlugin(): PluginModule {
  return {
    id: 'backups',
    displayName: 'Backups',
    version: '0.0.0',
    ui: [
      {
        id: 'backups.right',
        title: 'Backup',
        slot: 'right',
        component: BackupsPanel,
        order: 90,
      },
    ],
  };
}

