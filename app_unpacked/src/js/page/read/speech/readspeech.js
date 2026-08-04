/*
 * Text-to-speech support removed from the desktop renderer.
 * This module remains as a compatibility placeholder for cached imports.
 */
export default class ReadSpeech {
  constructor() {}
  async init() {}
  metaLoad() {}
  metaUnload() {}
  async stop() {}
  toggle() {}
  isWorking() { return false; }
  cursorChange() {}
}
