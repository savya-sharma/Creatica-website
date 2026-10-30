import { diwaliAsset, DIWALI_ASSETS } from "./assets";
import Sticker from "./Sticker";

// A diya: the lamp and its flame are artwork (a sticker); the warm glow
// around the flame is code - a soft light at the flame (manifest `glow`)
// that motion.js makes breathe and flicker. No lamp, no glow: when the art is
// missing (and layout guides are off) nothing renders at all.
export default function Diya({ id, variant, sizes, guides }) {
  if (!diwaliAsset(id) && !guides) return null;
  const [x, y] = DIWALI_ASSETS.find((a) => a.id === id)?.glow ?? [0.5, 0.25];
  return (
    <span className={`diwali-diya diwali-diya--${variant}`}>
      <Sticker id={id} className="diwali-diya-art" sizes={sizes} guides={guides} />
      <span className="diwali-flame" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
    </span>
  );
}
