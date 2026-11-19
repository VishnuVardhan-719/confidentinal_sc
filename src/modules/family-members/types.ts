/** Family members / dependents a patient may book for. No health data lives here. */
export const FAMILY_RELATIONS = ["spouse", "child", "parent", "sibling", "grandparent", "other"] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

/** Maximum dependents per account (proposed; needs product confirmation, see REQUESTS.md). */
export const MAX_FAMILY_MEMBERS = 10;
export const FAMILY_NAME_MAX = 80;

export type FamilyMember = {
  id: string;
  displayName: string;
  relation: FamilyRelation;
  /** Calendar date YYYY-MM-DD (no time, no zone). */
  dateOfBirth: string;
  version: number;
  updatedAt: string;
  synthetic: boolean;
};

export type FamilyMemberInput = {
  displayName: string;
  relation: FamilyRelation;
  dateOfBirth: string;
};

/** Field-level validation issue codes; the UI maps each to a localized message. */
export const FAMILY_ISSUES = [
  "name_required",
  "name_too_long",
  "name_invalid",
  "relation_required",
  "dob_required",
  "dob_invalid",
  "dob_future",
  "dob_too_old",
] as const;
export type FamilyIssue = (typeof FAMILY_ISSUES)[number];
export type FamilyField = keyof FamilyMemberInput;
