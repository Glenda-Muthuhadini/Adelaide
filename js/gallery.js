'use strict';

const galleryFilters = document.querySelector('.gallery-filters');
const galleryItems = [...document.querySelectorAll('.gallery-tile')];
const galleryStatus = document.querySelector('.gallery-status');

if (galleryFilters && galleryItems.length && galleryStatus) {
  // Keep the entire gallery visible when JavaScript is unavailable.
  galleryFilters.hidden = false;
  galleryFilters.addEventListener('click', (event) => {
    const selected = event.target.closest('button[data-gallery-filter]');
    if (!selected || !galleryFilters.contains(selected)) return;
    const category = selected.dataset.galleryFilter;
    let count = 0;
    galleryItems.forEach((item) => {
      item.hidden = category !== 'all' && item.dataset.galleryCategory !== category;
      if (!item.hidden) count += 1;
    });
    galleryFilters.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button === selected));
    });
    galleryStatus.textContent = count + (count === 1 ? ' image' : ' images') + ' shown for ' + selected.textContent.trim() + '.';
  });
}

