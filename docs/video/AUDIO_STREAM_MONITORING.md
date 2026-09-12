# Audio Stream Monitoring (`video.audio`)

**Capability Identifier:** `video.audio`  
**Domain:** Video / Media  
**Maturity Level:** Production Ready  
**Standard Compliance:** ITU-T G.711 (PCMU / PCMA), ITU-R BS.1770-4 / EBU R128, AES17  

---

## 1. Executive Architecture Summary

The **Audio Stream Monitoring** subsystem provides sub-millisecond audio stream decoding, broadcast-standard acoustic level metering, and real-time anomaly detection for surveillance camera channels across Sentinel Grid and OMSystems.

```
+---------------------------------------------------------------------------------------------------+
|                                  Surveillance Hardware Layer                                      |
|    Hikvision AcuSense Eyeball | Dahua Audio Bullet | Uniview Mic Array | ONVIF Profile S/T/G      |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  │ RTP / RTSP Audio Packets (G.711, PCM, AAC)
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                              Mathematical Audio Decoding Layer                                    |
|   ITU-T G.711 u-law Expander  │  ITU-T G.711 a-law Expander  │  Linear PCM (8/16/24/32-bit LE/BE)|
|   MPEG-4 AAC-ADTS Demuxer     │  Float32Array Normalizer     │  Software Gain Calibration         |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  │ Normalized Float32 Samples [-1.0, 1.0]
                                                  ▼
+---------------------------------------------------------------------------------------------------+
|                               Real-Time Level Metering Engine                                     |
|   • True Sample Peak & dBFS       • True Root Mean Square (RMS dBFS)                              |
|   • Peak Hold Ballistics (-20dB/s) • ITU-R BS.1770 / EBU R128 LUFS Loudness (K-Weighting)         |
|   • Dynamic Crest Factor (dB)     • Sample Saturation Clipping Detection                          |
|   • Ambient Noise Floor & SNR     • Energy + Zero-Crossing Voice Activity Detection (VAD)         |
|   • 3-Band Spectral Filter Bank (Low <250Hz, Mid 250-4000Hz, High >4000Hz)                        |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ├──────────────────────────────┐
                                                  ▼                              ▼
+---------------------------------------------------+  +--------------------------------------------+
|            Acoustic Anomaly Detector              |  |         Real-Time SSE Streaming            |
|   • Audio Loss / Mic Tamper (Silence > 15s)       |  |  GET /v1/audio-monitoring/channels/:id/stream|
|   • High Noise Threshold (Sustained SPL > -12dBFS)|  |  Low-latency 10Hz-20Hz browser feed        |
|   • Acoustic Spike (Crest > 18dB, Gunshot/Blast)  |  +--------------------------------------------+
|   • Scream Distress (High Vocal Energy Ratio)     |                    │
|   • Clipping Distortion (Overdrive Saturation)    |                    ▼
+---------------------------------------------------+  +--------------------------------------------+
                          │                            |          Operator Dashboard UI             |
                          ▼                            |  • Real-Time Broadcast VU / Peak Meters    |
+---------------------------------------------------+  |  • Multi-Camera Audio Channel Grid         |
|             PostgreSQL Persistence Layer          |  |  • Waveform Oscilloscope Envelope          |
|   • audio_channel_configs                         |  |  • 3-Band Equalizer Distribution           |
|   • audio_meter_telemetry                         |  |  • Acoustic Incident Log & Acknowledge     |
|   • audio_monitoring_alerts                       |  |  • Threshold Configuration Modal           |
+---------------------------------------------------+  +--------------------------------------------+
```

---

## 2. Audio Decoding Pipeline

Surveillance IP cameras transport audio primarily using low-bitrate companded codecs or linear PCM over RTSP interleaved channels:

### 2.1 ITU-T G.711 u-law (PCMU)
- **Standard:** ITU-T Recommendation G.711 (mu-law companding).
- **Format:** 8,000 Hz, 8-bit mono, 64 kbps.
- **Algorithm:** Inverts all bits (`~byte & 0xFF`), extracts 1-bit sign, 3-bit exponent, and 4-bit mantissa.
- **Decompression:**
  $$\text{linear} = ((\text{mantissa} \ll 3) + 0x84) \ll \text{exponent} - 0x84$$
- **Precomputed Lookup Table:** Maps all 256 byte values directly to normalized `Float32Array` values in $[-1.0, 1.0]$ in $O(1)$ constant time.

### 2.2 ITU-T G.711 a-law (PCMA)
- **Standard:** ITU-T Recommendation G.711 (A-law companding).
- **Format:** 8,000 Hz, 8-bit mono, 64 kbps.
- **Algorithm:** Inverts even bits (`byte ^ 0x55`), extracts sign, 3-bit exponent, and 4-bit mantissa.
- **Decompression:**
  $$\text{linear} = \begin{cases} (\text{mantissa} \ll 4) + 0x08 & \text{if exponent} = 0 \\ ((\text{mantissa} \ll 4) + 0x108) \ll (\text{exponent} - 1) & \text{if exponent} > 0 \end{cases}$$
- **Precomputed Lookup Table:** Maps all 256 byte values directly to normalized `Float32Array` values in $[-1.0, 1.0]$ in $O(1)$ constant time.

### 2.3 Linear PCM
- **`PCM_S16LE` / `PCM_S16BE`:** 16-bit signed little-endian and big-endian samples divided by $32768.0$. Multi-channel streams are de-interleaved into discrete per-channel float buffers.
- **`PCM_U8`:** 8-bit unsigned samples transformed via $(b - 128) / 128.0$.
- **`PCM_S24LE`:** 24-bit 3-byte packed samples sign-extended and normalized by $8388608.0$.
- **`PCM_F32LE`:** 32-bit IEEE 754 floating point samples clamped to $[-1.0, 1.0]$.

### 2.4 MPEG-4 AAC in ADTS Container
- Demuxes 7-byte / 9-byte Audio Data Transport Stream (ADTS) headers:
  - Validates 12-bit syncword `0xFFF`.
  - Resolves `samplingFrequencyIndex` (44.1 kHz, 48 kHz, 16 kHz, etc.).
  - Resolves `channelConfiguration` (mono, stereo, 5.1).
  - Extracts exact 13-bit frame length and payload boundaries.

---

## 3. Real-Time Level Metering Equations

### 3.1 Sample Peak (dBFS)
$$\text{SamplePeak} = \max_{i} |s_i|$$
$$\text{Peak}_{\text{dBFS}} = 20 \log_{10}\left(\max(\text{SamplePeak}, 10^{-4.5})\right) \quad [\text{clamped to } -90.0 \text{ to } 0.0 \text{ dBFS}]$$

### 3.2 True RMS (Root Mean Square)
$$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} s_i^2}$$
$$\text{RMS}_{\text{dBFS}} = 20 \log_{10}\left(\max(\text{RMS}, 10^{-4.5})\right) \quad [\text{clamped to } -90.0 \text{ to } 0.0 \text{ dBFS}]$$
*Note: A 0 dBFS peak full-scale sinusoidal wave yields exactly $-3.01$ dBFS RMS.*

### 3.3 ITU-R BS.1770 / EBU R128 LUFS Loudness
Applies standard K-weighting pre-filter stage:
1. **Stage 1 (Head Acoustic Baffle):** High-shelving filter boosting frequencies above 1.5 kHz by $+4\text{ dB}$.
2. **Stage 2 (RLB High-Pass):** 2nd-order recursive IIR high-pass filter with cutoff at $100\text{ Hz}$.
3. **Channel Energy Integration:**
   $$\text{LUFS} = -0.691 + 10 \log_{10}\left( \sum_{c=1}^{C} G_c \cdot \frac{1}{N}\sum_{i=0}^{N-1} y_{c,i}^2 \right)$$

### 3.4 Dynamic Crest Factor
$$\text{CrestFactor}_{\text{dB}} = \text{Peak}_{\text{dBFS}} - \text{RMS}_{\text{dBFS}}$$
- **Impulsive Spikes (Gunshot, Blast, Door Kick):** $\ge 18\text{ dB}$.
- **Natural Speech & Human Voice:** $8\text{ to } 14\text{ dB}$.
- **Continuous Siren, Compressor, or Severe Clipping:** $< 4\text{ dB}$.

### 3.5 Sample Clipping & Saturation
Counts samples where $|s_i| \ge 0.999$:
$$\text{ClipPercentage} = \frac{\text{ClippedSamples}}{N} \times 100\%$$
Triggers visual red warning LED and clipping alarm when $\text{ClipPercentage} \ge 0.2\%$ or $\text{ClippedSamples} \ge 5$.

### 3.6 Ambient Noise Floor Tracking & SNR
Uses an asymmetric ballistics tracker:
$$\text{NoiseFloor}_{t} = \begin{cases} \text{NoiseFloor}_{t-1} + 0.25 \cdot (\text{RMS}_t - \text{NoiseFloor}_{t-1}) & \text{if } \text{RMS}_t < \text{NoiseFloor}_{t-1} \\ \text{NoiseFloor}_{t-1} + 0.01 \cdot (\text{RMS}_t - \text{NoiseFloor}_{t-1}) & \text{if } \text{RMS}_t \ge \text{NoiseFloor}_{t-1} \end{cases}$$
$$\text{SNR}_{\text{dB}} = \max\left(0, \text{RMS}_{\text{dBFS}} - \text{NoiseFloor}_{\text{dBFS}}\right)$$

### 3.7 3-Band Frequency Equalizer
- **Low Band ($< 250\text{ Hz}$):** Sub-bass, engine hum, heavy machinery, HVAC rumble.
- **Mid Band ($250\text{ to } 4000\text{ Hz}$):** Human vocal formant frequencies, speech intelligibility.
- **High Band ($> 4000\text{ Hz}$):** Glass shatter, metallic impacts, whistles, screeching tires.

---

## 4. Acoustic Anomaly Detection Engine

| Alert Type | Severity | Trigger Criteria | Security Meaning |
|---|---|---|---|
| `audio_loss` | P2 | $\text{RMS} \le \text{SilenceThreshold}$ for $\ge 15\text{ seconds}$ | Microphone disconnected, wire cut, or physical acoustic baffle sabotage. |
| `high_noise_threshold` | P1 / P2 | $\text{RMS} \ge \text{NoiseThreshold}$ for $\ge 200\text{ ms}$ | High sound pressure level, unauthorized machinery, continuous alarm siren. |
| `acoustic_spike` | P1 | $\text{Crest} \ge 18\text{ dB}$, $\text{SNR} \ge 20\text{ dB}$, $\text{Peak} \ge -12\text{ dBFS}$ | Violent impulsive rise: gunshot, explosive detonation, heavy door breach. |
| `scream_distress` | P1 | $\text{Mid}+\text{High} \ge 75\%$, $\text{RMS} \ge -20\text{ dBFS}$, $\text{VAD}=\text{SPEECH}$ | High-frequency vocal tract resonance characteristic of human screaming/panic. |
| `clipping_distortion` | P3 | $\text{IsClipping}=\text{true}$, $\text{ClipPct} \ge 2.5\%$ | Preamplifier overdrive, sensor saturation, blown microphone membrane. |

---

## 5. REST & SSE API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/audio-monitoring/channels` | List all audio-capable cameras with current live level readings and config. |
| `GET` | `/v1/audio-monitoring/channels/:cameraId` | Retrieve detailed channel status, codec parameters, and live meters. |
| `PUT` | `/v1/audio-monitoring/channels/:cameraId/config` | Update software gain, silence threshold, noise alarm, and scream toggle. |
| `POST` | `/v1/audio-monitoring/channels/:cameraId/decode-and-meter` | Decode base64 audio payload and calculate real-time acoustic level metrics. |
| `POST` | `/v1/audio-monitoring/channels/:cameraId/telemetry` | Ingest precomputed audio telemetry samples from edge agents. |
| `GET` | `/v1/audio-monitoring/channels/:cameraId/metrics/history` | Query time-series telemetry rollups for trend charting. |
| `GET` | `/v1/audio-monitoring/channels/:cameraId/stream` | Server-Sent Events (SSE) real-time streaming of audio level meters (10Hz). |
| `GET` | `/v1/audio-monitoring/alerts` | Query acoustic incidents with status, severity, and camera filters. |
| `POST` | `/v1/audio-monitoring/alerts/:id/acknowledge` | Operator acknowledges an acoustic alert with audit log. |
| `GET` | `/v1/audio-monitoring/stats` | Aggregated fleet health, speech activity, and acoustic incident counts. |

---

## 6. Database Schema

The subsystem uses durable PostgreSQL schema defined in `database/migrations/132_audio_stream_monitoring.sql`:
1. `audio_channel_configs`: Stores per-camera hardware audio configuration, gain calibration, and alarm thresholds.
2. `audio_meter_telemetry`: High-frequency metric rollups (RMS, Peak, LUFS, Noise Floor, VAD, Spectral Bands).
3. `audio_monitoring_alerts`: Forensic security incident records with acoustic metrics snapshots.

---

## 7. Operator Dashboard Workspace

Navigating to **INVESTIGATE & PLAYBACK -> Audio Stream Monitoring** (`/video/audio`) provides:
- **Live Camera Audio Channels List:** Real-time dBFS badges, VAD activity pills, and online/offline status indicators.
- **Broadcast VU Meter:** Smoothly animated gradient meters with RMS bars, peak needles, and peak-hold markers with broadcast decay.
- **Oscilloscope Waveform Display:** Real-time canvas rendering of audio envelope amplitude.
- **3-Band Frequency Equalizer:** Energy proportion meters for Low, Mid, and High acoustic spectrums.
- **Incident Drawer:** Immediate notification of acoustic breaches with one-click operator acknowledgment.
- **Zero Mock Data:** Built entirely on production Fastify APIs, real SSE streams, and PostgreSQL tables.
