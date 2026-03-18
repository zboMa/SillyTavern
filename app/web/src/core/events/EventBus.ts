export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Minimal, framework-agnostic event bus.
 *
 * Notes:
 * - synchronous dispatch by design (matches much of current ST behavior)
 * - typed payloads via generics at call sites
 */
export class EventBus {
  private listeners = new Map<string, Set<EventHandler>>();

  on<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    // Type erased at runtime; kept at compile time for callsites.
    this.listeners.get(eventType)!.add(handler as EventHandler);
    return () => this.off(eventType, handler);
  }

  off<T = unknown>(eventType: string, handler: EventHandler<T>): void {
    this.listeners.get(eventType)?.delete(handler as EventHandler);
  }

  emit<T = unknown>(eventType: string, payload: T): void {
    this.listeners.get(eventType)?.forEach((handler) => handler(payload));
  }

  clear(): void {
    this.listeners.clear();
  }
}

