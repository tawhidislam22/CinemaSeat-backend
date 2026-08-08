"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const res = await fetch(`${url}/api/movies`);
        const data = await res.json();
        setMovies(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMovies();
  }, []);

  return (
    <div>
      <section style={{textAlign: 'center', padding: '80px 20px', background: 'url("https://pixner.net/boleto/demo/assets/images/banner/banner01.jpg") no-repeat center bottom', backgroundSize: 'cover'}}>
        <h1 style={{fontSize: '3.5rem', marginBottom: '20px'}}>
          BOOK YOUR<br/>
          <span style={{color: 'var(--accent-primary)'}}>TICKETS FOR MOVIES</span>
        </h1>
        <p style={{fontSize: '1.2rem'}}>Safe, secure, reliable ticketing. Your ticket to live entertainment!</p>
      </section>

      <div className="container">
        <h2 style={{marginTop: '40px'}}>MOVIES</h2>
        <p>Be sure not to miss these movies today.</p>

        {loading ? (
          <div className="spinner"></div>
        ) : (
          <div className="movie-grid">
            {movies.map(movie => (
              <div key={movie.id} className="movie-card">
                <img src={movie.poster_url} alt={movie.title} className="movie-poster" />
                <div className="movie-info">
                  <h3 className="movie-title">{movie.title}</h3>
                  <div className="flex justify-between items-center mt-4">
                    <span style={{color: 'var(--text-secondary)'}}>{movie.duration_min} min | {movie.rating}</span>
                    <Link href={`/movie/${movie.id}`} className="btn btn-secondary" style={{padding: '5px 15px'}}>
                      BOOK
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
