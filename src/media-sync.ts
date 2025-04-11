import { CustomEventNames } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper } from "./types";
import { Logger } from "./utils";

/**
 * MediaSync class that manages and synchronizes multiple media elements
 */
export class MediaSync extends HTMLElement {
  private mediaElements: MediaElementWrapper[] = [];
  private isSyncingPlay: boolean = false;
  private isSyncingPause: boolean = false;

  constructor() {
    super();
    Logger.debug("MediaSync: Initializing");
  }

  /**
   * Called when the element is connected to the DOM
   */
  connectedCallback(): void {
    Logger.debug("MediaSync: Connected to DOM");
    this.initialize();
  }

  /**
   * Called when the element is disconnected from the DOM
   */
  disconnectedCallback(): void {
    Logger.debug("MediaSync: Disconnected from DOM");
    // Clean up any resources if needed
  }

  /**
   * Initialize the media sync element
   */
  public initialize(): void {
    // Find all media elements (audio and video) that are children of this element
    const mediaElements = [
      ...this.querySelectorAll("audio, video"),
    ] as HTMLMediaElement[];

    if (mediaElements.length === 0) {
      Logger.error("No media elements found in MediaSync container");
      return;
    }

    // The first element is designated as the main one (controlling sync)
    this.setupMediaElements(mediaElements, mediaElements[0]);
  }

  /**
   * Set up media elements for synchronization
   */
  private setupMediaElements(
    elements: HTMLMediaElement[],
    mainElement: HTMLMediaElement
  ): void {
    elements.forEach((element, index) => {
      const isMain = element === mainElement;

      const wrapper = new MediaElementWrapperImpl(element, {
        isMain,
      });

      element.addEventListener(CustomEventNames.programmatic.seeking, (e) => {
        console.log(index, e);
      });
      element.addEventListener(CustomEventNames.programmatic.seeked, (e) => {
        console.log(index, e);
      });
      element.addEventListener(CustomEventNames.user.seeking, (e) => {
        console.log(index, e);
      });
      element.addEventListener(CustomEventNames.user.seeked, (e) => {
        console.log(index, e);
      });
      element.addEventListener("play", (e) => {
        console.log(index, e);
      });
      element.addEventListener("pause", (e) => {
        console.log(index, e);
      });

      // Handle user-initiated play events
      element.addEventListener(CustomEventNames.user.play, () => {
        Logger.debug(`User play event from element ${index}`);

        // Play all other media elements
        this.playTracks(this.otherTracks(element));
      });

      // Handle programmatic play events
      element.addEventListener(CustomEventNames.programmatic.play, () => {
        Logger.debug(`Programmatic play event from element ${index}`);

        this.playTracks(this.otherTracks(element));
      });

      // Handle user-initiated pause events
      element.addEventListener(CustomEventNames.user.pause, () => {
        Logger.debug(`User pause event from element ${index}`);

        // Pause all other media elements
        this.pauseTracks(this.otherTracks(element));
      });

      // Handle programmatic pause events
      element.addEventListener(CustomEventNames.programmatic.pause, () => {
        Logger.debug(`Programmatic pause event from element ${index}`);

        this.pauseTracks(this.otherTracks(element));
      });

      this.mediaElements.push(wrapper);

      if (isMain) {
        Logger.debug(`Set element ${index} as main media element`);
      }
    });
  }

  /**
   * Play all media elements
   */
  public async play(): Promise<void> {
    await this.playTracks();
  }

  private otherTracks(exludeElement: HTMLMediaElement) {
    return this.mediaElements.filter((me) => me.element !== exludeElement);
  }

  private async playTracks(mediaElements = this.mediaElements): Promise<void> {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to play");
      return;
    }

    if (this.isSyncingPlay) {
      Logger.debug("playTracks called while syncing. Skipping...");
      return;
    }

    try {
      Logger.debug(`MediaSync: Playing ${mediaElements.length} media elements`);

      // Set flag to prevent infinite loops from programmatic play events
      this.isSyncingPlay = true;

      // Play all media elements
      const playPromises = mediaElements.map((media) => media.play());

      // Wait for all play operations to complete
      await Promise.all(playPromises);

      // Reset flag after all play operations are complete
      setTimeout(() => {
        this.isSyncingPlay = false;
      }, 0);
    } catch (error) {
      Logger.error("Error playing media elements:", error);
    }
  }

  /**
   * Pause all media elements
   */
  pause(): void {
    this.pauseTracks();
  }

  private pauseTracks(mediaElements = this.mediaElements): void {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to pause");
      return;
    }

    if (this.isSyncingPause) {
      Logger.debug("pauseTracks called while syncing. Skipping...");
      return;
    }

    Logger.debug("MediaSync: Pausing all media elements");

    // Set flag to prevent infinite loops from programmatic pause events
    this.isSyncingPause = true;

    // Pause all media elements - this is synchronous
    mediaElements.forEach((media) => media.pause());

    // Reset flag after pausing is complete
    // Use setTimeout to ensure this runs after the current execution cycle
    setTimeout(() => {
      this.isSyncingPause = false;
    }, 0);
  }
}
