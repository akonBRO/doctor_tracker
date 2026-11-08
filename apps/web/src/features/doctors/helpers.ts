import { doctorQuerySchema } from '@doctor-tracker/shared';

export const doctorDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
export function directoryReturn(value: string | null): string {
  if (!value) return '/doctors';
  try {
    const url = new URL(value, 'https://internal.invalid');
    if (url.origin !== 'https://internal.invalid' || url.pathname !== '/doctors' || url.hash)
      return '/doctors';
    if (
      [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1) ||
      !doctorQuerySchema.safeParse(Object.fromEntries(url.searchParams)).success
    )
      return '/doctors';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/doctors';
  }
}
