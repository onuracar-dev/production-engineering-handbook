# Case Study 60: 10-Band Biquad Filter Equalizer with Slew-Rate Slew Smoothing

---

## 1. Problem

1. **Digital Audio Clicks and Popping:** When users adjust equalizer sliders in desktop music players, abruptly updating IIR filter coefficients mid-stream produces discontinuous waveform jumps that sound like loud static clicks and can damage speakers.
2. **CPU Overload from Per-Sample Coefficient Math:** Recalculating trigonometric biquad filter transfer functions (`sin`, `cos`, `alpha`) on every single audio sample (44,100 times per second) exhausts CPU cores.
3. **Digital Clipping from Positive Gain Boosts:** Boosting low frequencies (e.g. +12 dB bass) amplifies samples beyond the [-1.0, 1.0] float range, causing harsh digital clipping distortion.

---

## 2. Why Naive Approaches Fail

1. **Instantaneous Coefficient Replacement:** Directly overwriting biquad delay buffers (`x1`, `x2`, `y1`, `y2`) creates instant step discontinuities in the output signal.
2. **Sample-Rate Coefficient Smoothing:** Calculating filter pole-zero placement on every sample introduces floating-point division and trig bottlenecks in the critical audio path.
3. **Fixed Preamp Attenuation:** Applying global volume reduction even when EQ gains are flat reduces signal dynamic range unnecessarily.

---

## 3. Architecture

1. **Frame-Bounded Decimation (`128-Frame Block Rate`):** Coefficient interpolation runs strictly once every 128 audio frames (`44,100 / 128 ≈ 344 updates/s`, `~2.9ms` at 44.1kHz), reducing trigonometric calculation frequency by `1 - 1/128 ≈ 99.2%`.
2. **Geometric Slew-Rate Smoothing (`12% Convergence`):** Gains interpolate geometrically toward user targets (`*current += (target - *current) * 0.12`), ensuring seamless analog-like transitions without audible pops.
3. **Dynamic Preamp Compensation:** Computes peak negative gain offset (`eq_preamp`), automatically attenuating the input stage to preserve dynamic headroom and prevent clipping.

---

## 4. Behavior Comparison

| Audio Filter Transition Approach | Audible Audio Clicks | Coefficient CPU Usage | Headroom Clipping Defense |
|---|---|---|---|
| Direct Parameter Overwrite | Severe (Loud Digital Pops) | Low | None (Severe Clipping) |
| Per-Sample Linear Slew | Smooth | High (44,100 Evals/s at 44.1kHz) | Partial |
| **128-Frame Geometric Slew Rate** | **Smooth transitions (Eliminates clicks)** | **Decimated: 44,100 / 128 ≈ 344 Evals/s (~99.2% reduction)** | **Dynamic Preamp Headroom** |

_Qualitative comparison. Numbers appear only where derived by explicit formula or measured by script._

---

## 5. Implementation

See implementation in [`src/biquad_slew_equalizer.rs`](./src/biquad_slew_equalizer.rs).

---

## 6. Derivation

The decimation and update rates are derived directly from the standard audio PCM sampling rate and processing buffer geometry:

1. **Update Frequency ($F_{\text{update}}$):**
   $$\text{Updates per second} = \frac{f_s}{B} = \frac{44,100\text{ samples/s}}{128\text{ frames}} = 344.53125\text{ updates/s} \approx 344\text{ updates/s}$$

2. **Block Period / Update Interval ($T_{\text{block}}$):**
   $$T_{\text{block}} = \frac{128}{44,100}\text{ s} \approx 0.0029025\text{ s} \approx 2.90\text{ ms}$$

3. **Trigonometric Calculation Reduction:**
   $$\text{Computation Reduction} = 1 - \frac{1}{B} = 1 - \frac{1}{128} = \frac{127}{128} \approx 99.21875\% \approx 99.2\%$$

4. **Geometric Convergence Step:**
   $$G_{k+1} = G_k + 0.12 \times (G_{\text{target}} - G_k)$$
   At $\sim 344.5\text{ updates/s}$, an instantaneous 10 dB slider step settles within $\sim 15\text{ to }20\text{ blocks}$ ($\sim 45\text{ to }60\text{ ms}$), well beneath human acoustic perception of discrete steps while preventing waveform discontinuities.

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
