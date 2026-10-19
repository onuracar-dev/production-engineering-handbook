# Case Study 03: Hardware Collision Avoidance & Yield Lock

> **Domain:** Concurrency & Race Conditions  
> **Source Project:** `llm-conductor` (Desktop Native Core)  
> **Language:** TypeScript / Injected Runtime Script  
> **Dependencies:** `0` (Native DOM Events)  
> **Key Metric:** Passive DOM input listeners yield control to human, 1800ms debounce

---

## 1. Problem

In co-pilot browser automation, an AI agent and a human user share access to the same active browser window. 

If the agent dispatches synthetic CDP mouse events (`Input.dispatchMouseEvent`) while the user simultaneously moves their physical mouse, coordinate race conditions occur: the agent clicks shifted coordinates, form inputs lose focus, and unintended buttons are triggered.

---

## 2. Why Naive Approaches Fail

1. **Locking User Peripherals:**
   * Blocking OS-level input while the AI navigates destroys ergonomics and violates basic user agency.
2. **Modal Overlays:**
   * Dimming the screen with "AI is running, please wait" prevents the human from interacting when the AI gets stuck.

---

## 3. Architecture

We engineered a passive Hardware Yield Protocol:

1. **Passive Event Traps:** We register `{ passive: true }` listeners for `mousemove`, `mousedown`, `keydown`, and `wheel`. Passive listeners never block the main thread.
2. **Intervention State:** When physical input is detected, `window.__humanIntervening` is asserted immediately.
3. **Adaptive Debounce:** An 1800ms debounce window prevents flickering and yields control to the human.
4. **Autonomous Yield Loop:** The agent execution engine awaits `waitForHumanYield()` prior to any CDP dispatch, polling every 250 ms until the user releases the controls. After `maxWaitMs` (default 5 s) it returns `false`, so the caller can skip the action instead of clicking while the user is still moving.

---

## 4. Behavior Comparison

| Peripheral Coordination Model | User Agency | Coordinate Drift & Focus Loss | Main Thread Impact |
|---|---|---|---|
| OS Input Lockout | None (Peripherals blocked) | High user frustration | OS-level hooks |
| Modal Screen Overlays | Obstructed | AI blocks human intervention | DOM overlay layout shifts |
| **Passive Hardware Yield Lock** | **Full human priority** | **Yields CDP dispatch during user input** | **Passive event listeners (`{ passive: true }`)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/collision_avoidance.ts`](./src/collision_avoidance.ts).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --experimental-strip-types --test test/collision_avoidance.test.ts
```

### Verified Output:
```text
✔ returns true as soon as the user is idle (32.2911ms)
✔ returns false when the user keeps moving past maxWaitMs (108.7657ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
