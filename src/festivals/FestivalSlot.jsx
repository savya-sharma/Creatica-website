"use client";

import { useFestival } from "./useFestival";
import { FESTIVALS } from "./registry";
import DiwaliHero from "./diwali/DiwaliHero";
import DiwaliFooter from "./diwali/DiwaliFooter";

// One slot per place a festival may decorate. The page mounts the slot; the
// slot mounts the active festival's piece for that area, or nothing - so with
// no festival active the page is exactly its default self.
const AREAS = {
  diwali: { hero: DiwaliHero, footer: DiwaliFooter },
};

export default function FestivalSlot({ area }) {
  const { festival, guides } = useFestival();
  const Piece = festival ? AREAS[festival]?.[area] : null;
  const entry = FESTIVALS.find((f) => f.id === festival);
  return Piece ? <Piece guides={guides} motion={entry?.motion} decorations={entry?.decorations ?? {}} /> : null;
}
