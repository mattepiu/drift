/**
 * Galaxy Sound Effects
 *
 * Procedural sci-fi sound effects for the Galaxy visualization using jsfxr.
 * All sounds are generated on-the-fly using the Web Audio API.
 *
 * Sound Categories:
 * - Navigation: hover, select, deselect, zoom
 * - Data: path activation, data flow pulse
 * - Security: alert, warning, critical
 * - Ambient: background hum, star twinkle
 */

// ============================================================================
// Types
// ============================================================================

export type SoundType =
  | 'hover'
  | 'select'
  | 'deselect'
  | 'zoom'
  | 'pathActivate'
  | 'dataFlow'
  | 'alertLow'
  | 'alertMedium'
  | 'alertHigh'
  | 'alertCritical'
  | 'warp'
  | 'scan'
  | 'powerUp'
  | 'powerDown'
  | 'click'
  | 'blip';

export interface SoundConfig {
  enabled: boolean;
  volume: number; // 0-1
  muted: boolean;
}

// ============================================================================
// Sound Definitions (jsfxr format)
// ============================================================================

/**
 * Pre-designed sound effect parameters for jsfxr.
 * These create sci-fi themed sounds perfect for a space visualization.
 */
const SOUND_DEFINITIONS: Record<SoundType, object> = {
  // Soft blip for hovering over nodes
  hover: {
    oldParams: true,
    wave_type: 1, // Square wave
    p_env_attack: 0,
    p_env_sustain: 0.05,
    p_env_punch: 0,
    p_env_decay: 0.1,
    p_base_freq: 0.5,
    p_freq_limit: 0,
    p_freq_ramp: 0.1,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0.1,
    p_hpf_ramp: 0,
    sound_vol: 0.15,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Satisfying "lock-on" sound for selection
  select: {
    oldParams: true,
    wave_type: 0, // Sine wave
    p_env_attack: 0,
    p_env_sustain: 0.1,
    p_env_punch: 0.3,
    p_env_decay: 0.2,
    p_base_freq: 0.4,
    p_freq_limit: 0,
    p_freq_ramp: 0.2,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0.5,
    p_arp_speed: 0.6,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.2,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Soft release sound for deselection
  deselect: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0,
    p_env_sustain: 0.05,
    p_env_punch: 0,
    p_env_decay: 0.15,
    p_base_freq: 0.5,
    p_freq_limit: 0,
    p_freq_ramp: -0.2,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.8,
    p_lpf_ramp: -0.2,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.15,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Whoosh for zooming
  zoom: {
    oldParams: true,
    wave_type: 3, // Noise
    p_env_attack: 0.1,
    p_env_sustain: 0.2,
    p_env_punch: 0,
    p_env_decay: 0.3,
    p_base_freq: 0.1,
    p_freq_limit: 0,
    p_freq_ramp: 0.3,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.5,
    p_lpf_ramp: 0.2,
    p_lpf_resonance: 0.5,
    p_hpf_freq: 0.1,
    p_hpf_ramp: 0,
    sound_vol: 0.1,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Energy beam for path activation
  pathActivate: {
    oldParams: true,
    wave_type: 2, // Sawtooth
    p_env_attack: 0,
    p_env_sustain: 0.15,
    p_env_punch: 0.2,
    p_env_decay: 0.25,
    p_base_freq: 0.3,
    p_freq_limit: 0,
    p_freq_ramp: 0.15,
    p_freq_dramp: 0,
    p_vib_strength: 0.1,
    p_vib_speed: 0.3,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.7,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0.3,
    p_hpf_freq: 0.05,
    p_hpf_ramp: 0,
    sound_vol: 0.18,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Subtle pulse for data flow
  dataFlow: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0.05,
    p_env_sustain: 0.1,
    p_env_punch: 0,
    p_env_decay: 0.1,
    p_base_freq: 0.6,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0.2,
    p_vib_speed: 0.5,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.6,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0.2,
    p_hpf_ramp: 0,
    sound_vol: 0.08,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Low priority alert
  alertLow: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0,
    p_env_sustain: 0.1,
    p_env_punch: 0,
    p_env_decay: 0.2,
    p_base_freq: 0.35,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.15,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Medium priority alert
  alertMedium: {
    oldParams: true,
    wave_type: 1,
    p_env_attack: 0,
    p_env_sustain: 0.15,
    p_env_punch: 0.1,
    p_env_decay: 0.15,
    p_base_freq: 0.4,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0.3,
    p_arp_speed: 0.5,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0.5,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.18,
    sample_rate: 44100,
    sample_size: 8,
  },

  // High priority alert
  alertHigh: {
    oldParams: true,
    wave_type: 1,
    p_env_attack: 0,
    p_env_sustain: 0.2,
    p_env_punch: 0.2,
    p_env_decay: 0.1,
    p_base_freq: 0.5,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0.4,
    p_arp_speed: 0.4,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0.4,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.22,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Critical alert - urgent warning
  alertCritical: {
    oldParams: true,
    wave_type: 1,
    p_env_attack: 0,
    p_env_sustain: 0.25,
    p_env_punch: 0.3,
    p_env_decay: 0.1,
    p_base_freq: 0.6,
    p_freq_limit: 0,
    p_freq_ramp: -0.1,
    p_freq_dramp: 0,
    p_vib_strength: 0.1,
    p_vib_speed: 0.8,
    p_arp_mod: 0.5,
    p_arp_speed: 0.3,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0.3,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.25,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Warp/hyperspace jump sound
  warp: {
    oldParams: true,
    wave_type: 3,
    p_env_attack: 0.1,
    p_env_sustain: 0.3,
    p_env_punch: 0.2,
    p_env_decay: 0.4,
    p_base_freq: 0.05,
    p_freq_limit: 0,
    p_freq_ramp: 0.4,
    p_freq_dramp: 0.1,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.3,
    p_lpf_ramp: 0.3,
    p_lpf_resonance: 0.5,
    p_hpf_freq: 0,
    p_hpf_ramp: 0.1,
    sound_vol: 0.2,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Scanning/analysis sound
  scan: {
    oldParams: true,
    wave_type: 2,
    p_env_attack: 0.05,
    p_env_sustain: 0.4,
    p_env_punch: 0,
    p_env_decay: 0.2,
    p_base_freq: 0.2,
    p_freq_limit: 0,
    p_freq_ramp: 0.2,
    p_freq_dramp: -0.1,
    p_vib_strength: 0.3,
    p_vib_speed: 0.6,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0.6,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.5,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0.3,
    p_hpf_freq: 0.1,
    p_hpf_ramp: 0,
    sound_vol: 0.12,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Power up / enable
  powerUp: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0,
    p_env_sustain: 0.2,
    p_env_punch: 0.3,
    p_env_decay: 0.3,
    p_base_freq: 0.2,
    p_freq_limit: 0,
    p_freq_ramp: 0.3,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0.5,
    p_arp_speed: 0.5,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.2,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Power down / disable
  powerDown: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0,
    p_env_sustain: 0.15,
    p_env_punch: 0,
    p_env_decay: 0.4,
    p_base_freq: 0.5,
    p_freq_limit: 0,
    p_freq_ramp: -0.3,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: -0.3,
    p_arp_speed: 0.5,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 0.8,
    p_lpf_ramp: -0.3,
    p_lpf_resonance: 0,
    p_hpf_freq: 0,
    p_hpf_ramp: 0,
    sound_vol: 0.18,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Simple UI click
  click: {
    oldParams: true,
    wave_type: 1,
    p_env_attack: 0,
    p_env_sustain: 0.02,
    p_env_punch: 0,
    p_env_decay: 0.05,
    p_base_freq: 0.6,
    p_freq_limit: 0,
    p_freq_ramp: 0,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0.5,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0.3,
    p_hpf_ramp: 0,
    sound_vol: 0.12,
    sample_rate: 44100,
    sample_size: 8,
  },

  // Quick blip for notifications
  blip: {
    oldParams: true,
    wave_type: 0,
    p_env_attack: 0,
    p_env_sustain: 0.05,
    p_env_punch: 0,
    p_env_decay: 0.1,
    p_base_freq: 0.55,
    p_freq_limit: 0,
    p_freq_ramp: 0.1,
    p_freq_dramp: 0,
    p_vib_strength: 0,
    p_vib_speed: 0,
    p_arp_mod: 0,
    p_arp_speed: 0,
    p_duty: 0,
    p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0,
    p_pha_ramp: 0,
    p_lpf_freq: 1,
    p_lpf_ramp: 0,
    p_lpf_resonance: 0,
    p_hpf_freq: 0.1,
    p_hpf_ramp: 0,
    sound_vol: 0.15,
    sample_rate: 44100,
    sample_size: 8,
  },
};

// ============================================================================
// Sound Engine Class
// ============================================================================

/**
 * Galaxy Sound Engine
 *
 * Manages sound effect playback for the Galaxy visualization.
 * Uses jsfxr for procedural sound generation.
 */
export class GalaxySoundEngine {
  private config: SoundConfig;
  private audioCache: Map<SoundType, HTMLAudioElement> = new Map();
  private sfxr: typeof import('jsfxr') | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: Partial<SoundConfig> = {}) {
    this.config = {
      enabled: true,
      volume: 0.5,
      muted: false,
      ...config,
    };
  }

  /**
   * Initialize the sound engine (lazy load jsfxr)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {return;}
    if (this.initPromise) {return this.initPromise;}

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Dynamically import jsfxr
      this.sfxr = await import('jsfxr');
      
      // Pre-generate and cache all sounds
      for (const [type, definition] of Object.entries(SOUND_DEFINITIONS)) {
        const audio = this.sfxr.sfxr.toAudio(definition);
        this.audioCache.set(type as SoundType, audio);
      }

      this.initialized = true;
    } catch (_error: unknown) {
      // Failed to initialize - disable sounds
      this.config.enabled = false;
    }
  }

  /**
   * Play a sound effect
   */
  async play(type: SoundType): Promise<void> {
    if (!this.config.enabled || this.config.muted) {
      return;
    }

    // Initialize on first play (handles user gesture requirement)
    if (!this.initialized) {
      await this.initialize();
    }

    const audio = this.audioCache.get(type);
    if (!audio) {
      return;
    }

    try {
      // Clone the audio to allow overlapping sounds
      const clone = audio.cloneNode() as HTMLAudioElement;
      clone.volume = this.config.volume;
      await clone.play();
    } catch (_error: unknown) {
      // Silently fail - likely blocked by browser autoplay policy
    }
  }

  /**
   * Play a sound with pitch variation (for variety)
   */
  async playWithVariation(type: SoundType, pitchVariation = 0.1): Promise<void> {
    if (!this.config.enabled || this.config.muted || !this.sfxr) {
      return;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const definition = { ...SOUND_DEFINITIONS[type] } as Record<string, unknown>;
    const baseFreq = definition['p_base_freq'] as number;
    
    // Add random pitch variation
    definition['p_base_freq'] = baseFreq * (1 + (Math.random() - 0.5) * pitchVariation * 2);

    try {
      const audio = this.sfxr.sfxr.toAudio(definition);
      audio.volume = this.config.volume;
      await audio.play();
    } catch (_error: unknown) {
      // Silently fail
    }
  }

  /**
   * Play alert sound based on severity
   */
  async playAlert(severity: 'low' | 'medium' | 'high' | 'critical'): Promise<void> {
    const soundMap: Record<string, SoundType> = {
      low: 'alertLow',
      medium: 'alertMedium',
      high: 'alertHigh',
      critical: 'alertCritical',
    };
    await this.play(soundMap[severity]);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SoundConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SoundConfig {
    return { ...this.config };
  }

  /**
   * Toggle mute
   */
  toggleMute(): boolean {
    this.config.muted = !this.config.muted;
    return this.config.muted;
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Enable/disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let soundEngineInstance: GalaxySoundEngine | null = null;

/**
 * Get the global sound engine instance
 */
export function getGalaxySoundEngine(): GalaxySoundEngine {
  soundEngineInstance ??= new GalaxySoundEngine();
  return soundEngineInstance;
}

/**
 * Create a new sound engine instance (for testing or custom configs)
 */
export function createGalaxySoundEngine(config?: Partial<SoundConfig>): GalaxySoundEngine {
  return new GalaxySoundEngine(config);
}
