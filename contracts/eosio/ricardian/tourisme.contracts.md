<h1 class="contract">createlist</h1>
---
spec_version: "0.2.0"
title: Create listing
summary: '{{nowrap host}} publishes a new rental listing'
---
{{host}} publishes a listing priced at {{nightly}} per night plus {{cleaning_fee}} cleaning fee.

<h1 class="contract">cancelguest</h1>
---
spec_version: "0.2.0"
title: Cancel booking (guest)
summary: '{{nowrap guest}} cancels booking {{booking_id}}'
---
The refund follows the listing's cancellation policy.

<h1 class="contract">release</h1>
---
spec_version: "0.2.0"
title: Release escrow
summary: 'Release escrow for booking {{booking_id}}'
---
Pays the host once the stay has started (24h after check-in) or when the guest confirms.
