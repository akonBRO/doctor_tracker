import { z } from 'zod';

// Bangladesh National Portal district directory, checked 8 November 2026.
// https://bangladesh.gov.bd/pages/static-pages/জেলা-বাতায়ন-8398ff-69a55ba386514399668e4e9f
// English display spellings are used consistently as stored values. No upazila list is invented.
export const BANGLADESH_DISTRICTS: Record<string, readonly string[]> = {
  Barishal: ['Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'],
  Chattogram: [
    'Bandarban',
    'Brahmanbaria',
    'Chandpur',
    'Chattogram',
    'Cumilla',
    "Cox's Bazar",
    'Feni',
    'Khagrachhari',
    'Lakshmipur',
    'Noakhali',
    'Rangamati',
  ],
  Dhaka: [
    'Dhaka',
    'Faridpur',
    'Gazipur',
    'Gopalganj',
    'Kishoreganj',
    'Madaripur',
    'Manikganj',
    'Munshiganj',
    'Narayanganj',
    'Narsingdi',
    'Rajbari',
    'Shariatpur',
    'Tangail',
  ],
  Khulna: [
    'Bagerhat',
    'Chuadanga',
    'Jashore',
    'Jhenaidah',
    'Khulna',
    'Kushtia',
    'Magura',
    'Meherpur',
    'Narail',
    'Satkhira',
  ],
  Mymensingh: ['Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'],
  Rajshahi: [
    'Bogura',
    'Chapainawabganj',
    'Joypurhat',
    'Naogaon',
    'Natore',
    'Pabna',
    'Rajshahi',
    'Sirajganj',
  ],
  Rangpur: [
    'Dinajpur',
    'Gaibandha',
    'Kurigram',
    'Lalmonirhat',
    'Nilphamari',
    'Panchagarh',
    'Rangpur',
    'Thakurgaon',
  ],
  Sylhet: ['Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'],
};
export const BANGLADESH_DIVISIONS = Object.keys(BANGLADESH_DISTRICTS);

const westernDigits = (value: string) =>
  value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
const compactPhone = (value: string) => westernDigits(value.trim()).replace(/[ ().-]/g, '');
const bdMobile = /^(?:\+?88)?01[3-9]\d{8}$/;
export function normalizeBangladeshPhone(value: string) {
  const compact = compactPhone(value);
  return bdMobile.test(compact) ? `+880${compact.slice(-10)}` : value.trim();
}
export function formatBangladeshPhone(value: string) {
  const normalized = normalizeBangladeshPhone(value);
  return /^\+8801[3-9]\d{8}$/.test(normalized) ? `0${normalized.slice(4)}` : value;
}

export const patientMobileSchema = z
  .string()
  .trim()
  .max(40, 'Use at most 40 characters.')
  .refine((value) => {
    const original = westernDigits(value);
    if (!/^\+?\d[\d ().-]*\d$/.test(original)) return false;
    if ((original.match(/\(/g)?.length ?? 0) !== (original.match(/\)/g)?.length ?? 0)) return false;
    const compact = compactPhone(value);
    if (bdMobile.test(compact)) return true;
    // A non-Bangladesh contact needs an explicit country code. Do not interpret short local numbers.
    return !compact.startsWith('+880') && /^\+[1-9]\d{6,14}$/.test(compact);
  }, 'Enter a valid Bangladesh mobile number or an international number with a country code.')
  .transform((value) => compactPhone(normalizeBangladeshPhone(value)));
