
/**
 * Media element wrapper interface
 */
export interface MediaElementWrapper {
  /**
   * The unique ID of the media element
   */
  id: string;
  
  /**
   * Whether this is the main media element that controls synchronization
   */
  isMain: boolean;
  
  /**
   * Audio source node for Web Audio API integration
   */
  audioSource?: MediaElementAudioSourceNode;
  
  /**
   * Play the media element
   */
  play(): Promise<void>;
  
  /**
   * Pause the media element
   */
  pause(): void;
  
  /**
   * The current playback time
   */
  currentTime: number;
  
  /**
   * The total duration
   */
  duration: number;
  
  /**
   * Check if the media has ended
   */
  isEnded(): boolean;
  
  /**
   * Check if the media is currently playing
   */
  isPlaying(): boolean;
  
  /**
   * Check if the media is currently paused
   */
  isPaused(): boolean;
  
  /**
   * Connect to Web Audio API context
   */
  connectToAudioContext(context: AudioContext): void;
  
  /**
   * Disconnect from Web Audio API context
   */
  disconnectFromAudioContext(): void;
}