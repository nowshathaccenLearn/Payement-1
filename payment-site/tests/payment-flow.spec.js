const { test, expect } = require('@playwright/test');

/**
 * These tests validate the full UI flow:
 * - Step navigation (Details -> Payment)
 * - Form validation
 * - "Pay Now" triggers create-order, opens Razorpay, verifies payment
 *
 * We do NOT hit real Razorpay in automation:
 * - /create-order and /verify-payment are stubbed by test-server.js
 * - window.Razorpay is mocked to call the handler immediately
 */

function installRazorpayMock(page) {
  // Ensure this runs before site JS so the "typeof window.Razorpay" check passes.
  return page.addInitScript(() => {
    window.Razorpay = function Razorpay(options) {
      return {
        open: () => {
          // Simulate a successful payment callback from Razorpay Checkout.
          options.handler({
            razorpay_order_id: options.order_id || 'order_AUTOMATION_123',
            razorpay_payment_id: 'pay_AUTOMATION_123',
            razorpay_signature: 'sig_AUTOMATION_123'
          });
        }
      };
    };
  });
}

async function blockRealRazorpayCheckout(page) {
  // Prevent the real checkout.js from overwriting our mock in automation.
  await page.route('https://checkout.razorpay.com/v1/checkout.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: ''
    });
  });
}

test('shows validation error if required fields missing', async ({ page }) => {
  await blockRealRazorpayCheckout(page);
  await installRazorpayMock(page);
  await page.goto('/');

  await page.getByRole('button', { name: /proceed to payment/i }).click();
  await page.getByRole('button', { name: /pay now/i }).click();

  await expect(page.locator('#message')).toContainText(/please fill name, email, phone, state, and domain/i);
});

test('successful payment flow shows verified message', async ({ page }) => {
  await blockRealRazorpayCheckout(page);
  await installRazorpayMock(page);
  await page.goto('/');

  await page.getByRole('button', { name: /proceed to payment/i }).click();

  await page.fill('#payerName', 'Test User');
  await page.fill('#payerEmail', 'test@example.com');
  await page.fill('#payerPhone', '9876543210');
  await page.fill('#payerState', 'Maharashtra');
  await page.selectOption('#payerDomain', { label: 'Data Science' });

  await page.getByRole('button', { name: /pay now/i }).click();

  // The flow is async: create-order -> Razorpay handler -> verify-payment -> success message.
  await expect(page.locator('#message')).toContainText(/payment verified successfully/i);
});

