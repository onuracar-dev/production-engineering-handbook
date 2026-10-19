export interface ReactiveEffect {
  (): void;
  deps: Set<Set<ReactiveEffect>>;
  active: boolean;
  running: boolean;
}

type EffectCleanup = () => void;
type EffectFn = () => void | EffectCleanup;

const effectStack: ReactiveEffect[] = [];
let activeEffect: ReactiveEffect | null = null;

// Signals call track() with their subscriber set when read inside an effect.
export function track(subscribers: Set<ReactiveEffect>): void {
  if (!activeEffect) return;
  subscribers.add(activeEffect);
  activeEffect.deps.add(subscribers);
}

export function effect(fn: EffectFn): EffectCleanup {
  let userCleanup: EffectCleanup | undefined;

  const runner: ReactiveEffect = () => {
    // 1. Guard against recursive self-invocation cycles
    if (!runner.active || runner.running) return;
    runner.running = true;

    try {
      if (userCleanup) {
        userCleanup();
        userCleanup = undefined;
      }
      // 2. Dynamic dependency pruning: clear stale links
      for (const dependency of runner.deps) {
        dependency.delete(runner);
      }
      runner.deps.clear();

      effectStack.push(runner);
      activeEffect = runner;
      try {
        const result = fn();
        if (typeof result === 'function') userCleanup = result as EffectCleanup;
      } finally {
        effectStack.pop();
        activeEffect = effectStack[effectStack.length - 1] ?? null;
      }
    } finally {
      runner.running = false;
    }
  };

  runner.deps = new Set();
  runner.active = true;
  runner.running = false;
  runner();

  // 3. Disposal unlinks the runner from every subscriber set and runs the last cleanup
  return () => {
    if (!runner.active) return;
    runner.active = false;
    for (const dependency of runner.deps) {
      dependency.delete(runner);
    }
    runner.deps.clear();
    if (userCleanup) {
      userCleanup();
      userCleanup = undefined;
    }
  };
}
