"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

const USER_ID = '11111111-1111-1111-1111-111111111111'; // Hardcoded for hackathon

export default function SeatSelection() {
  const params = useParams();
  const router = useRouter();
  const showId = params.id as string;
  const [seats, setSeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeat, setSelectedSeat] = useState<any | null>(null);
  
  // Checkout State
  const [showModal, setShowModal] = useState(false);
  const [phone, setPhone] = useState('01711111111');
  const [bookingRef, setBookingRef] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'PROCESSING' | 'SUCCESS'>('PHONE');
  const [errorMsg, setErrorMsg] = useState('');
  const [amount, setAmount] = useState(0);

  const fetchSeats = async () => {
    try {
      const url = process.env.NEXT_PUBLIC_SEATS_URL || 'http://localhost:3002';
      const res = await fetch(`${url}/seats/${showId}`);
      const data = await res.json();
      setSeats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showId) return;
    fetchSeats();
    
    // Poll for live seat map updates (every 5 seconds)
    const interval = setInterval(fetchSeats, 5000);
    return () => clearInterval(interval);
  }, [showId]);

  const handleSeatClick = (seat: any) => {
    if (seat.status !== 'AVAILABLE') return;
    setSelectedSeat(seat);
  };

  const handleHoldSeat = async () => {
    if (!selectedSeat) return;
    
    // Check if user is logged in
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    const user = JSON.parse(userStr);

    setStep('HOLDING');
    try {
      const url = process.env.NEXT_PUBLIC_BOOKINGS_URL || 'http://localhost:3003';
      const res = await fetch(`${url}/bookings/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          seatId: selectedSeat.seat_id,
          userId: user.id, // Use actual user ID
          phone: user.phone // Use actual user phone
        })
      });
      const data = await res.json();
      if (res.status === 200) {
        setBookingRef(data.bookingRef);
        setAmount(data.amount);
        setStep('OTP');
        // update local state instantly
        setSeats(prev => prev.map(s => s.seat_id === selectedSeat.seat_id ? {...s, status: 'HELD'} : s));
      } else {
        setStep('PHONE');
        setErrorMsg(data.error || 'Seat unavailable, someone else beat you to it!');
        fetchSeats(); // refresh to show it taken
      }
    } catch (err) {
      setStep('PHONE');
      setErrorMsg('Network error while holding seat');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) return;
    setErrorMsg('');
    setStep('PROCESSING');
    try {
      const otpUrl = process.env.NEXT_PUBLIC_OTP_URL || 'http://localhost:3005';
      const res = await fetch(`${otpUrl}/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: bookingRef, code: otp })
      });
      const data = await res.json();
      if (res.status === 200) {
        const paymentsUrl = process.env.NEXT_PUBLIC_PAYMENTS_URL || 'http://localhost:3004';
        const chargeRes = await fetch(`${paymentsUrl}/payments/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingRef })
        });
        
        if (chargeRes.status === 202) {
          setStep('SUCCESS');
        } else {
          setErrorMsg('Payment gateway failed');
          setStep('OTP');
        }
      } else {
        setErrorMsg(data.error || 'Invalid OTP');
        setStep('OTP');
      }
    } catch (err) {
      setErrorMsg('Error verifying OTP');
      setStep('OTP');
    }
  };

  // Group seats by row
  const rows = seats.reduce((acc, seat) => {
    if (!acc[seat.row_label]) acc[seat.row_label] = [];
    acc[seat.row_label].push(seat);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="container" style={{marginTop: '40px', paddingBottom: '100px'}}>
      <button onClick={() => router.back()} className="btn btn-secondary" style={{marginBottom: '20px'}}>
        &larr; Back
      </button>

      <h1 className="text-center">SELECT SEAT</h1>

      <div className="screen-curved">SCREEN</div>

      {loading ? (
        <div className="spinner"></div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px'}}>
          {Object.keys(rows).sort().map(rowLabel => (
            <div key={rowLabel} style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
              <span style={{width: '30px', fontWeight: 'bold', color: 'var(--text-secondary)'}}>{rowLabel}</span>
              <div style={{display: 'flex', gap: '10px'}}>
                {rows[rowLabel].sort((a:any,b:any) => a.seat_number - b.seat_number).map((seat:any) => {
                  let bgColor = 'var(--seat-available)';
                  if (seat.status === 'HELD') bgColor = 'var(--seat-held)';
                  if (seat.status === 'BOOKED') bgColor = 'var(--seat-booked)';
                  if (selectedSeat?.seat_id === seat.seat_id) bgColor = 'var(--seat-selected)';

                  return (
                    <div 
                      key={seat.seat_id}
                      onClick={() => handleSeatClick(seat)}
                      style={{
                        width: '35px',
                        height: '35px',
                        background: bgColor,
                        borderRadius: '5px 5px 10px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: (seat.status === 'AVAILABLE' && selectedSeat?.seat_id !== seat.seat_id) ? 'var(--bg-primary)' : 'white',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        cursor: seat.status === 'AVAILABLE' ? 'pointer' : 'not-allowed',
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
      )}

      {/* Legend */}
      <div style={{display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '40px'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '20px', height: '20px', background: 'var(--seat-available)', borderRadius: '3px'}}></div> Available</div>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '20px', height: '20px', background: 'var(--seat-selected)', borderRadius: '3px'}}></div> Selected</div>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '20px', height: '20px', background: 'var(--seat-held)', borderRadius: '3px'}}></div> Held</div>
        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}><div style={{width: '20px', height: '20px', background: 'var(--seat-booked)', borderRadius: '3px'}}></div> Booked</div>
      </div>

      <div style={{textAlign: 'center', marginTop: '40px'}}>
        <button 
          className="btn btn-primary" 
          disabled={!selectedSeat}
          onClick={() => setShowModal(true)}
          style={{padding: '15px 40px', fontSize: '1.2rem'}}
        >
          PROCEED {selectedSeat && `(${selectedSeat.row_label}${selectedSeat.seat_number})`}
        </button>
      </div>

      {/* Checkout Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', marginBottom: '20px'}}>Checkout</h2>
            
            {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
            
            {step === 'PHONE' && (
              <div>
                <p>Holding seat <strong>{selectedSeat?.row_label}{selectedSeat?.seat_number}</strong></p>
                <div className="alert alert-success mt-4">
                  We will send an OTP to your registered phone number.
                </div>
                <div className="flex justify-between mt-4">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleHoldSeat}>Hold Seat & Send OTP</button>
                </div>
              </div>
            )}

            {step === 'OTP' && (
              <div>
                <div className="alert alert-success">Seat Held! You have 2 minutes to complete payment.</div>
                <p>Amount to pay: <strong>{amount} BDT</strong></p>
                <div className="input-group mt-4">
                  <label>Enter OTP sent to {phone}</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter code (mock: any)" />
                </div>
                <div className="flex justify-between mt-4">
                  <button className="btn btn-secondary" onClick={() => setStep('PHONE')}>Back</button>
                  <button className="btn btn-primary" onClick={handleVerifyOtp}>Verify & Pay</button>
                </div>
              </div>
            )}

            {step === 'PROCESSING' && (
              <div className="text-center" style={{padding: '40px 0'}}>
                <div className="spinner"></div>
                <p>Processing...</p>
              </div>
            )}

            {step === 'SUCCESS' && (
              <div className="text-center">
                <div style={{fontSize: '4rem', marginBottom: '20px'}}>🎉</div>
                <h3>Payment Initiated!</h3>
                <p>Your booking <strong>{bookingRef}</strong> is being processed.</p>
                <p style={{fontSize: '0.9rem'}}>The webhook will finalize the status asynchronously.</p>
                <button className="btn btn-primary mt-4" onClick={() => {
                  setShowModal(false);
                  router.push('/dashboard');
                }}>Return Home</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
