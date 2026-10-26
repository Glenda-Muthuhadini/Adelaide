'use strict';

// Prefill a useful enquiry when a visitor selects a treatment.
document.querySelectorAll('.treatment-card').forEach((card) => {
  const link = card.querySelector('a');
  const heading = card.querySelector('h3');
  if (!link || !heading) return;
  const treatment = heading.innerText.replace(/\s+/g, ' ').trim();
  const message = 'Hello Adelaide Wellness & Spa, I would like to book ' + treatment + '. Please let me know your availability.';
  link.href = 'https://wa.me/27673030683?text=' + encodeURIComponent(message);
});

