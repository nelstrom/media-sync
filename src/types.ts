import { MediaState } from './constants';

/**
 * Media element wrapper interface
 */
export interface MediaElementWrapper {
  /**
   * The unique ID of the media element
   */
  id: string;
  
  /**
   * The original HTML media element
   */
  element: HTMLMediaElement;
  
  /**
   * Current state of the media element
   */
  state: MediaState;
  
  /**
   * Whether this element is currently playing
   */
  isPlaying: boolean;
  
  /**
   * Whether this is the main media element that controls synchronization
   */
  isMain: boolean;
  
  /**
   * Play the media element
   */
  play(): Promise<void>;
  
  /**
   * Pause the media element
   */
  pause(): void;
  
  /**
   * Seek to a specific time
   */
  seekTo(time: number): void;
  
  /**
   * Get the current playback time
   */
  getCurrentTime(): number;
  
  /**
   * Get the total duration
   */
  getDuration(): number;
  
  /**
   * Check if the media has ended
   */
  isEnded(): boolean;
}