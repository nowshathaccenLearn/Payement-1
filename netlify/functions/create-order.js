const Razorpay = require('razorpay');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return json(500, { success: false, message: 'Payment service not configured.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, message: 'Invalid JSON payload.' });
  }

  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim();
  const phone = (payload.phone || '').trim();
  const state = (payload.state || '').trim();
  const domain = (payload.domain || '').trim();

  if (!name || !email || !phone || !state || !domain) {
    return json(400, { success: false, message: 'Missing required payer details.' });
  }

  const amountPaise = 1000; // ₹10

  const razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });

  let order;
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        name,
        email,
        phone,
        state,
        domain
      }
    });
  } catch (err) {
    console.error('Razorpay create order failed:', err);
    return json(502, { success: false, message: 'Failed to create payment order.' });
  }

  return json(200, {
    success: true,
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency
  });
};

