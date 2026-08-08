const express = require('express');
const app = express();

app.use(express.json());

// Mock OTP Send
app.post('/otp/send', (req, res) => {
  console.log('[Mock Gateway] OTP Send requested:', req.body);
  res.json({ success: true, message: 'OTP sent successfully' });
});

// Mock OTP Verify
app.post('/otp/verify', (req, res) => {
  console.log('[Mock Gateway] OTP Verify requested:', req.body);
  res.json({ success: true, message: 'OTP verified' });
});

// Mock Payment Charge
app.post('/payments/charge', (req, res) => {
  console.log('[Mock Gateway] Payment Charge requested:', req.body);
  
  // Simulate asynchronous payment processing and webhook firing
  const { amount, callback_url, booking_ref } = req.body;
  
  // Return immediate acknowledgment
  res.json({ success: true, transactionId: 'txn_' + Date.now(), payment_id: 'pay_' + Date.now() });

  // Fire webhook after 2 seconds to the callback URL
  if (callback_url) {
    setTimeout(async () => {
      try {
        console.log(`[Mock Gateway] Firing webhook to ${callback_url}`);
        await fetch(callback_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: 'evt_' + Date.now(),
            booking_ref: booking_ref,
            payment_id: 'pay_' + Date.now(),
            status: 'SUCCEEDED',
            amount: amount
          })
        });
      } catch (err) {
        console.error(`[Mock Gateway] Webhook failed to send: ${err.message}`);
      }
    }, 2000);
  }
});

const PORT = 9000;
app.listen(PORT, () => {
  console.log(`[Mock Gateway] Polyfill running on port ${PORT}`);
});
