# Case Study 61: Non-Blocking Try-Lock Audio Buffer Swapping for Real-Time FFT Spectrum

---

## 1. Problem

1. **Audio Driver Underruns (Buffer Starvation):** The real-time OS audio thread (WASAPI/CoreAudio/ALSA) has strict hard real-time deadlines (~5-10ms). If the audio thread acquires a standard blocking mutex while the UI thread is executing a heavy Fast Fourier Transform (FFT), audio playback stutters and glitching occurs.
2. **Memory Allocation on Audio Thread:** Allocating new vectors or cloning 1024-float arrays on every audio frame triggers system memory allocators, introducing unpredictable latency spikes.
3. **Desynchronized Visualizations:** Real-time frequency bars must display recent audio without lag while never impacting playback performance.

---

## 2. Why Naive Approaches Fail

1. **Standard `mutex.lock()` on Audio Thread:** The cardinal rule of audio DSP: NEVER wait on a lock in the audio render callback. Priority inversion causes instantaneous audio dropouts.
2. **Channel-Based MPSC Queues:** Queuing unconsumed buffers fills memory if the UI visualizer slows down or is minimized.
3. **Cross-Thread Vector Cloning:** Cloning 1024-element buffers thousands of times per second wastes memory bandwidth.

---

## 3. Architecture

1. **Non-Blocking Mutex Acquisition (`try_lock()`):** The audio thread attempts acquisition via `self.analyzer.try_lock()`. If the visualizer thread holds the lock, the audio thread drops the frame without waiting and continues rendering audio uninterrupted.
2. **Zero-Copy Vector Swap (`std::mem::swap`):** Swapping buffer pointers via `std::mem::swap(&mut *target, &mut self.analysis_buffer)` transfers ownership in constant O(1) time without heap allocations.
3. **Analysis Flag:** `self.analysis_active` gates accumulation; when no visualizer is visible, the audio thread skips it without touching the lock. In this excerpt it is a plain field on the audio iterator; how the UI side updates it is not part of `src/`.

---

## 4. Behavior Comparison

| Audio Visualizer Pipeline | Audio Thread Lock Contention | Buffer Underrun Stutter | Memory Allocation in Audio Loop |
|---|---|---|---|
| Standard Blocking Mutex | Critical (Blocks for UI FFT) | Frequent Audio Dropouts | Heap Allocations per Frame |
| Unbounded MPSC Channel | None | Memory Inflation Risk | Continuous Node Allocation |
| **Non-Blocking try_lock() Swap** | **Drops frame on contention (Never blocks)** | **Eliminates lock-induced underruns** | **In-place buffer swap (No audio-thread allocations)** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/fft_buffer_swap.rs`](./src/fft_buffer_swap.rs).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
