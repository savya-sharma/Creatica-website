// The strip across the top of /connect: the agency's words running past,
// each set apart by an asterisk. Two identical halves scroll by one half's
// width and loop (connect.css); still with reduced motion.
const WORDS = ["Ideas in Motion", "Creative Minds", "Beyond Ordinary", "Stay Curious"];

function Star() {
  return (
    <span className="connect-marquee-star" aria-hidden="true">
      *
    </span>
  );
}

function Group({ hidden }) {
  // enough repeats that one half is wider than any screen
  const words = [...WORDS, ...WORDS, ...WORDS, ...WORDS];
  return (
    <div className="connect-marquee-group" aria-hidden={hidden || undefined}>
      {words.map((word, i) => (
        <span className="connect-marquee-item" key={i}>
          <Star />
          {word}
        </span>
      ))}
    </div>
  );
}

export default function ConnectMarquee() {
  return (
    <div className="connect-marquee no-select" role="presentation">
      <div className="connect-marquee-track">
        <Group />
        <Group hidden />
      </div>
    </div>
  );
}
