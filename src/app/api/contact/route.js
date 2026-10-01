import { Resend } from "resend";
import { toPayload, validate, describeErrors, EMAIL_PATTERN } from "@/lib/contactForm";

// Contact form -> POST /api/contact -> Resend -> CONTACT_TO_EMAIL
//
// Server-only configuration (.env.local / the host's environment - never
// sent to the browser):
//   RESEND_API_KEY      Resend API key
//   CONTACT_FROM_EMAIL  sender, an address on the domain verified in Resend
//   CONTACT_TO_EMAIL    where enquiries are delivered

const SENDER_NAME = "Creatica Crown Contact Form";
const isDev = process.env.NODE_ENV !== "production";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reads and checks the mail configuration per request; returns null (and
// logs which variable is wrong) instead of sending with a broken setup.
function getMailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FROM_EMAIL?.trim();
  const to = process.env.CONTACT_TO_EMAIL?.trim();

  const problems = [];
  if (!apiKey) problems.push("RESEND_API_KEY is not set");
  if (!from || !EMAIL_PATTERN.test(from)) problems.push("CONTACT_FROM_EMAIL is missing or invalid");
  if (!to || !EMAIL_PATTERN.test(to)) problems.push("CONTACT_TO_EMAIL is missing or invalid");
  if (problems.length) {
    console.error(`[contact form] mail is not configured: ${problems.join("; ")}`);
    return null;
  }
  return { apiKey, from: `${SENDER_NAME} <${from}>`, to };
}

function buildEmail({ projectType, budget, name, email, message, foundThrough }) {
  const rows = [
    ["Project type", projectType],
    ["Budget", budget],
    ["Name", name],
    ["Email", email],
    ["Found through", foundThrough],
  ];

  const text = [
    "New project enquiry - creaticacrown.com",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    message,
    "",
    "Reply to this email to answer the sender directly.",
  ].join("\n");

  const rowHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 16px 10px 0;color:#586a6b;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:10px 0;color:#072f33;font-size:15px;">${
            label === "Email"
              ? `<a href="mailto:${escapeHtml(value)}" style="color:#072f33;">${escapeHtml(value)}</a>`
              : escapeHtml(value)
          }</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="background:#cecfc9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:6px;">
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0;color:#586a6b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">creaticacrown.com</p>
            <h1 style="margin:8px 0 0;color:#072f33;font-size:22px;font-weight:600;">New project enquiry</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e3e4df;">${rowHtml}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0 0 8px;color:#586a6b;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;">Message</p>
            <p style="margin:0;color:#072f33;font-size:15px;line-height:1.6;">${escapeHtml(message).replace(/\n/g, "<br />")}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e3e4df;color:#586a6b;font-size:12px;">
            Reply to this email to answer ${escapeHtml(name)} directly.
          </td>
        </tr>
      </table>
    </div>`;

  return { text, html };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // same rules as the form (lib/contactForm.js) - the client check is for
  // the visitor's benefit, this is the one that can be trusted
  const payload = toPayload(body && typeof body === "object" ? body : {});
  const errors = validate(payload);
  const invalidFields = Object.keys(errors);
  if (invalidFields.length) {
    return Response.json(
      { error: describeErrors(errors), fields: invalidFields },
      { status: 400 }
    );
  }

  const config = getMailConfig();
  if (!config) {
    return Response.json(
      { error: "The contact form is temporarily unavailable. Please email us directly." },
      { status: 500 }
    );
  }

  const resend = new Resend(config.apiKey);
  const { text, html } = buildEmail(payload);

  try {
    const { data, error } = await resend.emails.send({
      from: config.from,
      to: config.to,
      // replying in the inbox goes straight to the person who wrote in
      replyTo: payload.email,
      // collapsed so a name can't carry line breaks into the subject
      subject: `New project enquiry from ${payload.name.replace(/\s+/g, " ")}`,
      text,
      html,
    });

    if (error) {
      // full detail always goes to the server log; only surfaced to the
      // client in development so the real cause is visible while building
      console.error("[contact form] Resend rejected the send:", JSON.stringify(error, null, 2));
      return Response.json(
        {
          error: isDev
            ? `Something went wrong while sending your message. (${error.name}: ${error.message})`
            : "Something went wrong while sending your message. Please try again.",
        },
        { status: 502 }
      );
    }

    console.log("[contact form] sent, Resend id:", data?.id);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[contact form] unexpected send failure:", err);
    return Response.json(
      {
        error: isDev
          ? `Something went wrong while sending your message. (${err.message})`
          : "Something went wrong while sending your message. Please try again.",
      },
      { status: 500 }
    );
  }
}
