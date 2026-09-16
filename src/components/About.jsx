import Profilegallery from "@/components/Profilegaller";

export default function About() {
  return (
    <div className="about-page">
      <div className="about-meta-row">
        <p className="about-meta">
          Raised in India
          <br />
          Working worldwide
        </p>

        <p className="about-meta about-meta-right">
          Working
          <br />
          worldwide
        </p>
      </div>

      <p className="about-intro">
        Creatica exists for ideas that refuse to look like everything else.
        We bring strategy, creativity, design, and technology together to
        transform ambitious businesses into brands with presence,
        personality, and purpose. We challenge conventions, explore
        unexpected directions, and create work designed to be remembered.
      </p>

      <div className="about-founder">
        <div className="about-owner-pic">
          <span>
            owner
            <br />
            picture
          </span>
        </div>

        <div className="about-founder-copy">
          <h2 className="about-founder-label">Founder Story</h2>

          <p>
            Creatica began with a simple belief: good ideas deserve to be
            seen differently.
          </p>

          <p>
            I started the agency after noticing how often great businesses
            were held back by predictable branding and communication. I
            wanted to create a space where strategy and creativity could
            work together—to build brands that don&apos;t just look good,
            but have something meaningful to say.
          </p>

          <p>
            What began with curiosity, experimentation, and a few ambitious
            ideas has grown into a creative agency built around one
            principle: never settle for the obvious.
          </p>

          <p>
            We work across branding, design, content, and digital
            experiences, helping businesses find their voice, express what
            makes them different, and connect with the people who matter.
          </p>

          <p>
            For me, creativity has never been about decoration. It&apos;s
            about finding the idea, giving it character, and making it
            matter.
          </p>
        </div>
      </div>

      <Profilegallery />
    </div>
  );
}
