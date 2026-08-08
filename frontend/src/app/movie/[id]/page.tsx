'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

function requireArray(payload: unknown, resource: string): any[] {
  if (Array.isArray(payload)) return payload;
  const message = payload && typeof payload === 'object' && 'error' in payload
    ? String((payload as { error: unknown }).error)
    : `${resource} returned an unexpected response`;
  throw new Error(message);
}

export default function UnifiedMovieBooking() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id as string;
  
  // -- Selection State --
  const [shows, setShows] = useState<any[]>([]);
  const [loadingShows, setLoadingShows] = useState(true);
  const [showsError, setShowsError] = useState('');
  
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedTheatre, setSelectedTheatre] = useState<string | null>(null);
  const [selectedShow, setSelectedShow] = useState<any | null>(null);

  // -- Seat Map State --
  const [seats, setSeats] = useState<any[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<any | null>(null);
  const [holdingSeatId, setHoldingSeatId] = useState<string | null>(null);
  const [heldUntil, setHeldUntil] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  // -- Checkout State --
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState('01711111111');
  const [bookingRef, setBookingRef] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'HOLDING' | 'OTP' | 'PROCESSING' | 'SUCCESS'>('HOLDING');
  const [errorMsg, setErrorMsg] = useState('');
  const [amount, setAmount] = useState(0);

  // Polling interval ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const activeHoldCheckedRef = useRef(false);
  const timerText = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  // 1. Fetch all shows for the movie
  useEffect(() => {
    if (!movieId) return;
    const fetchShows = async () => {
      try {
        setShowsError('');
        const url = process.env.NEXT_PUBLIC_CATALOG_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const res = await fetch(`${url}/catalog/shows/${movieId}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${res.status}`;
          throw new Error(`Could not load showtimes: ${detail}`);
        }
        setShows(requireArray(data, 'Showtime service'));
      } catch (err) {
        console.error(err);
        setShows([]);
        setShowsError(err instanceof Error ? err.message : 'Could not load showtimes.');
      } finally {
        setLoadingShows(false);
      }
    };
    fetchShows();
  }, [movieId]);

  // Derived Selection State
  const cities = useMemo(() => {
    const uniqueCities = new Set<string>();
    shows.forEach(show => {
      if (show.city) uniqueCities.add(show.city);
      else uniqueCities.add('Dhaka');
    });
    return Array.from(uniqueCities).sort();
  }, [shows]);

  const theatresInCity = useMemo(() => {
    if (!selectedCity) return [];
    const uniqueTheatres = new Set<string>();
    shows.forEach(show => {
      const city = show.city || 'Dhaka';
      if (city === selectedCity) uniqueTheatres.add(show.theatre_name);
    });
    return Array.from(uniqueTheatres).sort();
  }, [shows, selectedCity]);

  const showsInTheatre = useMemo<Record<string, any[]>>(() => {
    if (!selectedTheatre) return {};
    const grouped: Record<string, any[]> = {};
    shows.forEach(show => {
      const city = show.city || 'Dhaka';
      if (city === selectedCity && show.theatre_name === selectedTheatre) {
        if (!grouped[show.screen_name]) grouped[show.screen_name] = [];
        grouped[show.screen_name].push(show);
      }
    });
    return grouped;
  }, [shows, selectedCity, selectedTheatre]);

  // Auto-select first available options on load
  useEffect(() => {
    if (shows.length === 0) return;
    
    if (!selectedCity && cities.length > 0) {
      const firstCity = cities[0];
      setSelectedCity(firstCity);
      
      const uniqueTheatres = Array.from(new Set(shows.filter(s => (s.city || 'Dhaka') === firstCity).map(s => s.theatre_name))).sort();
      const firstTheatre = uniqueTheatres[0];
      if (firstTheatre) {
        setSelectedTheatre(firstTheatre);
        
        const firstShow = shows.find(s => (s.city || 'Dhaka') === firstCity && s.theatre_name === firstTheatre);
        if (firstShow) {
          setSelectedShow(firstShow);
        }
      }
    }
  }, [shows, cities, selectedCity]);

  // Restore an unexpired hold after refresh so the same server countdown is
  // still visible and the user can continue checkout.
  useEffect(() => {
    if (shows.length === 0 || activeHoldCheckedRef.current) return;
    activeHoldCheckedRef.current = true;

    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    const url = process.env.NEXT_PUBLIC_BOOKINGS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    fetch(`${url}/bookings/active-hold?userId=${encodeURIComponent(user.id)}`)
      .then(res => res.ok ? res.json() : null)
      .then(activeHold => {
        if (!activeHold) return;
        setHeldUntil(activeHold.held_until);
        setPhone(user.phone);

        if (String(activeHold.movie_id) !== String(movieId)) {
          setErrorMsg('You already have a seat held for another movie. Wait for this timer to expire before selecting another seat.');
          return;
        }

        const heldShow = shows.find(show => String(show.id) === String(activeHold.show_id));
        if (!heldShow) return;
        setSelectedCity(heldShow.city || 'Dhaka');
        setSelectedTheatre(heldShow.theatre_name);
        setSelectedShow(heldShow);
        setSelectedSeat({
          seat_id: activeHold.seat_id,
          row_label: activeHold.row_label,
          seat_number: activeHold.seat_number,
          status: 'HELD'
        });
        setBookingRef(activeHold.booking_ref);
        setAmount(Number(activeHold.amount));
        setStep('OTP');
      })
      .catch(() => setErrorMsg('Could not restore your active seat hold.'));
  }, [shows, movieId]);

  // 2. Fetch seats when a show is selected
  const fetchSeats = async (showId: string) => {
    try {
      const url = process.env.NEXT_PUBLIC_SEATS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const res = await fetch(`${url}/seats/${showId}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${res.status}`;
        throw new Error(`Could not load seats: ${detail}`);
      }
      setSeats(requireArray(data, 'Seat service'));
    } catch (err) {
      console.error(err);
      setSeats([]);
      setErrorMsg(err instanceof Error ? err.message : 'Could not load seats.');
    } finally {
      setLoadingSeats(false);
    }
  };

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    if (selectedShow) {
      setLoadingSeats(true);
      fetchSeats(selectedShow.id);
      pollingRef.current = setInterval(() => fetchSeats(selectedShow.id), 5000);
    } else {
      setSeats([]);
      setSelectedSeat(null);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedShow]);

  useEffect(() => {
    if (!heldUntil || step === 'SUCCESS') return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((new Date(heldUntil).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        setHeldUntil(null);
        setSelectedSeat(null);
        setBookingRef('');
        setShowModal(false);
        setStep('HOLDING');
        setErrorMsg('Your seat hold expired. You can select a seat again.');
        if (selectedShow) fetchSeats(selectedShow.id);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 250);
    return () => clearInterval(timer);
  }, [heldUntil, step, selectedShow]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Clicking a seat immediately starts its two-minute hold.
  const handleSeatClick = async (seat: any) => {
    if (seat.status !== 'AVAILABLE' || !selectedShow || holdingSeatId) return;
    if (heldUntil && secondsRemaining > 0) {
      setErrorMsg('You already have a held seat. Complete it before choosing another seat.');
      return;
    }

    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    const user = JSON.parse(userStr);

    setSelectedSeat(seat);
    setHoldingSeatId(seat.seat_id);
    setPhone(user.phone);
    setErrorMsg('');
    setStep('HOLDING');
    setShowModal(true);
    try {
      const url = process.env.NEXT_PUBLIC_BOOKINGS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
      const res = await fetch(`${url}/bookings/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: selectedShow.id,
          seatId: seat.seat_id,
          userId: user.id,
          phone: user.phone
        })
      });
      const data = await res.json();
      if (res.status === 200) {
        setBookingRef(data.bookingRef);
        setAmount(data.amount);
        setHeldUntil(data.heldUntil);
        setResendCooldown(data.otpSent === false ? 0 : 30);
        if (data.warning) setErrorMsg(data.warning);
        setStep('OTP');
        setSeats(prev => prev.map(s => s.seat_id === seat.seat_id ? {...s, status: 'HELD', held_by: user.id, held_until: data.heldUntil} : s));
      } else {
        setSelectedSeat(null);
        setShowModal(false);
        setErrorMsg(data.error || 'Seat unavailable, someone else beat you to it!');
        fetchSeats(selectedShow.id);
      }
    } catch (err) {
      setSelectedSeat(null);
      setShowModal(false);
      setErrorMsg('Network error while holding seat');
    } finally {
      setHoldingSeatId(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return;
    setErrorMsg('');
    setStep('PROCESSING');
    try {
      const paymentsUrl = process.env.NEXT_PUBLIC_PAYMENTS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3004';
      const chargeRes = await fetch(`${paymentsUrl}/payments/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingRef, otpCode: otp })
      });
      const data = await chargeRes.json().catch(() => ({}));

      if (chargeRes.status === 202) {
        setStep('SUCCESS');
      } else {
        setErrorMsg(data.gatewayMessage || data.error || `Payment failed (${chargeRes.status})`);
        setStep('OTP');
      }
    } catch (err) {
      setErrorMsg('Error processing payment');
      setStep('OTP');
    }
  };

  const handleResendPaymentOtp = async () => {
    if (!bookingRef || resendCooldown > 0) return;
    const userStr = localStorage.getItem('user');
    if (!userStr) return router.push('/login');

    setErrorMsg('');
    try {
      const user = JSON.parse(userStr);
      const bookingsUrl = process.env.NEXT_PUBLIC_BOOKINGS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
      const response = await fetch(`${bookingsUrl}/bookings/${encodeURIComponent(bookingRef)}/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const data = await response.json();
      if (!response.ok) {
        setResendCooldown(Number(data.retryAfter) || 0);
        setErrorMsg(data.error || 'Could not resend payment OTP');
        return;
      }
      setResendCooldown(30);
    } catch {
      setErrorMsg('Network error while resending payment OTP');
    }
  };

  const seatRows = seats.reduce((acc, seat) => {
    if (!acc[seat.row_label]) acc[seat.row_label] = [];
    acc[seat.row_label].push(seat);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="container" style={{marginTop: '120px', paddingBottom: '100px'}}>
      <Link href="/" className="btn btn-secondary" style={{marginBottom: '20px', display: 'inline-block'}}>&larr; Back to Movies</Link>
      <h1 style={{marginBottom: '40px'}}>BOOK TICKETS</h1>
      {errorMsg && !showModal && <div className="alert alert-error" style={{ marginBottom: '20px' }}>{errorMsg}</div>}

      {loadingShows ? (
        <div className="spinner"></div>
      ) : showsError ? (
        <div className="alert alert-error" role="alert">{showsError}</div>
      ) : shows.length === 0 ? (
        <p>No shows available for this movie.</p>
      ) : (
        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          
          {/* LEFT PANE: Selection Flow */}
          <div style={{ flex: '1 1 300px', minWidth: '300px' }}>
            <div style={{ background: 'var(--bg-card)', padding: '25px', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.1)' }}>
              
              {/* City Selection */}
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', marginBottom: '10px' }}>1. Select City</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {cities.map(city => (
                    <button
                      key={city}
                      disabled={secondsRemaining > 0}
                      onClick={() => { 
                        setSelectedCity(city);
                        const firstTheatre = Array.from(new Set(shows.filter(s => (s.city || 'Dhaka') === city).map(s => s.theatre_name))).sort()[0];
                        setSelectedTheatre(firstTheatre);
                        const firstShow = shows.find(s => (s.city || 'Dhaka') === city && s.theatre_name === firstTheatre);
                        setSelectedShow(firstShow || null);
                      }}
                      className={selectedCity === city ? "btn btn-primary" : "btn btn-secondary"}
                      style={{ padding: '8px 15px', fontSize: '0.9rem' }}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theatre Selection */}
              {selectedCity && (
                <div style={{ marginBottom: '25px', animation: 'fadeIn 0.3s' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', marginBottom: '10px' }}>2. Select Theatre</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {theatresInCity.map(theatre => (
                      <button
                        key={theatre}
                        disabled={secondsRemaining > 0}
                        onClick={() => { 
                          setSelectedTheatre(theatre);
                          const firstShow = shows.find(s => (s.city || 'Dhaka') === selectedCity && s.theatre_name === theatre);
                          setSelectedShow(firstShow || null);
                        }}
                        className={selectedTheatre === theatre ? "btn btn-primary" : "btn btn-secondary"}
                        style={{ padding: '10px', textAlign: 'left', fontSize: '0.95rem' }}
                      >
                        {theatre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Show Selection */}
              {selectedTheatre && (
                <div style={{ animation: 'fadeIn 0.3s' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', marginBottom: '15px' }}>3. Select Show</h3>
                  {Object.keys(showsInTheatre).map(screen => (
                    <div key={screen} style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>{screen}</div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {showsInTheatre[screen].map(show => (
                          <button
                            key={show.id}
                            disabled={secondsRemaining > 0}
                            onClick={() => setSelectedShow(show)}
                            className={selectedShow?.id === show.id ? "btn btn-primary" : "btn btn-secondary"}
                            style={{ padding: '8px 12px', fontSize: '0.9rem' }}
                          >
                            {new Date(show.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* RIGHT PANE: Seat Map */}
          <div style={{ flex: '2 1 500px', minWidth: '350px' }}>
            {!selectedShow ? (
              <div className="empty-state" style={{ minHeight: '400px' }}>
                <span style={{ fontSize: '2rem', color: 'var(--accent-primary)', marginBottom: '15px' }}>🍿</span>
                <strong>Pick a showtime</strong>
                <p>Select a city, theatre, and showtime on the left to view the seat map.</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-card)', padding: '35px', borderRadius: 'var(--border-radius)', border: '1px solid rgba(255,255,255,0.1)', animation: 'fadeIn 0.4s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{selectedTheatre}</h2>
                    <p style={{ margin: 0, color: 'var(--accent-primary)' }}>{selectedShow.screen_name} • {new Date(selectedShow.start_time).toLocaleString()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>BASE PRICE</p>
                    <strong style={{ fontSize: '1.2rem', color: '#ffcc00' }}>{selectedShow.base_price} BDT</strong>
                  </div>
                </div>

                <div className="screen-curved" style={{ marginBottom: '40px' }}>SCREEN</div>

                {heldUntil && secondsRemaining > 0 && (
                  <div className="alert alert-success" style={{ marginBottom: '25px', textAlign: 'center' }}>
                    {selectedSeat ? `Seat ${selectedSeat.row_label}${selectedSeat.seat_number} is held for you.` : 'You have a seat held for another movie.'} Complete booking in{' '}
                    <strong style={{ fontSize: '1.25rem' }}>{timerText}</strong>. You cannot select another seat during this hold.
                  </div>
                )}

                {loadingSeats ? (
                  <div className="spinner"></div>
                ) : (
                  <>
                    <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '15px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', minWidth: 'max-content', margin: '0 auto' }}>
                        {Object.keys(seatRows).sort().map(rowLabel => (
                          <div key={rowLabel} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ width: '30px', fontWeight: 'bold', color: 'var(--text-secondary)', position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>{rowLabel}</span>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              {seatRows[rowLabel].sort((a:any, b:any) => a.seat_number - b.seat_number).map((seat:any) => {
                                let bgColor = 'var(--seat-available)';
                                if (seat.status === 'HELD') bgColor = 'var(--seat-held)';
                                if (seat.status === 'BOOKED') bgColor = 'var(--seat-booked)';
                                if (selectedSeat?.seat_id === seat.seat_id) bgColor = 'var(--seat-selected)';

                                return (
                                  <div 
                                    key={seat.seat_id}
                                    onClick={() => handleSeatClick(seat)}
                                    style={{
                                      width: '35px', height: '35px',
                                      background: bgColor,
                                      borderRadius: '5px 5px 10px 10px',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: (seat.status === 'AVAILABLE' && selectedSeat?.seat_id !== seat.seat_id) ? 'var(--bg-primary)' : 'white',
                                      fontWeight: 'bold', fontSize: '0.8rem',
                                      cursor: seat.status === 'AVAILABLE' && !heldUntil && !holdingSeatId ? 'pointer' : 'not-allowed',
                                      border: '2px solid rgba(0,0,0,0.2)',
                                      boxShadow: 'inset 0 -5px 10px rgba(0,0,0,0.1)'
                                    }}
                                    title={`${seat.tier} - ${seat.price_multiplier}x multiplier`}
                                  >
                                    {seat.seat_number}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '40px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}><div style={{ width: '16px', height: '16px', background: 'var(--seat-available)', borderRadius: '3px' }}></div> Available</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}><div style={{ width: '16px', height: '16px', background: 'var(--seat-selected)', borderRadius: '3px' }}></div> Selected</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}><div style={{ width: '16px', height: '16px', background: 'var(--seat-held)', borderRadius: '3px' }}></div> Held</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}><div style={{ width: '16px', height: '16px', background: 'var(--seat-booked)', borderRadius: '3px' }}></div> Booked</div>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '30px', paddingTop: '30px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <button 
                        className="btn btn-primary" 
                        disabled={!selectedSeat || !heldUntil || secondsRemaining === 0}
                        onClick={() => setShowModal(true)}
                        style={{ padding: '15px 40px', fontSize: '1.2rem', width: '100%', maxWidth: '350px' }}
                      >
                        {heldUntil ? `COMPLETE BOOKING (${selectedSeat?.row_label}${selectedSeat?.seat_number}) - ${timerText}` : 'SELECT A SEAT'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', marginBottom: '20px' }}>Checkout</h2>
            
            {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
            
            {step === 'HOLDING' && (
              <div className="text-center" style={{ padding: '40px 0' }}>
                <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
                <p>Securing your seat...</p>
              </div>
            )}

            {step === 'OTP' && (
              <div>
                <div className="alert alert-success">Seat held. Complete payment in <strong>{timerText}</strong>.</div>
                <p>Amount to pay: <strong>{amount} BDT</strong></p>
                <div className="input-group mt-4">
                  <label>Enter OTP sent to {phone}</label>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter payment OTP" />
                </div>
                <div className="flex justify-between mt-4">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
                  <button className="btn btn-primary" onClick={handleVerifyOtp}>Verify & Pay</button>
                </div>

              </div>
            )}

            {step === 'PROCESSING' && (
              <div className="text-center" style={{ padding: '40px 0' }}>
                <div className="spinner"></div>
                <p>Processing...</p>
              </div>
            )}

            {step === 'SUCCESS' && (
              <div className="text-center">
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🎉</div>
                <h3>Payment Initiated!</h3>
                <p>Your booking <strong>{bookingRef}</strong> is being processed.</p>
                <p style={{ fontSize: '0.9rem' }}>The webhook will finalize the status asynchronously.</p>
                <button className="btn btn-primary mt-4" onClick={() => {
                  setShowModal(false);
                  router.push('/dashboard');
                }}>Go to Dashboard</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
