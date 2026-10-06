// Single source of truth for the contact form: the options it offers, the
// payload shape sent to POST /api/contact, and how a submission is
// validated. Imported by both the form (components/Contact.jsx) and the API
// route (app/api/contact/route.js), so client and server always agree.

export const PROJECT_TYPE_OPTIONS = [
  "Branding",
  "Social media handling",
  "an e-commerce website",
  "video creation",
  "multiple / something complex",
  "not sure - let's talk",
];

export const BUDGET_OPTIONS = [
  "< ₹15 000",
  "₹15 000-25 000",
  "₹25 000-40 000",
  "₹40 000-60 000",
  "₹60 000-100 000",
  "₹100 000+",
];

export const FOUND_THROUGH_OPTIONS = [
  "LinkedIn",
  "Instagram",
  "Twitter / X",
  "Google search",
  "Other",
];

export const EMPTY_VALUES = {
  projectType: "",
  budget: "",
  name: "",
  email: "",
  message: "",
  foundThrough: "",
};

// in the order the fields appear on the form
export const FIELD_ORDER = Object.keys(EMPTY_VALUES);

const FIELD_LABELS = {
  projectType: "what you're building",
  budget: "your budget",
  name: "your name",
  email: "your email",
  message: "what you're picturing",
  foundThrough: "how you found us",
};

// generous caps - only there to reject junk/abuse, never a real enquiry
const MAX_LENGTH = { name: 120, email: 254, message: 5000 };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const asTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

// The clean submission payload: only the known keys, all trimmed strings.
export function toPayload(raw = {}) {
  return {
    projectType: asTrimmedString(raw.projectType),
    budget: asTrimmedString(raw.budget),
    name: asTrimmedString(raw.name),
    email: asTrimmedString(raw.email),
    message: asTrimmedString(raw.message),
    foundThrough: asTrimmedString(raw.foundThrough),
  };
}

// { field: "required" | "invalid" | "too long" } for every invalid field;
// an empty object means the payload is valid.
export function validate(payload) {
  const errors = {};

  if (!PROJECT_TYPE_OPTIONS.includes(payload.projectType)) errors.projectType = "required";
  if (!BUDGET_OPTIONS.includes(payload.budget)) errors.budget = "required";

  if (!payload.name) errors.name = "required";
  else if (payload.name.length > MAX_LENGTH.name) errors.name = "too long";

  if (!payload.email) errors.email = "required";
  else if (payload.email.length > MAX_LENGTH.email || !EMAIL_PATTERN.test(payload.email)) {
    errors.email = "invalid";
  }

  if (!payload.message) errors.message = "required";
  else if (payload.message.length > MAX_LENGTH.message) errors.message = "too long";

  if (!FOUND_THROUGH_OPTIONS.includes(payload.foundThrough)) errors.foundThrough = "required";

  return errors;
}

// One sentence for the form's existing error line, in field order, e.g.
// "Please add your budget and a valid email."
export function describeErrors(errors) {
  const parts = FIELD_ORDER.filter((field) => errors[field]).map((field) => {
    if (errors[field] === "invalid") return "a valid email";
    if (errors[field] === "too long") return field === "name" ? "a shorter name" : "a shorter message";
    return FIELD_LABELS[field];
  });
  if (!parts.length) return "";
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `Please add ${list}.`;
}
