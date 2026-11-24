/**
 * Official contact details supplied by the owner on 2026-11-24. One source for the footer, the contact page and the
 * schema.org markup so they can never disagree. These are the company's own public channels, not patient data.
 */
export const CONTACT = {
  phoneDisplay: "+91 83414 94604",
  phoneTel: "+918341494604",
  email: "surecurevisit@gmail.com",
  instagramHandle: "Surecure.visit",
  instagramUrl: "https://www.instagram.com/surecure.visit/",
  address: {
    streetAddress: "14/P Silpa Paradise, Flat no. 101, near ALEAP Circle, Pragathi Nagar",
    addressLocality: "Hyderabad",
    addressRegion: "Telangana",
    addressCountry: "IN",
  },
} as const;

/** The address as one line, for visible text. */
export const CONTACT_ADDRESS_LINE = `${CONTACT.address.streetAddress}, ${CONTACT.address.addressLocality}, ${CONTACT.address.addressRegion}`;
