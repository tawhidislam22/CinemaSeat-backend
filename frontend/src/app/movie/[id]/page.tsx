"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function MovieDetails() {
  const params = useParams();
  const movieId = params.id as string;
  const [shows, setShows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!movieId) return;
    const fetchShows = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const res = await fetch(`${url}/api/shows/${movieId}`);
        const data = await res.json();
        setShows(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchShows();
  }, [movieId]);

  // Group shows by date/theatre for a real app, but for hackathon we'll just list them.
  return (
    <div className="container" style={{marginTop: '40px'}}>
      <Link href="/" style={{color: 'var(--accent-primary)', marginBottom: '20px', display: 'inline-block'}}>&larr; Back to Movies</Link>
      <h1>SHOWTIMES</h1>
      
      {loading ? (
        <div className="spinner"></div>
      ) : shows.length === 0 ? (
        <p>No shows available for this movie.</p>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
          {shows.map(show => (
            <div key={show.id} style={{
              background: 'var(--bg-card)', 
              padding: '20px', 
              borderRadius: 'var(--border-radius)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{margin: '0 0 5px 0'}}>{show.theatre_name}</h3>
                <p style={{margin: 0, color: 'var(--accent-primary)'}}>{show.screen_name}</p>
                <div style={{marginTop: '10px', fontSize: '1.2rem', fontWeight: 'bold'}}>
                  {new Date(show.start_time).toLocaleString()}
                </div>
                <div style={{marginTop: '5px'}}>
                  Base Price: {show.base_price} BDT
                </div>
              </div>
              <Link href={`/show/${show.id}`} className="btn btn-primary">
                SELECT SEATS
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
