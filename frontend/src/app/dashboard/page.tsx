'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

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
  const router = useRouter();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!userStr || !token) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);

    async function fetchTickets() {
      try {
        const url = process.env.NEXT_PUBLIC_BOOKINGS_URL || 'http://localhost:3003';
        const res = await fetch(`${url}/bookings/my-tickets?userId=${user.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          setTickets(data);
        } else if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
        }
      } catch (err) {
        console.error('Failed to load tickets', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTickets();
  }, [router]);

  if (loading) {
    return <div className="loading">Loading your tickets...</div>;
  }

  return (
    <div className="dashboard-container">
      <h1>My Tickets</h1>
      
      {tickets.length === 0 ? (
        <div className="no-tickets">
          <p>You haven't booked any tickets yet.</p>
          <button className="btn-primary" onClick={() => router.push('/')}>Browse Movies</button>
        </div>
      ) : (
        <div className="tickets-grid">
          {tickets.map(ticket => (
            <div key={ticket.id} className="ticket-card">
              <div className="ticket-header">
                <img src={ticket.poster_url} alt={ticket.movie_title} className="ticket-poster" />
                <div className="ticket-movie-info">
                  <h2>{ticket.movie_title}</h2>
                  <p className="ticket-time">{new Date(ticket.start_time).toLocaleString()}</p>
                  <p className="ticket-venue">{ticket.theatre_name} • {ticket.screen_name}</p>
                </div>
              </div>
              
              <div className="ticket-body">
                <div className="seat-details">
                  <div className="detail-box">
                    <span>Row</span>
                    <strong>{ticket.row_label}</strong>
                  </div>
                  <div className="detail-box">
                    <span>Seat</span>
                    <strong>{ticket.seat_number}</strong>
                  </div>
                  <div className="detail-box">
                    <span>Tier</span>
                    <strong>{ticket.tier}</strong>
                  </div>
                </div>
                
                <div className="qr-container">
                  <QRCodeSVG 
                    value={ticket.booking_ref} 
                    size={150} 
                    bgColor={"#ffffff"}
                    fgColor={"#000000"}
                    level={"H"}
                  />
                  <p className="ref-text">{ticket.booking_ref}</p>
                </div>
              </div>
              <div className="ticket-footer">
                <span className="status-badge confirmed">CONFIRMED</span>
                <span className="ticket-price">BDT {parseFloat(ticket.amount).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
