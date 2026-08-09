import type { Metadata, Viewport } from 'next';

// Fonts are SELF-HOSTED rather than pulled from Google. A client-facing UK site
// that loads fonts from a third party makes a request carrying the visitor's IP
// to that third party on every page view — an avoidable complication under UK
// GDPR/PECR, and an avoidable dependency besides. These ship with the app.
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './globals.css';

export const metadata: Metadata = {
  title: 'Sharp & Sons — Book a cut',
  description:
    'Multi-shop appointment booking for Sharp & Sons. Built to replace Fresha.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#121114',
  width: 'device-width',
  initialScale: 1,
  // barbers use their own phones; the staff surface must not zoom on tap
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="grain min-h-screen antialiased">{children}</body>
    </html>
  );
}
