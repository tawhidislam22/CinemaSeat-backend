"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Movie = {
  id: string | number;
  poster_url: string;
  title: string;
  duration_min: number;
  rating: string;
};

function getMovies(payload: unknown): Movie[] {
  if (Array.isArray(payload)) return payload as Movie[];

  if (payload && typeof payload === 'object' && 'movies' in payload) {
    const movies = (payload as { movies: unknown }).movies;
    if (Array.isArray(movies)) return movies as Movie[];
  }

  throw new Error('The catalog returned an invalid movies response.');
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_CATALOG_URL || 'http://localhost:3001';
        const res = await fetch(`${url}/catalog/movies`);
        if (!res.ok) {
          throw new Error(`Could not load movies (${res.status}).`);
        }

        const data: unknown = await res.json();
        setMovies(getMovies(data));
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Could not load movies.');
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
        ) : error ? (
          <p role="alert">{error}</p>
        ) : movies.length === 0 ? (
          <p>No movies are currently available.</p>
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
