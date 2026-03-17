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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, {
      success: false,
      message: 'Method not allowed'
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, {
      success: false,
      message: 'Invalid JSON payload.'
    });
  }

  const {
    name,
    email,
    amount = 1,
    upiTransactionId,
    state,
    domain,
    phone
  } = payload || {};

  if (!name || !email || !upiTransactionId) {
    return json(400, {
      success: false,
      message: 'Name, email, and UPI Transaction ID are required.'
    });
  }

  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'accenlearn@gmail.com,lokesh@accenlearn.com')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  if (!GMAIL_USER || !GMAIL_PASS) {
    return json(500, {
      success: false,
      message: 'Email service is not configured. Please contact support.'
    });
  }

  const adminUpiId = 'lwaran468-3@okhdfcbank';
  const paidAmount = Number(amount) || 1;
  const formattedAmount = `₹${paidAmount.toLocaleString('en-IN')}`;

  const paidAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
  });

  const paymentStatus = 'Completed';
  const receiptId = `RCPT-${Date.now()}`;

  const htmlReceipt = `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f3f4f6; padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,0.16);overflow:hidden;">
          <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#f9fafb;">
            <h1 style="margin:0;font-size:20px;">UPI Payment Receipt</h1>
            <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Thank you for your payment to Accenlearn.</p>
          </div>
          <div style="padding:18px 22px 8px;">
            <p style="margin:0 0 10px;font-size:14px;color:#111827;">
              Hello <strong>${name}</strong>,
            </p>
            <p style="margin:0 0 18px;font-size:13px;color:#4b5563;">
              This is a confirmation of the UPI payment you initiated. Our team will verify the transaction and update your enrollment status shortly.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;">
              <tbody>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;width:40%;">Receipt ID</td>
                  <td style="padding:6px 4px;">${receiptId}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;width:40%;">Name</td>
                  <td style="padding:6px 4px;">${name}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">Email</td>
                  <td style="padding:6px 4px;">${email}</td>
                </tr>
                ${phone ? `<tr><td style="padding:6px 4px;font-weight:600;">Phone</td><td style="padding:6px 4px;">${phone}</td></tr>` : ''}
                ${state ? `<tr><td style="padding:6px 4px;font-weight:600;">State</td><td style="padding:6px 4px;">${state}</td></tr>` : ''}
                ${domain ? `<tr><td style="padding:6px 4px;font-weight:600;">Domain / Interest</td><td style="padding:6px 4px;">${domain}</td></tr>` : ''}
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">Amount Paid</td>
                  <td style="padding:6px 4px;">${formattedAmount}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">UPI Transaction ID</td>
                  <td style="padding:6px 4px;">${upiTransactionId}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">Admin UPI ID</td>
                  <td style="padding:6px 4px;">${adminUpiId}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">Payment Date &amp; Time</td>
                  <td style="padding:6px 4px;">${paidAt}</td>
                </tr>
                <tr>
                  <td style="padding:6px 4px;font-weight:600;">Payment Status</td>
                  <td style="padding:6px 4px;">${paymentStatus}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="padding:14px 22px 18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
            <p style="margin:0 0 4px;"><strong>Receipt Summary:</strong> ${formattedAmount} paid via UPI to ${adminUpiId}.</p>
            <p style="margin:0 0 4px;">If any of the details above are incorrect, please reply to this email.</p>
            <p style="margin:0;">Regards,<br/>Accenlearn Payments</p>
          </div>
        </div>
      </div>
    `;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS
    }
  });

  const adminMail = {
    from: `"Accenlearn Payments" <${GMAIL_USER}>`,
    to: ADMIN_EMAILS.join(','),
    subject: 'New UPI Payment – Completed',
    html: htmlReceipt
  };

  const clientMail = {
    from: `"Accenlearn Payments" <${GMAIL_USER}>`,
    to: email,
    subject: 'Your UPI Payment Receipt – Completed',
    html: htmlReceipt
  };

  try {
    await transporter.sendMail(adminMail);
    await transporter.sendMail(clientMail);
  } catch (err) {
    console.error('Error in /upi-confirm function:', err);
    return json(500, {
      success: false,
      message: 'Failed to send payment receipt. Please try again later.'
    });
  }

  return json(200, {
    success: true,
    message: 'Payment receipt has been emailed to you and the admin.'
  });
};

