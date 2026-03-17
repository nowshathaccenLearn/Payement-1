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

  payToggleButton?.addEventListener('click', () => {
    const name = document.getElementById('payerName')?.value?.trim() || '';
    const email = document.getElementById('payerEmail')?.value?.trim() || '';
    const phone = document.getElementById('payerPhone')?.value?.trim() || '';
    const state = document.getElementById('payerState')?.value?.trim() || '';
    const domain = document.getElementById('payerDomain')?.value || '';

    if (!name || !email || !phone || !state || !domain) {
      showMessage('Please fill Name, Email, Phone, State, and Domain before paying.', 'error');
      return;
    }

    const amount = 1;
    const vpa = 'lwaran468-3@okhdfcbank';
    const upiUrl =
      'upi://pay?' +
      new URLSearchParams({
        pa: vpa,
        pn: name || 'Accenlearn Payment',
        am: String(amount),
        cu: 'INR'
      }).toString();

    confirmSection?.classList.remove('hidden');
    confirmSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showMessage('Opening your UPI app… After payment, enter the UPI Transaction ID and submit.', 'success');

    try {
      localStorage.setItem(UPI_RETURN_FLAG, String(Date.now()));
    } catch {}

    window.location.href = upiUrl;
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

    confirmSection?.classList.remove('hidden');
    confirmSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showMessage('Welcome back. Please enter your UPI Transaction ID and submit to complete verification.', 'success');
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
    const amount = 1;

    if (!name || !email || !phone || !state || !domain || !upiTxnId) {
      showMessage('Please fill all required fields before submitting.', 'error');
      submitButton.disabled = false;
      return;
    }

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


