/**
 * Local dev environments without `pnpm install` may not have `node_modules` available,
 * causing the TS language service to fail module resolution.
 *
 * This file is a temporary shim to keep the workspace type-checkable during migration.
 * Remove once dependencies are installed in CI/dev.
 */
declare module 'vue' {
  export const createApp: any;
  export const onMounted: any;
  export const onBeforeUnmount: any;
  export function computed(...args: any[]): any;
  export function ref(...args: any[]): any;
  export type Component = any;
}

declare module '@vitejs/plugin-vue' {
  const plugin: any;
  export default plugin;
}

