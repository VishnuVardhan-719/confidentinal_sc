/**
 * Leadership letters, supplied by the owner on 2026-11-23 (docs/frontend/incoming/LEADERSHIP_COPY.md).
 * They are the leaders' own words, published exactly as given, and shown in English on every language
 * page (lang="en") until the leaders approve translations.
 */
export type Leader = {
  id: "founder" | "cofounder" | "director";
  name: string;
  role: string;
  photo: string;
  photoWidth: number;
  photoHeight: number;
  heading: string;
  quote: string;
  letter: string[];
  /** Short list under the letter ("What we stand for", "The principles that guide us"). */
  listTitle?: string;
  list?: { title: string; body: string }[];
  closing: string[];
  signoff: string;
};

export const LEADERS: Leader[] = [
  {
    id: "founder",
    name: "Pamulapati Vamsi Krishna Reddy",
    role: "Founder, CEO & Managing Director",
    photo: "/team/founder.webp",
    photoWidth: 640,
    photoHeight: 853,
    heading: "Bringing Healthcare Home. Bringing Hope Closer.",
    quote: "Bringing Dignity, Comfort, and Technology to Doorstep Healthcare.",
    letter: [
      "Healthcare should never feel like a journey filled with difficulty, uncertainty, or unnecessary stress. For an elderly parent who struggles to walk, a child experiencing a sudden illness, or a patient recovering after surgery, even reaching a hospital can become a challenge.",
      "At SureCureVisit, we believe that quality healthcare should begin where comfort matters most: at home.",
      "Our vision is simple yet powerful: Care should travel to the patient, not the patient to care.",
      "Through our digital healthcare platform, Curevist.in, we are building a connected home healthcare ecosystem that brings essential medical services closer to individuals and families. We connect patients with doctors, convenient doctor home visits, live doctor tracking, doorstep lab sample collection, digital prescriptions, secure health records, professional caretaker services, and emergency support.",
      "But we are building more than a healthcare platform. We are building trust, simplifying access to medical services, and creating a healthcare experience where technology meets humanity.",
    ],
    listTitle: "We envision a future where",
    list: [
      { title: "A doctor is just a visit away", body: "" },
      { title: "Medical assistance reaches your doorstep", body: "" },
      { title: "Families stay informed about their loved ones’ care", body: "" },
      { title: "Elderly individuals receive support with dignity", body: "" },
      { title: "Healthcare is more accessible, convenient, and patient-focused", body: "" },
    ],
    closing: [
      "Every service we introduce, every connection we create, and every innovation we pursue is guided by one belief: Every individual deserves compassionate, dependable, and accessible healthcare.",
      "Our journey is driven by a commitment to make healthcare smarter, closer, and more human.",
      "SureCureVisit: Your Health, Our Priority. Care Comes to You.",
    ],
    signoff: "With commitment and responsibility",
  },
  {
    id: "cofounder",
    name: "Sai Varshitha",
    role: "Co-Founder & Director",
    photo: "/team/cofounder.webp",
    photoWidth: 640,
    photoHeight: 744,
    heading: "A Commitment Beyond Healthcare. Making Every Patient Feel Valued, Supported, and Cared For.",
    quote:
      "Healthcare is not just about treating an illness; it is about understanding people, respecting their needs, and standing beside them when they need care the most.",
    letter: [
      "At SureCureVisit, we believe that every patient deserves more than a medical service. They deserve attention, respect, comfort, and the reassurance that someone genuinely cares about their well-being.",
      "As Co-Founder and Director, I see healthcare from a deeply human perspective. Behind every appointment is a person, behind every medical need is a family, and behind every recovery is a story that deserves compassion.",
      "Our responsibility goes beyond connecting patients with healthcare professionals. It is about creating an experience where patients feel heard, families feel reassured, and quality medical support becomes easier to access.",
      "Through Curevist.in, we are working towards a healthcare ecosystem that puts people first. Whether it is arranging a doctor visit at home, coordinating diagnostic services, supporting elderly individuals, providing professional caretaker assistance, or helping families manage healthcare needs, our focus remains on making every interaction meaningful.",
    ],
    listTitle: "What we stand for",
    list: [
      { title: "Care with Compassion", body: "Treating every patient with dignity, kindness, and respect." },
      { title: "Trust Through Transparency", body: "Building confidence through reliable healthcare connections and clear communication." },
      { title: "Comfort at Home", body: "Making essential healthcare services more accessible without unnecessary travel." },
      { title: "Support for Every Family", body: "Recognising the importance of elderly care, recovery support, and family well-being." },
      { title: "Technology with a Human Touch", body: "Using digital innovation to simplify healthcare without losing its personal connection." },
    ],
    closing: [
      "I believe that the future of healthcare should not only be smarter but also more sensitive to the needs of people.",
      "Every family deserves peace of mind. Every patient deserves to be treated with dignity. And every healthcare journey deserves genuine care.",
      "At SureCureVisit, we are committed to turning this belief into action, one patient, one family, and one doorstep at a time.",
      "Because caring for people is not just what we do. It is the reason we exist.",
    ],
    signoff: "With compassion and commitment",
  },
  {
    id: "director",
    name: "Pamulapati Satyanarayana Reddy",
    role: "Director",
    photo: "/team/director.webp",
    photoWidth: 640,
    photoHeight: 827,
    heading: "Leadership with Responsibility. Growth with Purpose. Building a Stronger Foundation for the Future of Healthcare.",
    quote:
      "A successful healthcare organisation is not measured only by the services it provides, but by the trust it earns, the responsibility it carries, and the lives it positively impacts.",
    letter: [
      "At SureCureVisit, we believe that transforming healthcare requires more than a great idea. It requires strong leadership, responsible decisions, consistent dedication, and a commitment to creating meaningful change in society.",
      "As a Director of SureCureVisit Healthcare, I believe in building an organisation founded on trust, integrity, accountability, and a clear sense of purpose.",
      "Our journey is about creating a healthcare ecosystem that brings patients, medical professionals, and essential healthcare services closer together. Through Curevist.in, we aim to make healthcare more accessible, convenient, and dependable for individuals and families.",
      "My focus is on strengthening the foundation of our organisation, encouraging innovation, supporting sustainable growth, and ensuring that every step we take contributes to our larger mission.",
    ],
    listTitle: "The principles that guide us",
    list: [
      { title: "Integrity in Leadership", body: "Making responsible decisions with honesty and transparency." },
      { title: "Trust in Every Relationship", body: "Building lasting confidence among patients, families, healthcare professionals, and partners." },
      { title: "Excellence in Execution", body: "Maintaining professionalism and consistency in every aspect of our services." },
      { title: "Sustainable Growth", body: "Creating a strong organisation that can deliver long-term value to society." },
      { title: "Commitment to Innovation", body: "Encouraging new ideas and technology that improve healthcare accessibility." },
    ],
    closing: [
      "I strongly believe that the future belongs to organisations that combine innovation with responsibility and growth with genuine social purpose.",
      "At SureCureVisit, we are not simply building a healthcare business; we are working towards a meaningful healthcare movement where quality care becomes easier to reach and every patient matters.",
      "Our ambition is to build an organisation that people can trust today and generations can rely on tomorrow.",
      "SureCureVisit: Your Health, Our Priority. Building Trust. Strengthening Care. Creating a Healthier Tomorrow.",
    ],
    signoff: "With responsibility and commitment",
  },
];

export const SHARED_PROMISE = {
  title: "Three Leaders. Three Perspectives. One Common Mission.",
  body: [
    "At SureCureVisit Healthcare, our leadership is united by a shared commitment to transform doorstep healthcare through innovation, compassion, trust, and responsibility.",
    "Together, we strive to create a future where healthcare reaches every home, patients receive the dignity they deserve, and families experience greater comfort and confidence.",
  ],
  tagline: "SureCureVisit: Your Health, Our Priority. Care Comes to You.",
};
