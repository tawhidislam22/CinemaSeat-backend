'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';

interface Ticket {
  id: string;
  booking_ref: string;
  status: string;
  amount: string;
  created_at: string;
  start_time: string;
  movie_title: string;
  poster_url: string;
  row_label: string;
  seat_number: number;
  tier: string;
  theatre_name: string;
  screen_name: string;
}

export default function Dashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!userData || !token) {
      router.push('/login');
      return;
    }

    async function fetchTickets() {
      try {
        const user = JSON.parse(userData as string) as { id: string };
        const url = process.env.NEXT_PUBLIC_BOOKINGS_URL || 'http://localhost:3003';
        const response = await fetch(`${url}/bookings/my-tickets?userId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
          return;
        }
        if (!response.ok) throw new Error(`Could not load tickets (${response.status}).`);

        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('The booking service returned an invalid response.');
        setTickets(data as Ticket[]);
      } catch (err) {
        console.error('Failed to load tickets', err);
        setError(err instanceof Error ? err.message : 'Could not load your tickets.');
      } finally {
        setLoading(false);
      }
    }

    fetchTickets();
    const interval = setInterval(fetchTickets, 3000);
    return () => clearInterval(interval);
  }, [router]);

  const handleDownloadTicket = async (ticketId: string, movieTitle: string) => {
    const element = document.getElementById(`ticket-${ticketId}`);
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, { backgroundColor: '#001232', scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${movieTitle.replace(/\s+/g, '_')}_Ticket.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download ticket', err);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="container dashboard-hero-inner">
          <div>
            <span className="eyebrow">Your cinema wallet</span>
            <h1>My tickets</h1>
            <p>Everything you need for your next screening, all in one place.</p>
          </div>
          <div className="dashboard-stat">
            <strong>{tickets.length.toString().padStart(2, '0')}</strong>
            <span>active tickets</span>
          </div>
        </div>
      </section>

      <section className="dashboard-content container">
        {loading ? (
          <div className="dashboard-status"><div className="spinner" /><p>Preparing your tickets…</p></div>
        ) : error ? (
          <div className="dashboard-status dashboard-error" role="alert">
            <span className="status-icon">!</span>
            <h2>We couldn’t open your wallet</h2>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="empty-wallet">
            <div className="empty-ticket-art" aria-hidden="true">
              <div className="empty-ticket-back" />
              <div className="empty-ticket-front"><span>CS</span><i /></div>
              <div className="empty-ticket-orbit" />
            </div>
            <div className="empty-wallet-copy">
              <span className="eyebrow">Your first story awaits</span>
              <h2>No tickets in your wallet yet.</h2>
              <p>Browse what’s playing, pick the perfect seats, and your digital ticket will appear here instantly.</p>
              <Link href="/" className="btn btn-primary">Discover movies <span>→</span></Link>
            </div>
          </div>
        ) : (
          <>
            <div className="dashboard-section-heading">
              <div><span className="eyebrow">Ready when you are</span><h2>Upcoming screenings</h2></div>
              <Link href="/" className="text-link">Book another film →</Link>
            </div>
            <div className="tickets-list">
              {tickets.map((ticket) => (
                <article id={`ticket-${ticket.id}`} key={ticket.id} className="cinema-ticket">
                  <img src={ticket.poster_url} alt="" className="cinema-ticket-poster" crossOrigin="anonymous" />
                  <div className="cinema-ticket-main">
                    <div className="ticket-topline">
                      <span className="status-badge confirmed">{ticket.status || 'Confirmed'}</span>
                      <span className="booking-reference">REF {ticket.booking_ref}</span>
                    </div>
                    <h2>{ticket.movie_title}</h2>
                    <p className="screening-date">{new Date(ticket.start_time).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} <strong>·</strong> {new Date(ticket.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
                    <p className="ticket-location">{ticket.theatre_name} · {ticket.screen_name}</p>
                    <div className="ticket-facts">
                      <div><span>Row</span><strong>{ticket.row_label}</strong></div>
                      <div><span>Seat</span><strong>{ticket.seat_number}</strong></div>
                      <div><span>Tier</span><strong>{ticket.tier}</strong></div>
                      <div><span>Paid</span><strong>৳{Number(ticket.amount).toFixed(2)}</strong></div>
                    </div>
                  </div>
                  <div className="cinema-ticket-stub">
                    <div className="qr-frame">
                      <QRCodeSVG value={ticket.booking_ref} size={116} bgColor="#ffffff" fgColor="#001232" level="H" />
                    </div>
                    <span>Scan at entrance</span>
                    <button 
                      onClick={() => handleDownloadTicket(ticket.id, ticket.movie_title)} 
                      className="btn btn-secondary" 
                      style={{ marginTop: '15px', padding: '8px 12px', fontSize: '0.75rem' }}
                    >
                      ↓ Download Ticket
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
