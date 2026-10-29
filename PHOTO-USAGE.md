# Photography usage and remaining gaps

The original 24 supplied gallery photographs are displayed in `gallery.html`, categorised as Our Spa, Services, Relaxation Areas, and Specials & Experiences. Each thumbnail opens the full photo in a new tab. The grid uses square tiles to retain more of the supplied compositions.

Photos supplied individually for named services are used only in their assigned service areas and are not added to the Gallery.

## Reuse across the site

| Area | Selected photographs |
| --- | --- |
| Homepage hero | Original Serene Warm-Lit Spa Massage (preserved) |
| Homepage Swedish massage | Professional Spa Massage Therapy |
| Homepage promotions | Tranquil Teal Twin Treatment Room; Spa Welcome with a Birthday Message; Joyful Outdoor Spa Celebration |
| Homepage gallery preview | Serene Teal Spa Treatment Room; Sunlit Spa Lounge with Sunflowers |
| About | Smiling Welcome at Adelaide Spa; Tranquil Teal Twin Treatment Room; Serene Spa Retreat with Rose Petals; Professional Spa Massage Therapy; Serene Teal Spa Treatment Room |
| Services | Professional Spa Massage Therapy illustrates general back massage; Serene Spa Retreat with Rose Petals illustrates relaxation; Tranquil Teal Twin Treatment Room illustrates shared treatment space |
| Specials & Offers | Elegant Outdoor Spa Retreat; Relaxed Garden Spa Portrait; Tranquil Teal Twin Treatment Room; Spa Welcome with a Birthday Message; Joyful Outdoor Spa Celebration; Elegant Mother’s Day Brunch Table |
| Contact | Smiling Welcome at Adelaide Spa |
| Dashboard quick actions | Professional Spa Massage Therapy; Smiling Welcome at Adelaide Spa; Spa Lounge Conversations; Serene Teal Spa Treatment Room |

The general back-massage photo illustrates Swedish and Body Back Massage. Adelaide Signature Massage uses the separate Serene Warm-Lit Spa Massage image. Its alt text describes the visible back massage without claiming a specialised technique.

Hot Stone Massage on Home and Services now uses the supplied Tranquil Hot Stone Spa Treatment photograph. Its crop is positioned to keep the stones visible.

Facials on Home and Signature Facial on Services use Warm Spa Facial Treatment, which is also included in the Gallery.

Reflexology on Home and Reflexology Massage on Services use Tranquil Teal-Walled Reflexology Spa.

Sports Massage on Services uses Tranquil Spa Massage in Teal Room, as requested.

Neck & Shoulder Massage on Services uses Serene Neck and Shoulder Massage.

Scalp Massage on Services uses Serene Spa Scalp Massage.

Hand Massage on Services uses Serene Teal Spa Hand Massage.

Manual Lymph Drainage uses Serene Teal Spa Abdominal Massage on Services only. The Gallery remains unchanged.

Deep Tissue Massage uses Serene Teal-Walled Spa Massage on Services only.

Hand & Shoulder Massage uses Tranquil Teal Room Massage Session on Services only.

## Photos still needed

All service cards now have assigned photographs. Pregnancy Massage uses Serene Prenatal Massage in a Modern Spa on Services only.

All four homepage treatment cards now have matching photographs.

Corporate Wellness on Home uses Joyful Poolside Wellness Spa Pose, as requested.

Testimonial portraits use initials: TM for Tshilidzi M., LK for Lerato K., and NR for Ndivhuwo R. on Home. Gallery uses OC for its collective ?Our clients? attribution, which has no named individual. Supplied guest photos are not assigned to these quotations.

No photo areas remain unfilled. Image areas use supplied photographs or testimonial initials.

## Asset handling

Original PNG photographs remain unchanged in `assets/images/gallery/`. JPEG copies in `assets/images/gallery/web/` are used by the website, with natural image dimensions, descriptive alternative text, and lazy loading except for key hero images. The copies total about 8.3 MB versus 76.5 MB for the original set. Portrait crops are handled by CSS; full uncropped gallery photos remain available.

The earlier authentication background and dashboard backdrop retain the approved reference styling. Dashboard quick-action cards use supplied photographs.

The exact file mapping is recorded in `.qa/gallery-photo-usage.json`, with dimensions and encoded sizes in `.qa/gallery-photo-manifest.json`.

