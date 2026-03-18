# `src/plugins`

Vue3-native plugin system for the rewritten frontend.

Design goals:
- Feature modules are loaded and composed through plugins.
- Plugins contribute UI via named *slots* (topbar/main/right/etc.).
- Plugins can register capabilities (commands, settings schema, hooks) without hard-coding dependencies.
- Single responsibility: plugin manager orchestrates; plugins implement features.

