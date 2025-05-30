# Media Sync

The `<media-sync>` custom element plays `<audio>` and `<video>` tracks in synchronisation. Pressing play for one track causes all synched tracks to start playing together. When one track is paused, they all pause. When one track is scrubbed to a particular timestamp, they all scrub to the same timestamp.

Synchronisation applies to the timing and playback of tracks, but it's possible to control the volume of individual tracks independently. This means that you can adjust the 'mix' by tweaking the levels.

The `<media-sync>` element can be used to combine individual musical parts so that they can be played back together, allowing the consumer to adjust the 'mix' so that they can focus on parts of interest. This is a useful tool for teaching different vocal parts for a choir.

Example usage:

```html
<media-sync>
  <video controls poster="/images/poster.png">
    <source src="ensemble.mp4" type="video/mp4" />
    <source src="ensemble.ogv" type="video/ogv" />
  </video>
  <audio controls>
    <source src="part-1.mp3" />
  </audio>
  <audio controls>
    <source src="part-2.mp3" />
  </audio>
</media-sync>
```

This example features one video track and two audio tracks. In this example, controls are present for each track, so pressing play or pause on any one of these would cause all tracks to play or pause.

## Media constraints

The `<media-sync>` element works on the assumption that all provided tracks have the same duration. Typically, these media tracks would be created together in a dedicated video or audio editing program.