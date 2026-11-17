# contacts — Odoo 20.0 notes

- Odoo commit: `36fef5806`
- Path root: `odoo-reference/addons/contacts` plus the base model and views in `odoo-reference/odoo/addons/base`
- AfriCore question(s): How does the Odoo Contacts company record establish the profile header, smart-button box, grouped fields and horizontal notebook tabs used by the Business ID references?
- Status: read
- Last updated: 2026-11-17

## Model map

- Contacts extends the shared `res.partner` model rather than creating a separate Contacts model — `addons/contacts/models/res_partner.py`.
- The Contacts addon registers its own menu and depends on `base_address_extended`, `mail` and `web_hierarchy`; its manifest loads the Contacts view — `addons/contacts/__manifest__.py`.
- The canonical company/person fields, address and base partner form belong to `res.partner` — `odoo/addons/base/models/res_partner.py`, `odoo/addons/base/views/res_partner_views.xml` (`view_partner_form`).

## Lifecycle / state machine

- The inspected Contacts extension adds navigation, not an identity-verification or credential lifecycle — `addons/contacts/models/res_partner.py`.
- The base partner form represents a shared company/person contact record. Its child-contact subview and notebook tabs organize related contact, sales/purchase and notes data — `odoo/addons/base/views/res_partner_views.xml`.
- No cryptographic credential, holder-consent, verifier or registry-review state was found in the inspected Contacts extension.

## Money and units

- Not applicable to the inspected Contacts presentation and extension.

## Security and access

- This note does not infer access enforcement from the form view. Contacts inherits Odoo's shared partner model; model access and record rules must be audited separately before making security claims.
- The inspected form shows a `button_box`, header image/name, grouped fields and `notebook`; additional smart buttons can be contributed by other installed modules. Their visual presence does not define trust semantics.

## Transactions and concurrency

- Not assessed; this was a view/model-extension review, not a transaction or concurrency audit.

## What AfriCore should take

- Use the Odoo structure: compact record toolbar, company mark beside a large name, two-column field groups, a related-record smart-button strip and horizontal tabs — `odoo/addons/base/views/res_partner_views.xml` (`view_partner_form`).
- Treat the screenshots as layout references only. AfriCore's existing Passport, evidence, verification, credential and sharing services remain authoritative; do not replace them with a Contacts directory or claim that Odoo Contacts provides verifiable identity.
- Preserve distinct status explanations and application permissions on every smart-button destination.

## Open questions

- A complete audit of inherited partner views and button providers was outside this focused source review. Live Odoo and AfriCore screenshot comparison remains a separate visual acceptance step.
