/* eslint-disable @next/next/no-img-element -- pre-optimized transparent
   WebP stickers with their own srcSet, sized and placed purely by CSS */
import { diwaliAsset, DIWALI_ASSETS } from "./assets";

// One piece of Diwali artwork in its slot. The asset if it has been supplied
// (assets.js / available.json); otherwise nothing - or, with layout guides on
// (development only), a dashed box labelled with what belongs there. A
// missing asset is never stood in for by other art.
export default function Sticker({ id, className, sizes, guides }) {
  const asset = diwaliAsset(id);
  if (asset) {
    return (
      <img
        className={`diwali-sticker ${className}`}
        src={asset.src}
        srcSet={asset.srcSet}
        sizes={sizes}
        width={asset.width}
        height={asset.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
    );
  }
  if (!guides) return null;
  const entry = DIWALI_ASSETS.find((a) => a.id === id);
  return (
    <div className={`diwali-sticker diwali-guide ${className}`} aria-hidden="true">
      <span>
        LAYOUT GUIDE - asset missing
        <br />
        {entry?.master ?? id}
      </span>
    </div>
  );
}
