'use strict';

const filterGroup = document.querySelector('.service-filters');
const serviceCards = [...document.querySelectorAll('.catalogue-card')];
const filterStatus = document.querySelector('.filter-status');

if (filterGroup && serviceCards.length && filterStatus) {
  // All services remain available when JavaScript is disabled.
  filterGroup.hidden = false;
  filterGroup.addEventListener('click', (event) => {
    const selectedButton = event.target.closest('button[data-filter]');
    if (!selectedButton || !filterGroup.contains(selectedButton)) return;
    const category = selectedButton.dataset.filter;
    let visibleCount = 0;
    serviceCards.forEach((card) => {
      const visible = category === 'all' || card.dataset.category === category;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    filterGroup.querySelectorAll('button[data-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button === selectedButton));
    });
    const categoryName = selectedButton.textContent.trim();
    filterStatus.textContent = visibleCount + (visibleCount === 1 ? ' service' : ' services') + ' shown for ' + categoryName + '.';
  });
}

