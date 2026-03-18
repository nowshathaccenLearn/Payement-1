const nodemailer = require('nodemailer');
const Busboy = require('busboy');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers['content-type'] ||
      event.headers['Content-Type'] ||
      '';

    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      reject(new Error('Expected multipart/form-data'));
      return;
    }

    const bb = Busboy({ headers: { 'content-type': contentType } });

    const fields = {};
    let fileBuffer = null;
    let fileMime = null;
    let fileName = null;
    let fileSize = 0;
    let fileTooLarge = false;

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      fileName = filename || 'receipt';
      fileMime = mimeType;

      if (name !== 'receipt') {
        file.resume();
        return;
      }

      if (!ALLOWED_MIME.has((mimeType || '').toLowerCase())) {
        fileTooLarge = true; // reuse flag to stop reading further
        file.resume();
        return;
      }

      const chunks = [];
      file.on('data', (data) => {
        fileSize += data.length;
        if (fileSize > MAX_FILE_SIZE) {
          fileTooLarge = true;
          file.resume();
          return;
        }
        chunks.push(data);
      });

      file.on('end', () => {
        if (!fileTooLarge) {
          fileBuffer = Buffer.concat(chunks);
        }
      });
    });

    bb.on('error', reject);

    bb.on('finish', () => {
      if (fileTooLarge && fileSize > MAX_FILE_SIZE) {
        reject(new Error('File size must be less than 5MB.'));
        return;
      }
      resolve({ fields, fileBuffer, fileMime, fileName, fileSize });
    });

    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');

    bb.end(body);
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed' });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nowshathtech@gmail.com';
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  if (!GMAIL_USER || !GMAIL_PASS) {
    return json(500, { success: false, message: 'Email service not configured on server.' });
  }

  let parsed;
  try {
    parsed = await parseMultipart(event);
  } catch (e) {
    return json(400, { success: false, message: e.message || 'Invalid form data.' });
  }

  const name = (parsed.fields.name || '').trim();
  const email = (parsed.fields.email || '').trim();

  if (!name || !email) {
    return json(400, { success: false, message: 'Name and email are required.' });
  }

  if (!parsed.fileBuffer) {
    // Either missing receipt or wrong mimetype
    return json(400, { success: false, message: 'Receipt image is required (jpg/jpeg/png).' });
  }

  if (!ALLOWED_MIME.has((parsed.fileMime || '').toLowerCase())) {
    return json(400, { success: false, message: 'Only JPG/JPEG/PNG images are allowed.' });
  }

  const amount = '₹10';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  const attachment = {
    filename: parsed.fileName || 'receipt',
    content: parsed.fileBuffer,
    contentType: parsed.fileMime
  };

  const adminMailOptions = {
    from: `"Payment Site" <${GMAIL_USER}>`,
    to: ADMIN_EMAIL,
    subject: 'New Payment Received',
    text: `Name: ${name}\nEmail: ${email}\nAmount: ${amount}`,
    attachments: [attachment]
  };

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
    attachments: [attachment]
  };

  try {
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(clientMailOptions);
  } catch (e) {
    console.error('Email send failed:', e);
    return json(500, { success: false, message: 'Error sending email. Please try again later.' });
  }

  return json(200, {
    success: true,
    message:
      'Your receipt has been submitted successfully. A confirmation email has been sent to your email address.'
  });
};


