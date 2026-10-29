'use strict';
document.querySelectorAll('.treatment-card').forEach(card=>{const link=card.querySelector('a'),heading=card.querySelector('h3');if(link&&heading){link.href='booking.html?service='+encodeURIComponent(heading.textContent.replace(/\s+/g,' ').trim());link.removeAttribute('target');}});
