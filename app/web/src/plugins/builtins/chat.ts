import ChatPanel from '../../features/chat/ChatPanel.vue';
import type { PluginModule } from '../types';

export function chatPlugin(): PluginModule {
  return {
    id: 'chat',
    displayName: 'Chat',
    version: '0.0.0',
    setup(ctx) {
      ctx.log('chat', 'plugin setup');
    },
    ui: [
      {
        id: 'chat.main',
        title: 'Chat',
        slot: 'main',
        component: ChatPanel,
        order: 20,
      },
    ],
  };
}

