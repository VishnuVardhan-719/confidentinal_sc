/** A blood-pressure reading exists only when both values are entered; anything else is no reading. */
export function bpReading(entry: { sys?: number; dia?: number }): { systolicMmHg: number; diastolicMmHg: number } | undefined {
  return entry.sys !== undefined && entry.dia !== undefined ? { systolicMmHg: entry.sys, diastolicMmHg: entry.dia } : undefined;
}
