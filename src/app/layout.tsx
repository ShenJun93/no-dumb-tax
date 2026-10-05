import Link from "next/link";
import "./globals.css";

export const metadata = { title: "No Dumb Tax", description: "Honest free trials on PayPal Subscriptions" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">No Dumb Tax</Link>
          <nav>
            <Link href="/">Demo SaaS</Link>
            <Link href="/merchant">Merchant</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
