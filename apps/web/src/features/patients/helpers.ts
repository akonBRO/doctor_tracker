import { patientAgeLabel, bangladeshToday, type Patient } from '@doctor-tracker/shared';

export const genderLabels: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  'non-binary': 'Non-binary',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
  unknown: 'Unknown',
};

export function birthDateLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function ageLabel(record: Pick<Patient, 'dateOfBirth' | 'approximateAge'>) {
  if (!record.dateOfBirth && !record.approximateAge) return '';
  if (
    record.dateOfBirth &&
    (record.dateOfBirth > bangladeshToday() || !Number.isFinite(Date.parse(record.dateOfBirth)))
  )
    return '';
  return patientAgeLabel(record);
}
