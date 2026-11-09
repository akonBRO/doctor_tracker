export const number = new Intl.NumberFormat('en-BD');
export const day = (value: string, year = false) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
