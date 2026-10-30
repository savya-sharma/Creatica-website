import ArrowUpRightIcon from "../icons/ArrowUpRightIcon";

// An outbound arrow that, when its link is hovered or focused, flies off
// up and to the right while a second one slides in from behind (bottom
// left) to take its place (connect.css). Sized by its parent's font size.
export default function ArrowSwap({ className }) {
  return (
    <span className={className ? `arrow-swap ${className}` : "arrow-swap"} aria-hidden="true">
      <ArrowUpRightIcon className="arrow-swap-icon" />
      <ArrowUpRightIcon className="arrow-swap-icon arrow-swap-icon--next" />
    </span>
  );
}
