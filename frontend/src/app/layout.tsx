import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import AuthNav from "./components/AuthNav";

export const metadata: Metadata = {
  title: "CinemaSeat | Movie Tickets",
  description: "Discover movies and book the best seats in seconds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="logo" aria-label="CinemaSeat home">
              <span className="logo-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              Cinema<span>Seat</span>
            </Link>
            <nav className="main-nav" aria-label="Main navigation">
              <Link href="/" className="active">Movies</Link>
              <a href="#coming-soon">Coming soon</a>
              <a href="#experience">Experience</a>
            </nav>
            <AuthNav />
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <Link href="/" className="logo footer-logo">Cinema<span>Seat</span></Link>
            <p>Big stories deserve the big screen.</p>
            <p>© 2026 CinemaSeat</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
