import type { Metadata } from 'next';
import { connection } from 'next/server';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Doctor Tracker', template: '%s | Doctor Tracker' },
  description: 'Doctor and patient records for practice administrators.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
