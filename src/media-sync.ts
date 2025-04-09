import { MediaState } from './constants';
import { MediaElementWrapperImpl } from './media-element-wrapper';
import { MediaElementWrapper } from './types';
import { Logger, isValidStateTransition } from './utils';

/**
 * MediaSync class that manages and synchronizes multiple media elements
 */
export class MediaSync extends HTMLElement {
  private mediaElements: MediaElementWrapper[] = [];
  private currentState: MediaState = MediaState.LOADING;
  private currentTime: number = 0;
  private readyCount: number = 0;
  private mainMediaElement: MediaElementWrapper | null = null;
  
  constructor() {
    super();
    Logger.debug('MediaSync: Initializing');
  }
  
  /**
   * Called when the element is connected to the DOM
   */
  connectedCallback(): void {
    Logger.debug('MediaSync: Connected to DOM');
    this.initialize();
  }
  
  /**
   * Called when the element is disconnected from the DOM
   */
  disconnectedCallback(): void {
    Logger.debug('MediaSync: Disconnected from DOM');
    // Clean up any resources if needed
  }
  
  /**
   * Initialize the media sync element
   */
  public initialize(): void {
    // Find all media elements (audio and video) that are children of this element
    const mediaElements = [...this.querySelectorAll('audio, video')] as HTMLMediaElement[];
    
    if (mediaElements.length === 0) {
      Logger.error('No media elements found in MediaSync container');
      return;
    }
    
    // The first element is designated as the main one (controlling sync)
    this.setupMediaElements(mediaElements, mediaElements[0]);
  }
  
  /**
   * Set up media elements for synchronization
   */
  private setupMediaElements(elements: HTMLMediaElement[], mainElement: HTMLMediaElement): void {
    elements.forEach((element, index) => {
      const isMain = element === mainElement;
      
      const wrapper = new MediaElementWrapperImpl(element, {
        isMain,
        onStateChange: this.handleStateChange.bind(this),
        onReady: this.handleElementReady.bind(this)
      });
      
      this.mediaElements.push(wrapper);
      
      if (isMain) {
        this.mainMediaElement = wrapper;
        Logger.debug(`Set element ${index} as main media element`);
      }
    });
  }
  
  /**
   * Handle state changes from any media element
   */
  private async handleStateChange(state: MediaState, mediaElement: MediaElementWrapper): Promise<void> {
    // If it's not the main element and not a buffering event, we can ignore some state changes
    if (!mediaElement.isMain) {
      if (![MediaState.BUFFERING, MediaState.ENDED].includes(state)) {
        return;
      }
    }
    
    Logger.debug(`State change request: ${state} from ${mediaElement.id}`);
    
    if (state === MediaState.BUFFERING) {
      // TODO: Implement buffering logic if needed
      return;
    }
    
    if (state === MediaState.PLAYING) {
      await this.playAll();
      return;
    }
    
    if (state === MediaState.PAUSED) {
      if (mediaElement.isEnded()) {
        return;
      }
      await this.pauseAll();
      return;
    }
    
    if (state === MediaState.ENDED) {
      // Only the main element should trigger an ended state for the entire group
      if (this.mainMediaElement && mediaElement !== this.mainMediaElement) {
        return;
      }
      
      await this.moveToState(MediaState.ENDED);
    }
  }
  
  /**
   * Handle when a media element is ready to play
   */
  private handleElementReady(mediaElement: MediaElementWrapper): void {
    this.readyCount++;
    Logger.debug(`Media element ${mediaElement.id} ready. Ready count: ${this.readyCount}/${this.mediaElements.length}`);
    
    if (this.readyCount === this.mediaElements.length) {
      this.moveToState(MediaState.LOADED);
    }
  }
  
  /**
   * Move the entire sync group to a new state
   */
  private async moveToState(newState: MediaState, 
    onSuccess?: (newState: MediaState, oldState: MediaState) => Promise<void> | void): Promise<void> {
    
    if (!isValidStateTransition(this.currentState, newState)) {
      Logger.error(`Invalid state transition: ${this.currentState} -> ${newState}`);
      return;
    }
    
    const oldState = this.currentState;
    this.currentState = newState;
    
    Logger.debug(`Group state changed to: ${newState}`);
    
    if (onSuccess) {
      await onSuccess(newState, oldState);
    }
  }
  
  /**
   * Play all media elements
   */
  public async playAll(): Promise<void> {
    await this.moveToState(MediaState.PLAYING, async () => {
      this.seekAll(this.currentTime);
      
      await Promise.all(
        this.mediaElements.map(async mediaElement => {
          if (mediaElement.getCurrentTime() < mediaElement.getDuration()) {
            await mediaElement.play();
          }
        })
      );
    });
  }
  
  /**
   * Pause all media elements
   */
  public async pauseAll(): Promise<void> {
    await this.moveToState(MediaState.PAUSED, async () => {
      await Promise.all(
        this.mediaElements.map(async mediaElement => {
          await mediaElement.pause();
        })
      );
    });
  }
  
  /**
   * Seek all media elements to a specific time
   */
  public seekAll(time: number): void {
    this.currentTime = time;
    
    this.mediaElements.forEach(mediaElement => {
      mediaElement.seekTo(time);
    });
  }
}