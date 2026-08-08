import http from 'k6/http';
import { check, sleep } from 'k6';

// 100 concurrent holds on one seat in a single burst
export const options = {
  vus: 100,
  duration: '10s',
};

// Hardcoded for testing. Must match the seed data.
const payload = JSON.stringify({
  showId: 'dddd0000-0000-0000-0000-000000000001',
  seatId: 'cccc0000-0000-0000-0000-000000000001', // Seat A1
  userId: '11111111-1111-1111-1111-111111111111',
  phone: '01711111111'
});

const params = {
  headers: {
    'Content-Type': 'application/json',
  },
};

export default function () {
  // Assuming the gateway handles routing to bookings-service
  const res = http.post('http://localhost:8080/bookings/hold', payload, params);
  
  check(res, {
    'is status 200 (Success)': (r) => r.status === 200,
    'is status 409 (Conflict)': (r) => r.status === 409,
  });
}
