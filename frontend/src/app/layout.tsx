import type { Metadata } from "next";
import "./globals.css";
import AuthNav from "./components/AuthNav";

export const metadata: Metadata = {
  title: "CinemaSeat | Ticket Booking",
  description: "Book your tickets for movies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="header container">
          <div className="logo">
            <span>🎟️</span> MovTic
          </div>
          <nav style={{display: 'flex', gap: '20px'}}>
            <a href="/">MOVIES</a>
            <a href="#">EVENTS</a>
            <a href="#">SPORTS</a>
          </nav>
          <AuthNav />
        </header>
        <main>{children}</main>
        <footer className="container" style={{marginTop: '50px', padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center'}}>
          <p>© 2026 CinemaSeat. Designed for the hackathon.</p>
        </footer>
      </body>
    </html>
  );
}
