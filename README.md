# Adelaide Wellness & Spa

## Live bookings and staff access

The website is connected to Supabase project `zhezlhajzdzdyronuxao`. Customers use `booking.html` without an account; authorised staff use `admin-login.html` and `admin-dashboard.html`. Serve the directory over HTTP locally and HTTPS in production. Public staff signup is unavailable.

The database enforces four people total across all services, 30-minute availability intervals, consecutive group sessions, automatic customer confirmation, cancellations and atomic rescheduling. Available starting times refresh as customers change their treatment, group size or date; full slots are rejected immediately without partial reservations. Services, Add-ons and Specials & Promotions have tables with Add/Edit/Delete dialog forms. Staff lists actual authorised accounts and gives only the owner an Add staff button. The website's 16 services, seven add-on therapies/extras and four promotions are imported with their published prices. Preparation is provisionally zero minutes. Reports provide six category previews, individual PDFs and one combined PDF. The Availability navigation tab has been removed at the owner's request.

[BOOKING-SETUP.md](BOOKING-SETUP.md) explains owner access, scheduling rules, private data protection, testing and production password-recovery setup. The owner account is preconfirmed as requested; credentials are not stored in the repository.

Run `.qa/booking-database.sql` through the trusted database connection for rollback-only integration tests. `node .qa/check-booking.cjs` exercises live guest/admin flows with installed Chrome and reads admin credentials through hidden stdin. The older auth/dashboard checks target historical frontend previews. Current dashboard scripts are `js/spa-api.js`, `js/admin-icons.js` and `js/admin-live.js`.

## Public website

A responsive landing page recreated from the supplied homepage reference using HTML, CSS and vanilla JavaScript. No dependencies, external fonts or stock photography are required.

## Preview

Open `index.html` in a browser. No installation or build step is needed.

## Source files

- `index.html`: all nine requested areas, from navigation through the footer.
- `css/global.css`: colour variables, typography, buttons, navigation, icons and footer styles.
- `css/index.css`: homepage layout, placeholders, cards, gold wave and responsive layouts.
- `js/global.js`: local SVG line icons and accessible mobile navigation.
- `js/index.js`: treatment-specific booking links.

`about.html`, `css/about.css` and `js/about.js` implement the supplied About Us reference, with five supplied spa photographs, the shared navigation and footer, and WhatsApp booking and team enquiries.

`services.html`, `css/services.css` and `js/services.js` implement the standard Services menu with 16 cards and 17 image areas. The existing design is preserved. Filters group the exact supplied menu into Massage Therapies, Facial Treatments, Other Treatments, Add-on Massage Therapies and Packages. Fourteen individual services plus Ultimate Relaxation and Couples Retreat show their normal prices and duration options. Filters announce visible counts to assistive technology. All services remain visible without JavaScript, and booking buttons open the customer booking flow. Treatments without known durations remain enquiries until configured.

`packages.html`, `css/packages.css` and `js/packages.js` implement Specials & Offers with four standalone Signature Experiences sections: Me-Time Special, Couples Massage Specials, Birthday Package and Group Wellness Special. Wide layouts alternate image placeholders and offer details on desktop, then stack on mobile. Couples options appear alongside one another when space allows; group pricing is presented as compact comparison tiles. All prices, inclusions and add-ons remain visible, with offer-specific WhatsApp enquiries while bespoke promotion schedules await configuration.

The Signature Experiences layout uses the existing cream, olive and gold styling. Explore controls and popups have been removed; browsing and booking do not require page-specific JavaScript. The header, footer and other page sections retain their existing layouts.

Services contains standard individual services, add-ons and the two standard service packages with their normal prices. Specials & Offers contains temporary promotions, discounted offers and promotional packages with their included extras. Browser checks compare these categories against separate expected prices, verify their inclusions, and prevent promotional content from entering the standard menu.

`gallery.html`, `css/gallery.css` and `js/gallery.js` implement the Gallery mockup with 24 supplied gallery photos, category filters, a client quote strip and WhatsApp booking buttons. The grid uses three columns on desktop, two on mobile and one on narrow screens. Categories use the current Services and Specials & Experiences naming. All images remain visible without JavaScript. The client quote reproduces the supplied mockup and should be confirmed before publication.

`contact.html`, `css/contact.css` and `js/contact.js` implement the Contact Us mockup with a curved spa welcome photograph, Call Us, WhatsApp Us, Visit Us and Operating Hours cards, and a booking banner. Call actions use `tel:+27673030683`; WhatsApp and bookings use the existing Adelaide number. Get Directions opens Google Maps directions using the supplied address, without inventing coordinates. The card layout adapts from four columns to two and then one. The supplied welcome photograph fills `.contact-hero-image` with its curved crop retained.

The shared favicon uses `assets/images/logo/Elegant Golden A Spa Emblem.png`.

## Photography and branding

The original 24 supplied gallery photos are used in the Gallery and reused in suitable Home, About, Services, Specials & Offers, Contact, and dashboard quick-action image areas. Original PNG files remain in `assets/images/gallery/`; lightweight JPEG copies in `assets/images/gallery/web/` are used by the website. Full gallery photos open from their thumbnails. The gallery uses square tiles, category filters, and descriptive alt text. Photos supplied individually for service cards are not added to the Gallery.

[PHOTO-USAGE.md](PHOTO-USAGE.md) lists the placements and missing photos. All service photo areas are now filled. Testimonials use initials matching their displayed attributions; guest photos are not attached to named testimonials.

Public-page headers and footers retain the existing emblem. The dashboard uses the supplied `Adelaide Wellness & Spa Logo.png`.

## Links and content

All eleven pages include the footer credit “Developed and designed by Hadini Holdings”. Only “Hadini Holdings” links to `https://hadiniholdings.co.za`; it uses a distinct gold colour and underline, opens in a new tab, and includes `noopener noreferrer`. Authentication screens reserve space for the credit within the viewport.

Book Now buttons open `booking.html`, with standard treatments preselected where available. WhatsApp Us and bespoke promotional enquiries use `https://wa.me/27673030683`. Phone links use `tel:+27673030683`.

Facebook, Instagram and TikTok icons are display-only until verified profile URLs are supplied. Testimonials reproduce the reference image's sample copy; confirm the quotes and attributions before publishing.

## Verification

JavaScript syntax checks and local Chrome browser checks pass for all six completed pages at 320, 390, 600, 768, 1000, 1001, 1024, 1100, 1200, 1280 and 1440 pixels. Checks cover horizontal overflow, section/card counts, image loading, icons, local file links, WhatsApp destinations, service filters, menu toggling, Escape focus, outside-click dismissal and the requested navigation names. Browser verification is available in `.qa/check-layout.cjs` and uses the locally installed Chrome on Windows. Run it with a page filename, for example `node .qa/check-layout.cjs services.html`. Desktop and mobile captures are saved in `.qa/`.

`node .qa/check-layout.cjs packages.html` verifies exact promotion prices and inclusions, direct WhatsApp booking messages, responsive sections and the absence of popup controls.

Gallery uses the original 24 supplied photos and preserves category filters. Run gallery verification with `node .qa/check-layout.cjs gallery.html`.

Run Contact verification with `node .qa/check-layout.cjs contact.html`. Checks include the supplied phone number, WhatsApp destinations, full address in the directions link, operating hours, active navigation, loaded assets and responsive card columns.

The broader responsive audit runs with `node .qa/audit-responsive.cjs --strict`. It checks all six pages across 21 portrait, landscape and wide-screen viewports from 320px to 2560px, using touch emulation on phone and tablet sizes. Checks cover clipped text, page overflow, header overlap, 44px touch targets, menu height, keyboard access to the last menu item, and Escape focus restoration. The final report is `.qa/responsive-audit.json`. Add `--screenshots` to capture representative narrow-phone and landscape-menu views. These are local Chrome emulation checks.

Responsive refinements keep the mobile menu scrollable within short screens, size touch controls to at least 44px without enlarging desktop buttons, stack homepage benefits on narrow phones, and preserve About-page line breaks to prevent joined words.
