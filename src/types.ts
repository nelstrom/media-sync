
import { MediaEvent } from "./constants";

/**
 * Type for events that can be suppressed
 */
export type SuppressibleEventName = 
  | (typeof MediaEvent)["pause"] 
  | (typeof MediaEvent)["play"]
  | (typeof MediaEvent)["ratechange"]
  | (typeof MediaEvent)["seeking"];

