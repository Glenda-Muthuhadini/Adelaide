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

`about.html`, `css/about.css` and `js/about.js` implement the supplied About Us reference, with five labeled image placeholders, the shared navigation and footer, and WhatsApp booking and team enquiries. The other four HTML pages remain starter scaffolds, linked from the navigation.

## Photography and branding

The supplied `assets/images/logo/Adelaide Wellness Spa Emblem.png` is used in the header and footer. The 14 photo areas are deliberately labeled CSS placeholders: one hero, four treatments, four packages, two gallery images and three client portraits.

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

JavaScript syntax checks and local Chrome browser checks pass at 320, 390, 600, 768, 1024, 1280 and 1440 pixels. Checks cover horizontal overflow, section/card counts, image loading, icons, local file links, WhatsApp destinations, menu toggling, Escape focus and outside-click dismissal. Browser verification is available in `.qa/check-layout.cjs` and uses the locally installed Chrome on Windows. Desktop and mobile captures are saved in `.qa/`.
