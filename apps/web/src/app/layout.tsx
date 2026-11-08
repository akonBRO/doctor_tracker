import type { Metadata } from 'next';
import { connection } from 'next/server';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Doctor Tracker — A clearer view of care', template: '%s | Doctor Tracker' },
  description:
    'A considered workspace for doctor and patient administration. Secure access, clear organization, and room to focus.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
