document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  const card = document.querySelector('.card');
  const stepCompany = document.getElementById('step-company');
  const stepPayment = document.getElementById('step-payment');
  const nextButton = document.getElementById('next-button');
  const backButton = document.getElementById('back-button');
  const payToggleButton = document.getElementById('pay-toggle-button');
  const confirmSection = document.getElementById('confirm-section');

  const messageEl = document.getElementById('message');
  const paymentDetailsForm = document.getElementById('payment-details-form');
  const UPI_RETURN_FLAG = 'upi_return_pending';

  const showStep = (step) => {
    const showCompany = step === 'company';
    stepCompany.classList.toggle('hidden', !showCompany);
    stepPayment.classList.toggle('hidden', showCompany);
    stepPayment.setAttribute('aria-hidden', String(showCompany));
    card?.classList.toggle('company-mode', showCompany);
    container?.classList.toggle('company-layout', showCompany);

    if (!showCompany) {
      messageEl.textContent = '';
      messageEl.classList.remove('success', 'error');
      stepPayment.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      stepCompany.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  nextButton?.addEventListener('click', () => showStep('payment'));
  backButton?.addEventListener('click', () => showStep('company'));
  showStep('company');

  payToggleButton?.addEventListener('click', async () => {
    const name = document.getElementById('payerName')?.value?.trim() || '';
    const email = document.getElementById('payerEmail')?.value?.trim() || '';
    const phone = document.getElementById('payerPhone')?.value?.trim() || '';
    const state = document.getElementById('payerState')?.value?.trim() || '';
    const domain = document.getElementById('payerDomain')?.value || '';

    if (!name || !email || !phone || !state || !domain) {
      showMessage('Please fill Name, Email, Phone, State, and Domain before paying.', 'error');
      return;
    }

    const amount = 10;

    if (typeof window.Razorpay !== 'function') {
      showMessage('Payment system is still loading. Please wait 2 seconds and try again.', 'error');
      return;
    }

    payToggleButton.disabled = true;
    showMessage('Opening secure payment…', 'success');

    let order;
    try {
      const response = await fetch('/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          state,
          domain,
          amount
        })
      });
      order = await response.json();
      if (!response.ok || !order?.success) {
        let errorMsg = order?.message || 'Failed to start payment. Please try again.';
        
        // Handle specific error codes from backend
        if (order?.error === 'MISSING_CREDENTIALS') {
          errorMsg = '⚠️ Payment service not configured. Please contact admin to set up Razorpay credentials.';
        } else if (order?.error === 'AUTH_FAILED') {
          errorMsg = '⚠️ Payment gateway authentication failed. Please contact support.';
        } else if (order?.error === 'NETWORK_ERROR') {
          errorMsg = '🌐 Network error. Please check your internet connection and try again.';
        } else if (response.status === 502) {
          errorMsg = '⚠️ Payment gateway temporarily unavailable. Please try again in a few minutes.';
        }
        
        showMessage(errorMsg, 'error');
        payToggleButton.disabled = false;
        return;
      }
    } catch (err) {
      console.error(err);
      showMessage('Network error while starting payment. Please try again.', 'error');
      payToggleButton.disabled = false;
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Accenlearn',
      description: 'Skill Booster Payment',
      prefill: {
        name,
        email,
        contact: phone
      },
      notes: {
        name,
        email,
        phone,
        state,
        domain
      },
      handler: async function (response) {
        try {
          const verifyRes = await fetch('/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          const verifyData = await verifyRes.json().catch(() => ({}));
          if (!verifyRes.ok || !verifyData?.success) {
            showMessage(verifyData?.message || 'Payment verification failed. Please contact support.', 'error');
            payToggleButton.disabled = false;
            return;
          }

          // Webhook will email receipt after capture confirmation.
          showMessage('Payment verified successfully. Receipt will be emailed shortly.', 'success');
          confirmSection?.classList.add('hidden');
          payToggleButton.disabled = false;
          try {
            localStorage.removeItem(UPI_RETURN_FLAG);
          } catch {}
        } catch (err) {
          console.error(err);
          showMessage('Network error during verification. Please contact support if amount was deducted.', 'error');
          payToggleButton.disabled = false;
        }
      },
      modal: {
        ondismiss: function () {
          showMessage('Payment was cancelled/closed. You can try again.', 'error');
          payToggleButton.disabled = false;
        }
      }
    });

    try {
      rzp.open();
    } catch (err) {
      console.error(err);
      showMessage('Failed to open payment window. Please try again.', 'error');
      payToggleButton.disabled = false;
    }
  });

  const handlePotentialReturnFromUpi = () => {
    let ts = null;
    try {
      ts = localStorage.getItem(UPI_RETURN_FLAG);
    } catch {}

    if (!ts) return;

    // If user comes back within ~10 minutes, assume it's from UPI app.
    const ageMs = Date.now() - Number(ts);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 10 * 60 * 1000) {
      try {
        localStorage.removeItem(UPI_RETURN_FLAG);
      } catch {}
      return;
    }

    // Legacy UPI-return UX is not used when Razorpay is enabled.
    try {
      localStorage.removeItem(UPI_RETURN_FLAG);
    } catch {}
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handlePotentialReturnFromUpi();
  });
  window.addEventListener('focus', handlePotentialReturnFromUpi);

  const showMessage = (msg, type = 'success') => {
    messageEl.textContent = msg;
    messageEl.classList.remove('success', 'error');
    messageEl.classList.add(type);
  };

  paymentDetailsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitButton = paymentDetailsForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const name = document.getElementById('payerName')?.value?.trim() || '';
    const email = document.getElementById('payerEmail')?.value?.trim() || '';
    const phone = document.getElementById('payerPhone')?.value?.trim() || '';
    const state = document.getElementById('payerState')?.value?.trim() || '';
    const domain = document.getElementById('payerDomain')?.value || '';
    const upiTxnId = document.getElementById('upiTxnId')?.value?.trim() || '';
    const amount = 10;

    // Manual UPI Transaction ID submit is deprecated when Razorpay is used.
    showMessage('Please use the Pay Now button to complete payment. Receipt will be emailed after confirmation.', 'error');
    submitButton.disabled = false;
    return;

    try {
      const response = await fetch('/upi-confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          state,
          domain,
          amount,
          upiTransactionId: upiTxnId
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        showMessage(data.message || 'Failed to send receipt. Please try again.', 'error');
        submitButton.disabled = false;
        return;
      }

      showMessage('Submitted successfully. Receipt has been emailed.', 'success');
      submitButton.disabled = false;
      paymentDetailsForm.reset();
      confirmSection?.classList.add('hidden');
      try {
        localStorage.removeItem(UPI_RETURN_FLAG);
      } catch {}
    } catch (err) {
      console.error(err);
      showMessage('Network error while sending receipt. Please try again.', 'error');
      submitButton.disabled = false;
    }
  });
});


