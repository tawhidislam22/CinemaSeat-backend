"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Movie = {
  id: string | number;
  poster_url: string;
  title: string;
  duration_min: number;
  rating: string;
};

function getMovies(payload: unknown): Movie[] {
  if (Array.isArray(payload)) return payload as Movie[];
  if (payload && typeof payload === "object" && "movies" in payload) {
    const movies = (payload as { movies: unknown }).movies;
    if (Array.isArray(movies)) return movies as Movie[];
  }
  throw new Error("The cinema catalog returned an unexpected response.");
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_CATALOG_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(`${url}/catalog/movies`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`Could not load movies (${response.status}).`);
        setMovies(getMovies(await response.json()));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load movies.";
        setError(
          message === "Failed to fetch" || err instanceof DOMException
            ? "The movie service is currently offline. Start the API gateway and refresh this page."
            : message,
        );
      } finally {
        setLoading(false);
      }
    };
    fetchMovies();
  }, []);

  const visibleMovies = useMemo(
    () => movies.filter((movie) => movie.title.toLowerCase().includes(query.trim().toLowerCase())),
    [movies, query],
  );

  return (
    <>
      <section className="hero">
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="container hero-content">
          <span className="eyebrow">The cinema starts here</span>
          <h1>Make tonight<br /><span>larger than life.</span></h1>
          <p>Discover the biggest releases, choose your perfect seat, and book in a few effortless clicks.</p>
          <a href="#movies" className="btn btn-primary hero-button">Explore showtimes <span>→</span></a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="film-frame frame-one" />
          <div className="film-frame frame-two" />
          <div className="film-frame frame-three" />
          <div className="play-orbit"><span>▶</span></div>
        </div>
      </section>

      <div className="container discovery-wrap">
        <section className="discovery-panel" aria-label="Find a movie">
          <div className="discovery-heading">
            <span>Welcome</span>
            <strong>What are you watching today?</strong>
          </div>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by movie title"
              aria-label="Search by movie title"
            />
          </label>
          <a href="#movies" className="btn btn-primary search-button">Find movies</a>
        </section>
      </div>

      <section className="movie-section" id="movies">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Now showing</span>
              <h2>Movies made for the big screen</h2>
            </div>
            <div className="heading-rule" />
            <span className="result-count">{visibleMovies.length} films</span>
          </div>

          {loading ? (
            <div className="loading-state"><div className="spinner" /><p>Loading the programme…</p></div>
          ) : error ? (
            <div className="empty-state" role="alert"><strong>The projector is warming up.</strong><p>{error}</p></div>
          ) : visibleMovies.length === 0 ? (
            <div className="empty-state"><strong>No matching movies</strong><p>Try another title or clear your search.</p></div>
          ) : (
            <div className="movie-grid">
              {visibleMovies.map((movie) => (
                <article key={movie.id} className="movie-card">
                  <Link href={`/movie/${movie.id}`} className="poster-wrap" aria-label={`Book ${movie.title}`}>
                    <img src={movie.poster_url} alt={`Poster for ${movie.title}`} className="movie-poster" />
                    <span className="rating-badge">{movie.rating}</span>
                    <span className="poster-action">View showtimes</span>
                  </Link>
                  <div className="movie-info">
                    <div>
                      <h3 className="movie-title">{movie.title}</h3>
                      <p>{movie.duration_min} min · Cinema</p>
                    </div>
                    <Link href={`/movie/${movie.id}`} className="round-link" aria-label={`Book ${movie.title}`}>→</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="experience-section" id="experience">
        <div className="container experience-card">
          <div>
            <span className="eyebrow">Your perfect night out</span>
            <h2>Great films. Better seats.<br />Zero waiting in line.</h2>
          </div>
          <div className="benefit-list">
            <div><span>01</span><strong>Live seat selection</strong><p>See availability and choose together.</p></div>
            <div><span>02</span><strong>Secure checkout</strong><p>Your booking is protected end to end.</p></div>
            <div><span>03</span><strong>Instant tickets</strong><p>Walk straight in with your digital pass.</p></div>
          </div>
        </div>
      </section>
      <div id="coming-soon" />
    </>
  );
}
