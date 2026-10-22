import Link from 'next/link';

import './globals.css';

// Requests outside any locale (rare: the proxy redirects almost everything to /bn or /en).
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p lang="bn" className="text-3xl font-semibold">
          শিকড়
        </p>
        <p>Page not found · পৃষ্ঠাটি পাওয়া যায়নি</p>
        <Link className="text-primary underline underline-offset-4" href="/">
          Home · প্রথম পাতা
        </Link>
      </body>
    </html>
  );
}
