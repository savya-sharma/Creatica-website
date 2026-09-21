import { Resend } from "resend";

const TO_ADDRESS = "contact@creaticacrown.com";
// Resend's shared sandbox domain (used until a real domain is verified at
// resend.com/domains) will only deliver to the Resend account's own owner
// email - sending to any other recipient, including TO_ADDRESS above, gets
// rejected with a 403 "validation_error". Once a domain is verified, swap
// this for an address on that domain, e.g. "Creatica Crown <hello@creaticacrown.com>".
const FROM_ADDRESS = "Creatica Crown Contact Form <onboarding@resend.dev>";
const isDev = process.env.NODE_ENV !== "production";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const building = typeof body.building === "string" ? body.building.trim() : "";
  const budget = typeof body.budget === "string" ? body.budget.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "";

  const missing = [];
  if (!building) missing.push("building");
  if (!budget) missing.push("budget");
  if (!name) missing.push("name");
  if (!email) missing.push("email");
  if (!message) missing.push("message");

  if (missing.length) {
    return Response.json(
      { error: "Please fill in all required fields.", fields: missing },
      { status: 400 }
    );
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return Response.json(
      { error: "Please enter a valid email address.", fields: ["email"] },
      { status: 400 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return Response.json(
      { error: "Email service is not configured." },
      { status: 500 }
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const textBody = [
    "New project enquiry from creaticacrown.com",
    "",
    `I'm building: ${building}`,
    `Budget: ${budget}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Found via: ${source || "Not specified"}`,
    "",
    "Message:",
    message,
  ].join("\n");

  const htmlBody = `
    <h2>New project enquiry from creaticacrown.com</h2>
    <p><strong>I'm building:</strong> ${escapeHtml(building)}</p>
    <p><strong>Budget:</strong> ${escapeHtml(budget)}</p>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Found via:</strong> ${escapeHtml(source || "Not specified")}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      replyTo: email,
      subject: `New project enquiry from ${name}`,
      text: textBody,
      html: htmlBody,
    });

    if (error) {
      // full detail always goes to the server log; only surfaced to the
      // client in development so the real cause is visible while building
      console.error(
        "[contact form] Resend rejected the send:",
        JSON.stringify(error, null, 2)
      );
      return Response.json(
        {
          error: isDev
            ? `Something went wrong while sending your message. (${error.name}: ${error.message})`
            : "Something went wrong while sending your message.",
        },
        { status: 502 }
      );
    }

    console.log("[contact form] sent successfully, Resend id:", data?.id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[contact form] unexpected send failure:", err);
    return Response.json(
      {
        error: isDev
          ? `Something went wrong while sending your message. (${err.message})`
          : "Something went wrong while sending your message.",
      },
      { status: 500 }
    );
  }
}
