// The personal details a client can read and change, in the order they are
// shown. The form is built from this list and the server checks what is sent
// against it (src/lib/profile.ts), so a new detail is one entry here plus its
// field in ClientDetails.

import type { ClientDetails } from "./types";

export interface DetailField {
  key: keyof ClientDetails;
  label: string;
  type: "text" | "date" | "tel" | "email";
  max: number;
  autoComplete?: string;
  wide?: boolean;
}

export const DETAILS: DetailField[] = [
  { key: "name", label: "Full name", type: "text", max: 80, autoComplete: "name" },
  { key: "dob", label: "Date of birth", type: "date", max: 10, autoComplete: "bday" },
  { key: "phone", label: "Phone", type: "tel", max: 30, autoComplete: "tel" },
  { key: "email", label: "Email", type: "email", max: 120, autoComplete: "email" },
  { key: "address", label: "Home address", type: "text", max: 160, autoComplete: "street-address", wide: true },
  { key: "language", label: "Languages you speak", type: "text", max: 80 },
  { key: "bestTime", label: "Best time to reach you", type: "text", max: 80 },
  { key: "occupation", label: "Occupation", type: "text", max: 120, wide: true },
];
