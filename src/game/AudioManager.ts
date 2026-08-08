import type { AudioEvent, RunState } from "./Engine";

type SoundKind = AudioEvent["kind"];
type Listener = (enabled: boolean, volume: number) => void;

const VOLUME_STORAGE_KEY = "all-in-defense:master-volume";
export const clampAudioVolume = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

const loadAudioVolume = () => {
  if (typeof window === "undefined") return 1;
  try {
    const stored = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= 0 ? clampAudioVolume(stored) : 1;
  } catch {
    return 1;
  }
};

const safeFrequency = (value: number) => Math.max(30, Math.min(12_000, value));

type AudioContextWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

class GameAudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private mode: RunState = "ready";
  private listeners = new Set<Listener>();
  private lastPlayed = new Map<SoundKind, number>();
  enabled = true;
  volume = loadAudioVolume();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.enabled, this.volume));
  }

  private applyMasterVolume() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(
      this.enabled ? 0.95 * this.volume : 0,
      now,
      0.025,
    );
  }

  private createContext() {
    const audioWindow = window as AudioContextWindow;
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const context = new AudioContextConstructor();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const sfx = context.createGain();
    const music = context.createGain();
    master.gain.value = this.enabled ? 0.95 * this.volume : 0;
    sfx.gain.value = 1.45;
    music.gain.value = 0.52;
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    sfx.connect(master);
    music.connect(master);
    master.connect(compressor).connect(context.destination);
    this.context = context;
    this.master = master;
    this.compressor = compressor;
    this.sfxBus = sfx;
    this.musicBus = music;
    return context;
  }

  /**
   * Starting a silent source inside the user's touch/click handler is required
   * by some iOS Safari versions even after AudioContext.resume() is requested.
   */
  private primeContext(context: AudioContext) {
    const source = context.createBufferSource();
    source.buffer = context.createBuffer(1, 1, context.sampleRate);
    source.connect(context.destination);
    source.start(0);
  }

  async unlock() {
    try {
      let context = this.context;
      if (context?.state === "closed") {
        this.context = null;
        this.master = null;
        this.compressor = null;
        this.sfxBus = null;
        this.musicBus = null;
        context = null;
      }
      context ??= this.createContext();
      if (!context) return false;

      // Keep this before the first await so it runs in the original gesture.
      this.primeContext(context);
      // iOS may expose a non-standard `interrupted` state. Resume every state
      // except running/closed instead of checking only for `suspended`.
      if ((context.state as string) !== "running") await context.resume();
      if (context.state !== "running") return false;
      this.applyMasterVolume();
      if (this.enabled) this.startMusic();
      return true;
    } catch {
      // A later user gesture will retry. Mobile browsers can reject resume()
      // when the page is not visible or the gesture was not accepted.
      return false;
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) void this.unlock();
    this.applyMasterVolume();
    this.emit();
    return this.enabled;
  }

  setVolume(value: number) {
    this.volume = clampAudioVolume(value);
    if (this.volume > 0 && !this.enabled) {
      this.enabled = true;
    }
    if (this.volume > 0) void this.unlock();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, String(this.volume));
      } catch {
        // Storage can be unavailable in private or embedded browser contexts.
      }
    }
    this.applyMasterVolume();
    this.emit();
    return this.volume;
  }

  setMode(mode: RunState) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.musicStep = 0;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
    destination = this.sfxBus,
    endFrequency = frequency,
  ) {
    if (!this.context || !destination || !this.enabled) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(safeFrequency(frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(
      safeFrequency(endFrequency),
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  private noise(duration: number, volume: number, frequency: number, delay = 0) {
    if (!this.context || !this.sfxBus || !this.enabled) return;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.sfxBus);
    source.start(start);
  }

  play(kind: SoundKind) {
    if (!this.context || this.context.state !== "running" || !this.enabled) return;
    const now = performance.now();
    const cooldown = kind === "shot" || kind === "kill" ? 38 : 70;
    if (now - (this.lastPlayed.get(kind) ?? 0) < cooldown) return;
    this.lastPlayed.set(kind, now);

    switch (kind) {
      case "shot":
        this.noise(0.07, 0.17, 2_300);
        this.tone(260, 0.085, 0.1, "square", 0, this.sfxBus, 95);
        break;
      case "heavy":
        this.noise(0.24, 0.2, 720);
        this.tone(105, 0.28, 0.16, "sawtooth", 0, this.sfxBus, 42);
        break;
      case "freeze":
        this.tone(920, 0.2, 0.08, "sine", 0, this.sfxBus, 1_650);
        this.tone(1_380, 0.24, 0.045, "triangle", 0.025, this.sfxBus, 680);
        break;
      case "tesla":
        this.tone(1_250, 0.075, 0.075, "square", 0, this.sfxBus, 430);
        this.tone(1_850, 0.1, 0.055, "sawtooth", 0.045, this.sfxBus, 720);
        break;
      case "kill":
        this.noise(0.16, 0.24, 1_350);
        this.tone(285, 0.18, 0.14, "sawtooth", 0, this.sfxBus, 68);
        this.tone(760, 0.11, 0.08, "triangle", 0.015, this.sfxBus, 310);
        break;
      case "boss":
        this.noise(0.55, 0.2, 420);
        this.tone(72, 0.62, 0.2, "sawtooth", 0, this.sfxBus, 36);
        this.tone(108, 0.5, 0.09, "square", 0.08, this.sfxBus, 54);
        break;
      case "win":
        [440, 554, 659, 880].forEach((note, index) =>
          this.tone(note, 0.3, 0.065, "triangle", index * 0.09),
        );
        break;
      case "lose":
        [220, 174, 130, 82].forEach((note, index) =>
          this.tone(note, 0.34, 0.075, "sawtooth", index * 0.11, this.sfxBus, note * 0.7),
        );
        break;
      case "buy":
        this.tone(520, 0.12, 0.07, "sine", 0, this.sfxBus, 780);
        this.tone(780, 0.15, 0.05, "triangle", 0.07, this.sfxBus, 1_040);
        break;
      case "merge":
        [440, 660, 990].forEach((note, index) =>
          this.tone(note, 0.24, 0.065, "triangle", index * 0.055, this.sfxBus, note * 1.15),
        );
        break;
      case "wheel":
        [330, 440, 550].forEach((note, index) =>
          this.tone(note, 0.12, 0.045, "square", index * 0.055),
        );
        break;
    }
  }

  private startMusic() {
    if (this.musicTimer !== null) return;
    this.scheduleMusic();
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 520);
  }

  private scheduleMusic() {
    if (!this.context || !this.musicBus || !this.enabled || this.context.state !== "running") return;
    if (this.mode === "builder" || this.mode === "defeat") return;
    const running = this.mode === "running";
    const poker = this.mode === "poker" || this.mode === "wheel";
    const roots = running ? [55, 55, 65.4, 49] : poker ? [65.4, 82.4, 73.4, 98] : [55, 65.4, 49, 73.4];
    const root = roots[Math.floor(this.musicStep / 4) % roots.length];
    const pulse = this.musicStep % (running ? 2 : 4) === 0;
    if (pulse) {
      this.tone(root, running ? 0.48 : 0.8, running ? 0.085 : 0.055, "triangle", 0, this.musicBus, root * 0.985);
      this.tone(root * 2, 0.34, 0.025, "sine", 0.02, this.musicBus, root * 2.01);
    }
    if (poker && this.musicStep % 4 === 2)
      this.tone(root * 4, 0.18, 0.028, "sine", 0, this.musicBus, root * 5);
    this.musicStep++;
  }
}

export const gameAudio = new GameAudioManager();
