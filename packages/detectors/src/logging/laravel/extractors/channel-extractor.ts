/**
 * Laravel Log Channel Extractor
 *
 * Extracts log channel configurations from Laravel code.
 *
 * @module logging/laravel/extractors/channel-extractor
 */

import type {
  LogChannelInfo,
  LogStackInfo,
  LogDriver,
  LogLevel,
  LogChannelExtractionResult,
} from '../types.js';

// ============================================================================
// Regex Patterns
// ============================================================================

/**
 * Channels array in config
 */
const CHANNELS_CONFIG_PATTERN = /['"]channels['"]\s*=>\s*\[([\s\S]*?)\n\s*\],/g;

/**
 * Individual channel definition
 */
const CHANNEL_DEFINITION_PATTERN = /['"](\w+)['"]\s*=>\s*\[([\s\S]*?)\n\s{8,12}\],/g;

/**
 * Driver property
 */
const DRIVER_PATTERN = /['"]driver['"]\s*=>\s*['"](\w+)['"]/;

/**
 * Path property
 */
const PATH_PATTERN = /['"]path['"]\s*=>\s*([^,\]]+)/;

/**
 * Level property
 */
const LEVEL_PATTERN = /['"]level['"]\s*=>\s*['"](\w+)['"]/;

/**
 * Days property
 */
const DAYS_PATTERN = /['"]days['"]\s*=>\s*(\d+)/;

/**
 * Stack channels
 */
const STACK_CHANNELS_PATTERN = /['"]channels['"]\s*=>\s*\[([^\]]+)\]/;

/**
 * Default channel
 */
const DEFAULT_CHANNEL_PATTERN = /['"]default['"]\s*=>\s*(?:env\s*\([^)]+,\s*)?['"](\w+)['"]/;

// ============================================================================
// Channel Extractor
// ============================================================================

/**
 * Extracts log channel configurations
 */
export class ChannelExtractor {
  /**
   * Extract all channel configurations from content
   */
  extract(content: string, file: string): LogChannelExtractionResult {
    const channels = this.extractChannels(content, file);
    const stacks = this.extractStacks(content, file);
    const defaultChannel = this.extractDefaultChannel(content);
    const confidence = channels.length > 0 ? 0.9 : 0;

    return {
      channels,
      stacks,
      defaultChannel,
      confidence,
    };
  }

  /**
   * Check if content contains channel configuration
   */
  hasChannels(content: string): boolean {
    return (
      content.includes("'channels'") ||
      content.includes('"channels"')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Extract channel definitions
   */
  private extractChannels(content: string, file: string): LogChannelInfo[] {
    const channels: LogChannelInfo[] = [];

    // Find channels config section
    CHANNELS_CONFIG_PATTERN.lastIndex = 0;
    const configMatch = CHANNELS_CONFIG_PATTERN.exec(content);
    if (!configMatch) {return channels;}

    const channelsContent = configMatch[1] || '';
    const configLine = this.getLineNumber(content, configMatch.index);

    // Extract individual channels
    CHANNEL_DEFINITION_PATTERN.lastIndex = 0;
    let match;
    while ((match = CHANNEL_DEFINITION_PATTERN.exec(channelsContent)) !== null) {
      const name = match[1] || '';
      const channelConfig = match[2] || '';
      const line = configLine + this.getLineNumber(channelsContent.substring(0, match.index), 0);

      // Extract driver
      const driverMatch = channelConfig.match(DRIVER_PATTERN);
      const driver = (driverMatch ? driverMatch[1] : 'single') as LogDriver;

      // Skip stacks (handled separately)
      if (driver === 'stack') {continue;}

      // Extract path
      const pathMatch = channelConfig.match(PATH_PATTERN);
      const path = pathMatch ? this.cleanPath(pathMatch[1] || '') : null;

      // Extract level
      const levelMatch = channelConfig.match(LEVEL_PATTERN);
      const level = levelMatch ? levelMatch[1] as LogLevel : null;

      // Extract days
      const daysMatch = channelConfig.match(DAYS_PATTERN);
      const days = daysMatch ? parseInt(daysMatch[1] || '0', 10) : null;

      channels.push({
        name,
        driver,
        path,
        level,
        days,
        file,
        line,
      });
    }

    return channels;
  }

  /**
   * Extract stack configurations
   */
  private extractStacks(content: string, file: string): LogStackInfo[] {
    const stacks: LogStackInfo[] = [];

    // Find channels config section
    CHANNELS_CONFIG_PATTERN.lastIndex = 0;
    const configMatch = CHANNELS_CONFIG_PATTERN.exec(content);
    if (!configMatch) {return stacks;}

    const channelsContent = configMatch[1] || '';
    const configLine = this.getLineNumber(content, configMatch.index);

    // Extract individual channels
    CHANNEL_DEFINITION_PATTERN.lastIndex = 0;
    let match;
    while ((match = CHANNEL_DEFINITION_PATTERN.exec(channelsContent)) !== null) {
      const name = match[1] || '';
      const channelConfig = match[2] || '';
      const line = configLine + this.getLineNumber(channelsContent.substring(0, match.index), 0);

      // Check if it's a stack
      const driverMatch = channelConfig.match(DRIVER_PATTERN);
      if (driverMatch?.[1] === 'stack') {
        // Extract channels in stack
        const stackChannelsMatch = channelConfig.match(STACK_CHANNELS_PATTERN);
        const channels = stackChannelsMatch
          ? stackChannelsMatch[1]?.split(',').map(c => c.trim().replace(/['"]/g, '')).filter(Boolean) || []
          : [];

        stacks.push({
          name,
          channels,
          file,
          line,
        });
      }
    }

    return stacks;
  }

  /**
   * Extract default channel
   */
  private extractDefaultChannel(content: string): string | null {
    const match = content.match(DEFAULT_CHANNEL_PATTERN);
    return match ? match[1] || null : null;
  }

  /**
   * Clean path value
   */
  private cleanPath(path: string): string {
    return path
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/storage_path\s*\(\s*['"]([^'"]+)['"]\s*\)/, 'storage/$1')
      .replace(/env\s*\([^)]+\)/, '[env]');
  }

  /**
   * Get line number from offset
   */
  private getLineNumber(content: string, offset: number): number {
    return content.substring(0, offset).split('\n').length;
  }
}

/**
 * Create a new channel extractor
 */
export function createChannelExtractor(): ChannelExtractor {
  return new ChannelExtractor();
}
