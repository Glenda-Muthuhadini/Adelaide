'use strict';

// Local line icons keep the page independent of external libraries.
const spaIcons = {
  gift: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v9h14v-9M12 9v13M12 9C5 9 4 3 7 2c3-1 5 3 5 7Zm0 0c7 0 8-6 5-7-3-1-5 3-5 7Z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="M8 7V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M2 12c5 4 15 4 20 0M10 13h4v4h-4Z"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="16" cy="8" r="1.5"/><path d="m3 17 6-7 5 5 3-3 4 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18M7 14h2m3 0h2m3 0h1M7 18h2m3 0h2"/>',
  whatsapp: '<path d="M20.5 11.6a8.6 8.6 0 0 1-12.7 7.6L3 21l1.7-4.7A8.6 8.6 0 1 1 20.5 11.6Z"/><path d="m8.1 7.3 1.6 2.5-1 1.2c.9 1.8 2.3 3.1 4.2 3.9l1.1-1.1 2.5 1.4c-.3 2-1.6 2.3-3.1 1.8-3.9-1.2-6.2-3.7-7-6.8-.4-1.4.2-2.6 1.7-2.9Z"/>',
  lotus: '<path d="M12 20C7 15 7 9 12 3c5 6 5 12 0 17Zm0 0C6 20 3 15 2 9c6 0 10 5 10 11Zm0 0c6 0 9-5 10-11-6 0-10 5-10 11Z"/><path d="M7 12 5 5c3 1 5 3 6 5m6 2 2-7c-3 1-5 3-6 5M2 17c3 5 16 5 20 0"/>',
  stones: '<ellipse cx="12" cy="6" rx="4" ry="2.5"/><rect x="6" y="9" width="12" height="5" rx="2.5"/><path d="M7 15c-5 0-6 6 0 6h10c6 0 5-6 0-6"/>',
  heart: '<path d="M12 21 3.5 12C-2 5 7-1 12 6c5-7 14-1 8.5 6Z"/>',
  diamond: '<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M7 3l5 18 5-18M7 3l5 5 5-5"/>',
  leaf: '<path d="M12 21C5 17 4 10 5 6c7 0 9 7 7 15Zm0 0C9 11 15 4 22 3c0 9-3 15-10 18ZM4 22c4-1 10-5 14-13M8 11l4 10"/>',
  people: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.5"/><circle cx="19" cy="10" r="2.5"/><path d="M7 21v-4a5 5 0 0 1 10 0v4H7Zm-1-8a4 4 0 0 0-5 4v3h6m11-7a4 4 0 0 1 5 4v3h-6"/>',
  phone: '<path d="m5 3 4 4-2 3a15 15 0 0 0 7 7l3-2 4 4c-2 5-7 2-11-1S0 7 5 3Z"/>',
  pin: '<path d="M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'
};
document.querySelectorAll('[data-icon]').forEach((element) => {
  const paths = spaIcons[element.dataset.icon];
  if (paths) element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths + '</svg>';
});

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#main-navigation');
if (menuToggle && navigation) {
  const setMenuOpen = (open) => {
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    navigation.classList.toggle('is-open', open);
  };
  menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });
  document.addEventListener('click', (event) => {
    if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
      setMenuOpen(false);
      menuToggle.focus();
    }
  });
  window.matchMedia('(min-width: 1001px)').addEventListener('change', (event) => {
    if (event.matches) setMenuOpen(false);
  });
}

