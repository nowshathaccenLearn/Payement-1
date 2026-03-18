const express = require('express');
const path = require('path');

/**
 * Lightweight test server for automated E2E tests.
 *
 * Why this exists:
 * - Netlify CLI can be interactive/hard to automate in CI.
 * - E2E tests need deterministic endpoints for /create-order and /verify-payment.
 * - We also mock window.Razorpay in tests to simulate a successful payment.
 */

const app = express();
app.use(express.json());

// Serve the static site exactly like production.
app.use(express.static(path.join(__dirname, 'public')));

// Stub: create an order (like the real Netlify function would).
app.post('/create-order', (req, res) => {
  const { name, email, phone, state, domain, amount } = req.body || {};
  if (!name || !email || !phone || !state || !domain) {
    return res.status(400).json({ success: false, message: 'Missing required payer details.' });
  }
  const amountPaise = Number(amount || 10) * 100;
  return res.json({
    success: true,
    keyId: 'rzp_test_AUTOMATION',
    orderId: 'order_AUTOMATION_123',
    amount: amountPaise,
    currency: 'INR'
  });
});

// Stub: verify signature (always success in automation).
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing Razorpay verification fields.' });
  }
  return res.json({ success: true });
});

// Health route for debugging.
app.get('/_test/health', (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4173);
app.listen(port, '127.0.0.1', () => {
  console.log(`Test server running on http://127.0.0.1:${port}`);
});

