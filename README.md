# Adelaide Wellness & Spa

A responsive landing page recreated from the supplied homepage reference using HTML, CSS and vanilla JavaScript. No dependencies, external fonts or stock photography are required.

## Preview

Open `index.html` in a browser. No installation or build step is needed.

## Source files

- `index.html`: all nine requested areas, from navigation through the footer.
- `css/global.css`: colour variables, typography, buttons, navigation, icons and footer styles.
- `css/index.css`: homepage layout, placeholders, cards, gold wave and responsive layouts.
- `js/global.js`: local SVG line icons and accessible mobile navigation.
- `js/index.js`: WhatsApp treatment enquiry messages.

`about.html`, `css/about.css` and `js/about.js` implement the supplied About Us reference, with five labeled image placeholders, the shared navigation and footer, and WhatsApp booking and team enquiries.

`services.html`, `css/services.css` and `js/services.js` implement the standard Services menu with 16 cards and 17 image placeholders. The existing design is preserved. Filters group the exact supplied menu into Massage Therapies, Facial Treatments, Other Treatments, Add-on Massage Therapies and Packages. Fourteen individual services plus Ultimate Relaxation and Couples Retreat show their normal prices and duration options. Filters announce visible counts to assistive technology. All services remain visible without JavaScript, and booking buttons open service-specific WhatsApp enquiries.

`packages.html`, `css/packages.css` and `js/packages.js` implement Specials & Offers with four standalone Signature Experiences sections: Me-Time Special, Couples Massage Specials, Birthday Package and Group Wellness Special. Wide layouts alternate image placeholders and offer details on desktop, then stack on mobile. Couples options appear alongside one another when space allows; group pricing is presented as compact comparison tiles. All prices, inclusions and add-ons remain visible, with direct, offer-specific WhatsApp Book Now links.

The Signature Experiences layout uses the existing cream, olive and gold styling. Explore controls and popups have been removed; browsing and booking do not require page-specific JavaScript. The header, footer and other page sections retain their existing layouts.

Services contains standard individual services, add-ons and the two standard service packages with their normal prices. Specials & Offers contains temporary promotions, discounted offers and promotional packages with their included extras. Browser checks compare these categories against separate expected prices, verify their inclusions, and prevent promotional content from entering the standard menu.

`gallery.html`, `css/gallery.css` and `js/gallery.js` implement the Gallery mockup with nine photo placeholders, category filters, a client quote strip and WhatsApp booking buttons. The grid uses three columns on desktop, two on mobile and one on narrow screens. Categories use the current Services and Specials & Experiences naming. All images remain visible without JavaScript. The client quote reproduces the supplied mockup and should be confirmed before publication.

`contact.html`, `css/contact.css` and `js/contact.js` implement the Contact Us mockup with a curved hero-photo placeholder, Call Us, WhatsApp Us, Visit Us and Operating Hours cards, and a booking banner. Call actions use `tel:+27673030683`; WhatsApp and bookings use the existing Adelaide number. Get Directions opens Google Maps directions using the supplied address, without inventing coordinates. The card layout adapts from four columns to two and then one. The hero placeholder supports a future photograph inside `.contact-hero-image` with its curved crop retained.

The shared favicon uses `assets/images/logo/Elegant Golden A Spa Emblem.png`.

## Photography and branding

The supplied `assets/images/logo/Adelaide Wellness Spa Emblem.png` is used in the header and footer. The homepage's 14 photo areas are deliberately labeled CSS placeholders: one hero, four treatments, four promotions, two gallery images and three client portraits. Each completed secondary page also uses labeled photo placeholders.

To add a photograph, keep its wrapper class and replace the placeholder label with an image:

```html
<div class="image-placeholder treatment-image">
  <img src="assets/images/treatments/swedish-massage.jpg" alt="A relaxing Swedish massage" loading="lazy">
</div>
```

Add the following to `css/index.css` when introducing images. Put the actual photographs in the corresponding `assets/images/` folders.

```css
.image-placeholder > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

The hero is already positioned behind the cream gradient and gold curve. For the hero photo, omit `loading="lazy"` so it loads promptly.

## Links and content

All Book Now and WhatsApp Us buttons open `https://wa.me/27673030683`. Treatment bookings add a prefilled enquiry identifying the selected treatment. Phone links use `tel:+27673030683`.

Facebook, Instagram and TikTok icons are display-only until verified profile URLs are supplied. Testimonials reproduce the reference image's sample copy; confirm the quotes and attributions before publishing.

## Verification

JavaScript syntax checks and local Chrome browser checks pass for all six completed pages at 320, 390, 600, 768, 1000, 1001, 1024, 1100, 1200, 1280 and 1440 pixels. Checks cover horizontal overflow, section/card counts, image loading, icons, local file links, WhatsApp destinations, service filters, menu toggling, Escape focus, outside-click dismissal and the requested navigation names. Browser verification is available in `.qa/check-layout.cjs` and uses the locally installed Chrome on Windows. Run it with a page filename, for example `node .qa/check-layout.cjs services.html`. Desktop and mobile captures are saved in `.qa/`.

`node .qa/check-layout.cjs packages.html` verifies exact promotion prices and inclusions, direct WhatsApp booking messages, responsive sections and the absence of popup controls.

For Gallery photographs, replace each label inside `.gallery-placeholder` with an `<img>` pointing to the appropriate `assets/images/gallery/` file; image sizing and cropping are already defined in `css/gallery.css`. Preserve `data-gallery-category` on each `.gallery-tile` so filtering continues to work. Run gallery verification with `node .qa/check-layout.cjs gallery.html`.

Run Contact verification with `node .qa/check-layout.cjs contact.html`. Checks include the supplied phone number, WhatsApp destinations, full address in the directions link, operating hours, active navigation, loaded assets and responsive card columns.

The broader responsive audit runs with `node .qa/audit-responsive.cjs --strict`. It checks all six pages across 21 portrait, landscape and wide-screen viewports from 320px to 2560px, using touch emulation on phone and tablet sizes. Checks cover clipped text, page overflow, header overlap, 44px touch targets, menu height, keyboard access to the last menu item, and Escape focus restoration. The final report is `.qa/responsive-audit.json`. Add `--screenshots` to capture representative narrow-phone and landscape-menu views. These are local Chrome emulation checks.

Responsive refinements keep the mobile menu scrollable within short screens, size touch controls to at least 44px without enlarging desktop buttons, stack homepage benefits on narrow phones, and preserve About-page line breaks to prevent joined words.
