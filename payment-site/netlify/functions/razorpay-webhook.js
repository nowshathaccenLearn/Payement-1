const crypto = require('crypto');
const nodemailer = require('nodemailer');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lower) return v;
  }
  return undefined;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' });
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return json(500, { success: false, message: 'Webhook not configured.' });
  }

  const signature = getHeader(event.headers, 'x-razorpay-signature');
  if (!signature) {
    return json(400, { success: false, message: 'Missing signature.' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (!timingSafeEqual(expected, String(signature))) {
    return json(401, { success: false, message: 'Invalid signature.' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch (err) {
    return json(400, { success: false, message: 'Invalid JSON payload.' });
  }

  const eventName = payload.event || '';
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;

  // We only email receipts after a captured/paid signal.
  const isCaptured =
    eventName === 'payment.captured' ||
    (paymentEntity && String(paymentEntity.status).toLowerCase() === 'captured') ||
    eventName === 'order.paid';

  if (!isCaptured) {
    return json(200, { success: true, ignored: true });
  }

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;
  if (!GMAIL_USER || !GMAIL_PASS) {
    return json(500, { success: false, message: 'Email service not configured.' });
  }

  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'accenlearn@gmail.com,lokesh@accenlearn.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const notes = paymentEntity?.notes || orderEntity?.notes || {};
  const name = (notes.name || '').trim();
  const email = (notes.email || '').trim();
  const phone = (notes.phone || '').trim();
  const state = (notes.state || '').trim();
  const domain = (notes.domain || '').trim();

  const amountPaise = Number(paymentEntity?.amount ?? orderEntity?.amount ?? 0) || 0;
  const amountInr = amountPaise / 100;
  const formattedAmount = `₹${amountInr.toLocaleString('en-IN')}`;

  const paymentId = paymentEntity?.id || '';
  const orderId = paymentEntity?.order_id || orderEntity?.id || '';
  const status = paymentEntity?.status || 'captured';

  const paidAt = paymentEntity?.created_at
    ? new Date(Number(paymentEntity.created_at) * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const receiptId = `RCPT-${Date.now()}`;

  const htmlReceipt = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f3f4f6; padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,0.16);overflow:hidden;">
        <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#f9fafb;">
          <h1 style="margin:0;font-size:20px;">Payment Receipt</h1>
          <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Thank you for your payment to Accenlearn.</p>
        </div>
        <div style="padding:18px 22px 8px;">
          <p style="margin:0 0 10px;font-size:14px;color:#111827;">
            Hello <strong>${name || 'Student'}</strong>,
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:#4b5563;">
            Your payment has been confirmed successfully.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;">
            <tbody>
              <tr><td style="padding:6px 4px;font-weight:600;width:40%;">Receipt ID</td><td style="padding:6px 4px;">${receiptId}</td></tr>
              ${name ? `<tr><td style="padding:6px 4px;font-weight:600;">Name</td><td style="padding:6px 4px;">${name}</td></tr>` : ''}
              ${email ? `<tr><td style="padding:6px 4px;font-weight:600;">Email</td><td style="padding:6px 4px;">${email}</td></tr>` : ''}
              ${phone ? `<tr><td style="padding:6px 4px;font-weight:600;">Phone</td><td style="padding:6px 4px;">${phone}</td></tr>` : ''}
              ${state ? `<tr><td style="padding:6px 4px;font-weight:600;">State</td><td style="padding:6px 4px;">${state}</td></tr>` : ''}
              ${domain ? `<tr><td style="padding:6px 4px;font-weight:600;">Domain / Interest</td><td style="padding:6px 4px;">${domain}</td></tr>` : ''}
              <tr><td style="padding:6px 4px;font-weight:600;">Amount Paid</td><td style="padding:6px 4px;">${formattedAmount}</td></tr>
              ${orderId ? `<tr><td style="padding:6px 4px;font-weight:600;">Order ID</td><td style="padding:6px 4px;">${orderId}</td></tr>` : ''}
              ${paymentId ? `<tr><td style="padding:6px 4px;font-weight:600;">Payment ID</td><td style="padding:6px 4px;">${paymentId}</td></tr>` : ''}
              <tr><td style="padding:6px 4px;font-weight:600;">Status</td><td style="padding:6px 4px;">${status}</td></tr>
              <tr><td style="padding:6px 4px;font-weight:600;">Payment Date &amp; Time</td><td style="padding:6px 4px;">${paidAt}</td></tr>
            </tbody>
          </table>
        </div>
        <div style="padding:14px 22px 18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          <p style="margin:0 0 4px;"><strong>Receipt Summary:</strong> ${formattedAmount} paid successfully.</p>
          <p style="margin:0;">Regards,<br/>Accenlearn Payments</p>
        </div>
      </div>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  const adminMail = {
    from: `"Accenlearn Payments" <${GMAIL_USER}>`,
    to: ADMIN_EMAILS.join(','),
    subject: 'Razorpay Payment – Captured',
    html: htmlReceipt
  };

  const clientMail = email
    ? {
        from: `"Accenlearn Payments" <${GMAIL_USER}>`,
        to: email,
        subject: 'Your Payment Receipt',
        html: htmlReceipt
      }
    : null;

  try {
    await transporter.sendMail(adminMail);
    if (clientMail) await transporter.sendMail(clientMail);
  } catch (err) {
    console.error('Webhook email send failed:', err);
    return json(500, { success: false, message: 'Failed to send receipt email.' });
  }

  return json(200, { success: true });
};

