const crypto = require('crypto');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return json(500, { success: false, message: 'Payment verification not configured.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, message: 'Invalid JSON payload.' });
  }

  const orderId = String(payload.razorpay_order_id || '');
  const paymentId = String(payload.razorpay_payment_id || '');
  const signature = String(payload.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    return json(400, { success: false, message: 'Missing Razorpay verification fields.' });
  }

  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  if (!timingSafeEqual(expected, signature)) {
    return json(401, { success: false, message: 'Invalid payment signature.' });
  }

  return json(200, { success: true });
};

