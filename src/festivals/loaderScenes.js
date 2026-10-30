import { DiwaliIntro } from "./diwali/loader/DiwaliIntro";

// The entry loader's festival scenes, by the id a festival's theme names
// (registry.js `theme.loader.scene`). IntroLoader.jsx uses the one named by
// the active festival in place of its default marble; with no festival (or
// no scene named) it runs exactly as it always has. Each scene has the
// default's interface: ready, lost, play(duration, ease), dispose(), plus
// setLoad(0..1) for the count.
export const LOADER_SCENES = {
  diwali: DiwaliIntro,
};
