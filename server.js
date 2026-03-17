require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');

const app = express();
// Use 3001 by default to avoid conflicts with other apps that may already use 3000
const PORT = process.env.PORT || 3001;

// ---- CONFIG ----
const ADMIN_EMAILS = ['accenlearn@gmail.com', 'lokesh@accenlearn.com'];
const GMAIL_USER = process.env.GMAIL_USER;   // your Gmail address
const GMAIL_PASS = process.env.GMAIL_PASS;   // app password or Gmail password (if allowed)

// Basic validation of env vars
if (!GMAIL_USER || !GMAIL_PASS) {
  console.warn('WARNING: GMAIL_USER or GMAIL_PASS not set in .env');
}

// ---- GLOBAL MIDDLEWARE ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- STATIC FILES ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- MULTER SETUP ----
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const safeName =
      file.fieldname +
      '-' +
      Date.now() +
      '-' +
      Math.round(Math.random() * 1e9) +
      ext;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png/;
  const mimetypeOk = allowed.test(file.mimetype.toLowerCase());
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  if (mimetypeOk && extOk) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png) are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('receipt');

// ---- EMAIL TRANSPORTER ----
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

// ---- ROUTES ----
app.post('/upi-confirm', async (req, res) => {
  try {
    const { name, email, amount = 1, upiTransactionId, state, domain, phone } = req.body || {};

    if (!name || !email || !upiTransactionId) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and UPI Transaction ID are required.'
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

    await transporter.sendMail(adminMail);
    await transporter.sendMail(clientMail);

    return res.json({
      success: true,
      message: 'Payment receipt has been emailed to you and the admin.'
    });
  } catch (err) {
    console.error('Error in /upi-confirm:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to send payment receipt. Please try again later.'
    });
  }
});

app.post('/submit-payment', (req, res) => {
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors (like file too large)
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size must be less than 5MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      // Other errors
      return res.status(400).json({ success: false, message: err.message });
    }

    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Receipt image is required.' });
    }

    const receiptPath = req.file.path;
    const receiptFilename = req.file.filename;

    // Prepare emails
    const amount = '₹1';

    // Email 1 – Admin Notification
    const adminMailOptions = {
      from: `"Payment Site" <${GMAIL_USER}>`,
      to: ADMIN_EMAILS.join(','),
      subject: 'New Payment Received',
      text: `Name: ${name}\nEmail: ${email}\nAmount: ${amount}`,
      attachments: [
        {
          filename: receiptFilename,
          path: receiptPath
        }
      ]
    };

    // Email 2 – Client Confirmation
    const clientMailOptions = {
      from: `"Payment Support Team" <${GMAIL_USER}>`,
      to: email,
      subject: 'Payment Received – Confirmation',
      text:
        `Hello ${name},\n\n` +
        `Thank you for your payment.\n\n` +
        `We have received your payment submission for ${amount}.\n` +
        `Our team will verify your payment shortly.\n\n` +
        `Attached is the receipt you submitted.\n\n` +
        `Thank you.\n\n` +
        `Best regards\n` +
        `Payment Support Team`,
      attachments: [
        {
          filename: receiptFilename,
          path: receiptPath
        }
      ]
    };

    try {
      await transporter.sendMail(adminMailOptions);
      await transporter.sendMail(clientMailOptions);

      return res.json({
        success: true,
        message:
          'Your receipt has been submitted successfully. A confirmation email has been sent to your email address.'
      });
    } catch (emailErr) {
      console.error('Error sending email:', emailErr);
      return res.status(500).json({
        success: false,
        message: 'Error sending email. Please try again later.'
      });
    }
  });
});

// ---- START SERVER ----
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


