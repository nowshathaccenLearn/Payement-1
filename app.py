import os
import hmac
import json
import hashlib
import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, Optional, Tuple

from flask import Flask, request, jsonify
from dotenv import load_dotenv

# Load environment variables from .env (local/dev). In production (Render),
# you set env vars in the dashboard, and this will simply do nothing.
load_dotenv()

app = Flask(__name__)

# Basic production-friendly logging (Render captures stdout/stderr).
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("razorpay-webhook")


def _get_required_env(name: str) -> str:
    """Fetch a required environment variable or raise a clear error."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def verify_razorpay_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """
    Verify Razorpay webhook signature.

    Razorpay signs the *raw request body* with HMAC SHA256 using the webhook secret.
    We must compute the expected signature and compare using constant-time comparison.
    """
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def _safe_json_loads(raw_body: bytes) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Parse JSON safely and return (payload, error_message)."""
    try:
        text = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)
        return json.loads(text or "{}"), None
    except Exception as e:
        return None, f"Invalid JSON payload: {e}"


def extract_payment_details(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract key payment fields from Razorpay webhook payload.

    Typical structure (payment.captured):
      payload.payment.entity -> { id, amount, currency, email, contact, notes, created_at, ... }
    """
    payment_entity = (
        payload.get("payload", {})
        .get("payment", {})
        .get("entity", {})
    )

    amount_paise = int(payment_entity.get("amount") or 0)
    amount_inr = amount_paise / 100
    currency = payment_entity.get("currency") or "INR"

    payment_id = payment_entity.get("id") or ""
    email = payment_entity.get("email") or ""

    # Some integrations store customer email in notes.
    notes = payment_entity.get("notes") or {}
    if not email:
        email = (notes.get("email") or "").strip()

    name = (notes.get("name") or "").strip() or "Customer"

    return {
        "payment_id": payment_id,
        "email": email,
        "name": name,
        "amount_paise": amount_paise,
        "amount_inr": amount_inr,
        "currency": currency,
        "notes": notes,
    }


def send_receipt_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    admin_cc: Optional[str] = None,
) -> None:
    """
    Send an email using SMTP.

    Configure using env vars:
      SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM

    For Gmail, use App Passwords (recommended).
    """
    smtp_host = _get_required_env("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = _get_required_env("SMTP_USER")
    smtp_pass = _get_required_env("SMTP_PASS")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    msg = EmailMessage()
    msg["From"] = smtp_from
    msg["To"] = to_email
    if admin_cc:
        msg["Cc"] = admin_cc
    msg["Subject"] = subject

    # Add both plain-text and HTML versions for best deliverability.
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    # Use STARTTLS on port 587 by default (production standard).
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)


def build_receipt_email(details: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Build a professional receipt email (subject, html, text).
    """
    amount = f"₹{details['amount_inr']:.2f}" if details["currency"] == "INR" else f"{details['amount_inr']:.2f} {details['currency']}"
    payment_id = details["payment_id"] or "N/A"
    name = details["name"] or "Customer"

    subject = "Payment Receipt - Accenlearn"

    text = (
        f"Hello {name},\n\n"
        f"Thank you for your payment.\n\n"
        f"Receipt details:\n"
        f"- Amount: {amount}\n"
        f"- Payment ID: {payment_id}\n\n"
        f"If you have any questions, please reply to this email.\n\n"
        f"Regards,\n"
        f"Accenlearn Payments\n"
    )

    html = f"""
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f3f4f6; padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,0.16);overflow:hidden;">
        <div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#f9fafb;">
          <h1 style="margin:0;font-size:20px;">Payment Receipt</h1>
          <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Your payment has been confirmed successfully.</p>
        </div>

        <div style="padding:18px 22px 8px;">
          <p style="margin:0 0 10px;font-size:14px;color:#111827;">
            Hello <strong>{name}</strong>,
          </p>
          <p style="margin:0 0 18px;font-size:13px;color:#4b5563;">
            Thank you for your payment. This email serves as your receipt.
          </p>

          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;">
            <tbody>
              <tr>
                <td style="padding:6px 4px;font-weight:600;width:40%;">Amount Paid</td>
                <td style="padding:6px 4px;">{amount}</td>
              </tr>
              <tr>
                <td style="padding:6px 4px;font-weight:600;">Payment ID</td>
                <td style="padding:6px 4px;">{payment_id}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="padding:14px 22px 18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          <p style="margin:0 0 4px;">If any of the details above are incorrect, please reply to this email.</p>
          <p style="margin:0;">Regards,<br/>Accenlearn Payments</p>
        </div>
      </div>
    </div>
    """

    return subject, html, text


@app.get("/")
def health() -> Tuple[str, int]:
    """Simple health check route for Render / uptime checks."""
    return "Webhook server running", 200


@app.post("/razorpay-webhook")
def razorpay_webhook():
    """
    Razorpay webhook endpoint.

    Steps:
    1) Read the raw request body (bytes) exactly as received.
    2) Read Razorpay signature header: X-Razorpay-Signature
    3) Verify HMAC SHA256 signature using RAZORPAY_WEBHOOK_SECRET.
    4) If valid:
       - Print "Payment Verified"
       - Log full JSON payload
       - Extract payment details
       - Email receipt to payer and CC admins (SMTP)
       - Return 200
    5) If invalid: return 400
    """
    raw_body = request.get_data(cache=False, as_text=False)  # raw bytes
    signature = request.headers.get("X-Razorpay-Signature", "")

    try:
        secret = _get_required_env("RAZORPAY_WEBHOOK_SECRET")
    except RuntimeError as e:
        logger.error(str(e))
        return jsonify({"success": False, "message": "Webhook not configured"}), 500

    if not verify_razorpay_signature(raw_body, signature, secret):
        return jsonify({"success": False, "message": "Invalid signature"}), 400

    print("Payment Verified")

    payload, err = _safe_json_loads(raw_body)
    if err:
        logger.warning(err)
        return jsonify({"success": False, "message": "Invalid JSON"}), 400

    # Log the full webhook payload for auditing/debugging.
    logger.info("Razorpay webhook payload: %s", json.dumps(payload, ensure_ascii=False))

    # Extract payment details and email a receipt.
    details = extract_payment_details(payload or {})

    payer_email = (details.get("email") or "").strip()
    if not payer_email:
        # We still return 200 (webhook is valid), but we can't email the payer.
        logger.warning("No payer email found in webhook payload; skipping receipt email.")
        return jsonify({"success": True, "emailed": False, "reason": "missing payer email"}), 200

    admin_emails = os.getenv("ADMIN_EMAILS", "").strip()
    subject, html_body, text_body = build_receipt_email(details)

    try:
        send_receipt_email(
            to_email=payer_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
            admin_cc=admin_emails or None,
        )
    except Exception as e:
        # Return 200 so Razorpay doesn't keep retrying forever,
        # but log the failure so you can investigate.
        logger.exception("Failed to send receipt email: %s", e)
        return jsonify({"success": True, "emailed": False, "reason": "email send failed"}), 200

    return jsonify({"success": True, "emailed": True}), 200


if __name__ == "__main__":
    # Render provides PORT; default for local development is 5000.
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)

