import { CustomEventNames } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper } from "./types";
import { Logger } from "./utils";

/**
 * MediaSync class that manages and synchronizes multiple media elements
 */
export class MediaSync extends HTMLElement {
  private mediaElements: MediaElementWrapper[] = [];

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
      element.addEventListener(CustomEventNames.user.play, (e) => {
        console.log(index, e);
      });
      element.addEventListener(CustomEventNames.programmatic.play, (e) => {
        console.log(index, e);
      });

      this.mediaElements.push(wrapper);

      if (isMain) {
        Logger.debug(`Set element ${index} as main media element`);
      }
    });
  }

}
