# AFRICORE — WAVE 3 + PLATFORM-WIDE UI TRANSFORMATION
## COMPLETE COMMERCE ECOSYSTEM, SHOPIFY-CLASS ANALYTICS AND PREMIUM PRODUCT EXPERIENCE

### MISSION

You are the principal engineer, commerce architect, product designer, frontend architect, database engineer and technical implementation lead for the existing AfriCore platform.

Continue from the completed Waves 1 and 2 in the existing repository:

`https://github.com/Sevqo/afriscore`

Read:

- `AGENTS.md`
- `docs/WAVE_2_IMPLEMENTATION_REPORT.md`
- `docs/MASTER_IMPLEMENTATION_PROGRAM.md`
- Existing architecture, database, deployment and application documentation.

The founder has authorized two major phases:

**PHASE 1 — Build the complete Wave 3 commerce ecosystem.**

**PHASE 2 — Execute a platform-wide UI/UX transformation covering every existing app and service, including Shopify-inspired interactive analytics.**

After these phases, manufacturing, specialized industry applications and AfriCore Studio will be addressed in separate future assignments.

Do not implement those future phases now.

The objective is to transform AfriCore into a sophisticated, cohesive African business operating system—not a collection of generic dashboards.

---

# PART I — EXISTING PLATFORM AND PRESERVATION

## 1. Existing applications

The platform currently has twelve business applications:

1. Finance
2. CRM
3. Inventory
4. Sales
5. Analytics
6. Automations
7. Work
8. Accounting
9. People
10. Procurement
11. Documents
12. Business ID

These have established shared domain models, service relationships, integrations and permissions.

Preserve them.

Do not create duplicate financial, inventory, customer, product or identity infrastructure.

## 2. Existing architecture

Inspect and reuse:

- Cloudflare frontend.
- Render backend.
- Neon PostgreSQL.
- Neon Managed Auth.
- Shared workspace identities.
- Service Catalog.
- App Registry.
- Service entitlements.
- Usage metering.
- API authorization.
- Durable business events.
- Notifications.
- Approvals.
- Shared products.
- Shared customers.
- Orders.
- Invoices.
- Payments.
- Accounting.
- Inventory.
- Documents.
- Business verification.

Do not replace these systems merely to make Wave 3 easier.

## 3. Fundamental product model

AfriCore has three layers:

**Services:** Independently activatable business capabilities and APIs.

**Apps:** Optional user-facing interfaces that combine relevant services.

**Integrations:** Connections to external providers and third-party systems.

Installing an app is free.

Its required services activate through one authorized installation flow, with explicit disclosure and consent for paid or metered usage.

Existing direct-service access must remain functional.

Do not force customers to install an app to use a service.

---

# PART II — PRE-FLIGHT AUDIT AND KNOWN ISSUES

## 4. Verify the actual deployed system

Before implementing Wave 3:

- Confirm production frontend and backend revisions.
- Check migrations.
- Verify authentication.
- Verify workspace isolation.
- Confirm existing twelve-app routes load.
- Confirm app installation logic.
- Run the existing test suite.
- Inspect actual service and event contracts.

Review the latest implementation report's limitations.

Do not represent a provider integration as live if only an internal sandbox has been tested.

## 5. Address known issues from user acceptance testing

The founder has already tested the following workflow:

CRM customer → Sales quotation → Sales order → Inventory reservation → Finance draft invoice → Invoice issuance → Sandbox checkout → Paid invoice → Accounting source recognition → Analytics.

This succeeded through several real hosted app interactions.

However, the following require targeted investigation.

### A. Sandbox reversal

A sandbox checkout produced:

- One successful KSh 120 payment event.
- One reversal event.
- An invoice that remained marked Paid.

Determine whether reversal requires separate review, whether reversal evidence differs from a completed refund, and whether Finance and Analytics are correctly representing the net allocation.

Do not assume recording a reversal event is equivalent to automatically reversing the underlying settlement.

Correct any real accounting or state synchronization defect.

Keep the original and reversing evidence auditable.

### B. Paid invoice payment-link UI

After settlement, the invoice interface continues showing the generated checkout link.

Improve the UI:

- Show paid status and receipt information prominently.
- Do not encourage another payment on a fully settled invoice.
- Preserve access to historical payment evidence.
- Existing checkout links must accurately show completed status and prevent duplicate charges.
- Handle partial payments separately.

### C. Single-owner accounting workflow

Accounting currently requires another authorized owner or administrator to approve a journal prepared by the founder.

Preserve the existing separation-of-duties control.

Improve the explanation and onboarding for single-owner organizations.

Do not create a hidden self-approval bypass.

If an alternative business policy is proposed, require explicit security and governance review before implementation.

### D. Application reliability

Audit and repair outstanding:

- Failed API requests.
- Incorrect empty states.
- Missing loading states.
- Broken navigation.
- Nonfunctional actions.
- Incorrect record counts.
- Stale data after updates.
- Unhelpful error messages.

Do not spend this pre-flight phase doing the full UI redesign.

---

# PART III — WAVE 3: SIX NEW APPS

Build:

13. AfriCore Commerce
14. AfriCore POS
15. AfriCore Website
16. AfriCore Marketing
17. AfriCore Support
18. AfriCore Subscriptions

These should be functional products with complete operational workflows.

Shopify is the primary benchmark for commerce features.

Odoo is the benchmark for integration with back-office operations.

Build original AfriCore experiences.

---

# 6. AFRICORE COMMERCE

## Purpose

Allow businesses to create, launch, operate and grow online stores while managing the entire operation within AfriCore.

The product should serve independent merchants, retailers, wholesalers and growing African businesses.

## Merchant dashboard

Include:

- Total orders.
- Gross sales.
- Net sales.
- Average order value.
- Returning customers.
- Online store conversion.
- Store sessions when valid tracking data exists.
- Fulfillment status.
- Abandoned checkouts.
- Top products.
- Inventory availability.
- Sales by channel.
- Marketing attribution where available.

Use real business records and clearly defined metrics.

## Online storefronts

Businesses should be able to:

- Create a store.
- Choose a theme.
- Configure branding.
- Upload logos and images.
- Configure navigation.
- Create product collections.
- Create pages.
- Preview storefront.
- Publish storefront.
- Configure SEO.
- Set up a supported custom domain.

Provide a secure default AfriCore-hosted storefront URL.

Use verified domain ownership for custom domains.

## Product management

Commerce uses the canonical Inventory product catalog.

Support:

- Product descriptions.
- Rich product media.
- Product variants.
- Collections.
- Categories.
- Pricing.
- Compare-at prices.
- Discounts.
- SKUs.
- Barcode references.
- Product availability.
- Product search.
- Product filtering.
- Related products.
- Product bundles where reliably modeled.
- Digital product eligibility where supported.
- Draft/active/archived publication states.
- Bulk imports and edits.

Separate product publication state from warehouse tracking state.

## Shopping cart

Build:

- Add to cart.
- Change quantity.
- Remove item.
- Cart persistence.
- Product availability checks.
- Currency-safe totals.
- Discounts.
- Tax and shipping estimates.
- Guest checkout.
- Customer login checkout.

Validate every price and discount server-side.

## Checkout

Build a secure checkout experience comparable in usability to Shopify's.

Support:

- Contact information.
- Delivery address.
- Shipping/pickup selection.
- Order summary.
- Discounts.
- Applicable taxes.
- Payment selection.
- Confirmation.
- Order status.

Integrate with AfriCore Pay.

Support M-Pesa through correctly configured provider infrastructure.

Do not claim real M-Pesa readiness or activate money movement without proper credentials, approvals and live-provider verification.

Distinguish provider sandbox from production.

Do not invent a Shopify-style accelerated payment identity or misuse Shopify branding.

## Order management

- Order lifecycle.
- Payment status.
- Fulfillment status.
- Partial fulfillment.
- Cancellations.
- Returns.
- Exchanges where supported.
- Refund requests.
- Customer notifications.
- Order history.
- Audit history.

Reuse the existing Sales and Finance domains.

Do not invent parallel order/payment records.

## Shipping and fulfillment

- Shipping zones.
- Rate rules.
- Store pickup.
- Delivery options.
- Carrier tracking references.
- Fulfillment assignments.
- Shipping status.
- Fulfillment updates.
- Shipping notifications.

External courier integrations must be activated only when real providers are configured.

## Abandoned checkout

- Persist eligible abandoned checkouts.
- Respect marketing consent.
- Provide recovery links.
- Support approved follow-up workflows.
- Avoid unsolicited or repeated messaging.

## B2B commerce

Implement a foundation for:

- Company accounts.
- Business-specific catalogs.
- Price lists.
- Volume pricing.
- Minimum order quantities.
- Bulk ordering.
- Payment terms.
- Sales representatives.
- Purchase order references.
- Business verification integration.

Use Business ID and trusted credentials where the customer consents.

## African differentiation

Prioritize:

- Kenya-first KES pricing.
- Mobile-first checkout.
- M-Pesa readiness.
- Mobile-friendly storefronts.
- WhatsApp share links.
- Low-bandwidth performance.
- Local pickup.
- Regional shipping configuration.
- Business Passport integration.
- Verified merchant evidence.

Do not display unearned verification claims.

---

# 7. AFRICORE POS

## Purpose

A full operational point-of-sale system for shops, retailers and in-person merchants.

## POS dashboard

- Today's sales.
- Transaction count.
- Active register.
- Payment mix.
- Returns.
- Open shifts.
- Cash variance.
- Top-selling items.
- Low-stock notices.

## Register

Build an efficient cashier screen.

Support:

- Product search.
- Product tiles.
- Barcode input.
- Cart editing.
- Quantities.
- Discounts with permissions.
- Multiple payment methods.
- Customer selection.
- Receipt generation.
- Pending orders.
- Transaction completion.

## Sessions

- Open register.
- Opening cash.
- Cashier identity.
- Transaction history.
- Closing cash.
- Expected vs actual totals.
- Variance explanation.
- Controlled session closing.

## Payments

- Cash.
- Configured supported electronic methods.
- M-Pesa through the approved payment provider.
- Split tender where correctly implemented.
- Refunds.
- Payment reversal handling.

No fake payment confirmations.

## Inventory integration

POS and Commerce share the same products and inventory.

An in-person sale must update canonical stock through authorized fulfillment/movement rules.

Prevent duplicate stock deductions.

## Offline readiness

Evaluate offline operation carefully.

Use a durable local queue only if correct reconciliation, conflicts, permissions and duplicate prevention can be guaranteed.

Do not claim fully offline POS unless real offline transactions and reconnection have been tested.

## Hardware

Support compatible browser-based barcode input and printable receipts.

Other hardware integrations should have explicit compatibility and readiness states.

## Security

Use cashier roles.

Restrict refunds, price overrides, discounts and register closure.

---

# 8. AFRICORE WEBSITE

## Purpose

An easy-to-use no-code business website builder.

This is distinct from Commerce:

- Website builds general business websites.
- Commerce builds the online shopping experience.
- Both may use the same publishing infrastructure.

## Visual editor

Create a Shopify-quality original page editor.

Recommended layout:

- Left: Page/section navigator.
- Center: Live preview canvas.
- Right: Properties inspector.
- Top: Save, Undo, Redo, Preview and Publish.

## Features

- Drag-and-drop sections.
- Layout blocks.
- Text.
- Images.
- Buttons.
- Forms.
- Navigation.
- Hero sections.
- Feature sections.
- Testimonials.
- Pricing sections.
- Contact sections.
- FAQ.
- Footer.
- Blog.
- Product collections where Commerce is installed.

## Editing experience

- Select blocks visually.
- Edit inline.
- Rearrange sections.
- Adjust spacing.
- Adjust typography.
- Adjust colors.
- Responsive previews.
- Duplicate sections.
- Hide sections.
- Undo/redo.
- Draft versions.
- Publish/rollback.

Use typed, validated section schemas and controlled rendering.

Do not allow arbitrary customer scripts or unsafe HTML by default.

## Site management

- SEO fields.
- Metadata.
- Sitemap.
- Robots configuration.
- Custom domains.
- SSL.
- Redirects.
- Contact forms.
- Analytics integration.
- Accessibility checks.
- Publish states.

Support website-only businesses without requiring Commerce.

---

# 9. AFRICORE MARKETING

## Purpose

Help businesses acquire, engage and retain customers.

## Dashboard

- Campaign performance.
- Reach.
- Conversions.
- Revenue attribution where defensible.
- Subscribers.
- Segments.
- Automation activity.
- Deliverability.
- Engagement trends.

## Campaigns

- Email marketing.
- Approved SMS integration.
- Approved WhatsApp Business integration.
- Campaign scheduling.
- Templates.
- Audience selection.
- Personalization.
- Delivery status.
- Reporting.

Do not claim outbound messaging works without configured providers.

## Customer segments

Use canonical CRM/customer data.

Support:

- Customer tags.
- Purchase history.
- Order frequency.
- Customer activity.
- Geographic or business-defined attributes.
- Saved filters.
- Consent states.

## Automations

Integrate with the existing Automations engine.

Examples:

- Welcome campaign.
- Abandoned-cart reminder.
- Post-purchase follow-up.
- Customer reactivation.
- Review request.
- Customer milestone.

## Compliance

- Consent management.
- Opt-out mechanisms.
- Suppression lists.
- Message audit history.
- Provider rate limits.
- Kenya Data Protection Act considerations.
- Sensitive data access controls.

No spam-oriented mass messaging.

---

# 10. AFRICORE SUPPORT

## Purpose

Customer service and helpdesk management.

## Features

- Support inbox.
- Tickets.
- Ticket status.
- Priority.
- Assigned agent.
- Team assignment.
- Categories.
- Tags.
- Internal notes.
- Customer replies.
- Attachments.
- SLA targets.
- Escalations.
- Saved replies.
- Knowledge base.
- Customer satisfaction collection.

## Customer connections

Tickets may link to:

- Customer.
- Order.
- Invoice.
- Payment.
- Product.
- Shipment.
- Project.

Respect customer authorization and agent permissions.

## Channels

Implement supported in-app/web form ticket submission.

Email and external messaging channels require genuine inbound/outbound connectors.

## Automation

- Ticket created → assign team.
- Priority changed → notify manager.
- SLA approaching → alert agent.
- Ticket resolved → request feedback.

## Reporting

- Open tickets.
- Resolution times.
- First response time.
- Backlog.
- SLA compliance.
- Customer satisfaction where measured.

Do not invent satisfaction responses.

---

# 11. AFRICORE SUBSCRIPTIONS

## Purpose

Recurring billing and subscription management for AfriCore business customers and merchants.

This is distinct from AfriCore's own platform usage-billing system.

## Features

- Subscription products.
- Plans.
- Billing intervals.
- Trials.
- Customer subscriptions.
- Activation.
- Renewals.
- Cancellation.
- Pausing.
- Plan changes.
- Proration where correctly implemented.
- Recurring invoices.
- Dunning/reminders.
- Payment status.
- Revenue reporting.

## Integration

Reuse:

- CRM customers.
- Product catalog.
- Finance invoices.
- AfriCore Pay.
- Accounting.
- Automations.
- Analytics.

## Important financial controls

- Do not equate an invoice with payment.
- Correctly handle failed renewals.
- Maintain idempotency.
- Preserve historical pricing.
- Avoid double billing.
- Track effective cancellation dates.
- Obtain consent to recurring charges.
- Honor actual provider capabilities.

Do not claim automatic M-Pesa recurring debits without an authorized supported payment mandate.

---

# PART IV — WAVE 3 CROSS-APP INTEGRATION

## 12. Unified commerce data

All six new apps must reuse authoritative data.

Canonical entities should include:

- Customer.
- Product.
- Product variant.
- Inventory balance/movement.
- Stock reservation.
- Sales order.
- Commerce order.
- Invoice.
- Payment.
- Fulfillment.
- Supplier.
- Subscription.
- Support ticket.
- Marketing consent.
- Campaign.
- Website.
- Storefront.
- Checkout.

Choose whether Commerce orders are specialized Sales orders or a tightly controlled domain projection.

Do not create competing order identities that can independently change financial truth.

## 13. Cross-app workflows

### Workflow A — Online sale

Customer purchases a product from a Commerce storefront.

1. Checkout validates price and availability.
2. Checkout creates a durable order/payment intent.
3. Payment uses configured provider.
4. Provider confirmation is verified.
5. Order transitions correctly.
6. Inventory reservation/fulfillment updates.
7. Finance reflects proper invoice and payment records.
8. CRM timeline updates.
9. Accounting source becomes available.
10. Analytics reflects the transaction.
11. Notifications inform authorized members.
12. Support can access linked order context.

### Workflow B — POS sale

Cashier completes a sale.

Inventory records the proper physical movement.

Finance records the authorized settlement evidence.

Analytics refreshes.

### Workflow C — Website lead

A website form creates a CRM lead.

Marketing consent is tracked.

Sales can convert the lead into an opportunity.

### Workflow D — Subscription renewal

Subscription becomes due.

An invoice is generated.

A payment attempt occurs only when a supported mandate permits it.

Confirmed payment updates the subscription.

Failure triggers approved reminders.

### Workflow E — Customer support

A customer creates a support ticket linked to an order.

Authorized agents inspect permitted order data.

The support team resolves the issue.

Related records and notifications update.

---

# PART V — APP MARKETPLACE AND ENTITLEMENTS

## 14. Integrate the new six apps into Apps

Each new app must have:

- Original icon.
- Name.
- Description.
- Category.
- Supported workspaces.
- Included services.
- Optional services.
- Installation state.
- Setup progress.
- App-specific dashboard.
- Documentation.
- Uninstall handling.

## 15. Installation flow

- Free installation.
- Review included services.
- Disclose relevant usage pricing.
- Obtain necessary consent.
- Activate required eligible services.
- Avoid duplicate entitlements.
- Preserve independent service access.

## 16. Workspace eligibility

Business workspaces are the primary target for Wave 3.

Personal workspaces may access appropriate features, such as an individual seller's simplified Commerce, Website or Subscriptions experience, where genuinely supported.

Developer workspaces should retain APIs, SDKs, webhooks, logs and integration tools without being forced into merchant apps.

---

# PART VI — PLATFORM-WIDE FINAL UI TRANSFORMATION

## 17. Scope

After Wave 3 is functionally complete, redesign the user experience throughout the entire authenticated platform.

This is not limited to the six new apps.

**The UI phase must cover all eighteen applications, all existing direct services, shared workspace pages and relevant Personal and Developer experiences.**

It must also cover:

- App marketplace.
- Service marketplace.
- Service detail pages.
- Installation and activation flows.
- Usage and Billing.
- Notifications.
- Approvals.
- Settings.
- Profiles.
- Search.
- Tables.
- Forms.
- Dialogs.
- Charts.
- Reports.
- Empty states.
- Error states.
- Mobile layouts.

Don't stop after redesigning Finance or Analytics.

---

# 18. VISUAL DIRECTION

The founder approved a premium AfriCore Finance dashboard reference image.

Treat it as the core visual direction.

Design influences:

- Shopify: merchant dashboard clarity, analytics, filters, navigation and report interactions.
- Odoo: integrated operational workflows and multiple record views.
- Existing AfriCore brand: charcoal navigation, white/light workspace, lime-green accents.

Use the existing brand identity.

Do not copy Shopify's or Odoo's brand assets or their exact proprietary UI.

## Design principles

- Premium.
- Compact.
- Professional.
- Modern.
- Fast.
- Clear.
- Original.
- Accessible.
- Consistent.
- Business-oriented.

Do not use giant cards and excessive whitespace.

Avoid generic pages filled with identical rectangular cards.

Build meaningful information hierarchy.

Use charts, data tables, timelines, Kanban boards, detail panels, split views, activity feeds and operational tools appropriately.

---

# 19. COMPLETE DESIGN SYSTEM

Create a documented reusable design system.

Include:

## Foundations

- Color tokens.
- Typography scale.
- Spacing.
- Grid.
- Border radius.
- Shadows.
- Elevation.
- Iconography.
- Responsive breakpoints.
- Motion.
- Accessibility states.

## Components

- Buttons.
- Inputs.
- Search.
- Selects.
- Comboboxes.
- Date pickers.
- Data tables.
- Row actions.
- Pagination.
- Filter bars.
- Side panels.
- Drawers.
- Modals.
- Tabs.
- Breadcrumbs.
- Menus.
- Notifications.
- Activity feeds.
- Stepper flows.
- Status indicators.
- Command palette.
- Charts.
- Empty states.
- Error states.
- Skeletons.
- File uploads.
- Kanban boards.
- Timeline views.
- Calendar views.

Use existing frameworks/libraries where appropriate.

Avoid introducing several overlapping component systems.

---

# 20. REDESIGN GLOBAL NAVIGATION

Use the approved dark sidebar style.

Top-level navigation should remain understandable as the application catalog grows.

Recommended information architecture:

- Home.
- Apps.
- Services.
- Search.
- Notifications.
- Approvals.
- Usage & Billing.
- Settings.

When an app is open, show contextual app navigation.

Do not show every feature of every app permanently in the sidebar.

Support:

- App launcher.
- Favorites.
- Recent apps.
- Search.
- Collapsible navigation.
- Clear active states.
- Breadcrumbs.
- Workspace switching.
- Keyboard shortcuts.
- Mobile navigation.

Keep existing Services directly accessible.

---

# 21. REDESIGN ALL APPLICATION INTERIORS

Every app must receive a distinct, thoughtful dashboard and operational layout.

### Finance

Financial KPIs, cash-flow charts, receivables, expense composition, invoices and actions.

### CRM

Pipeline board, lead conversion, follow-ups, customer activity and team performance.

### Inventory

Stock overview, availability, warehouse movements, reorder alerts and product analysis.

### Sales

Sales trends, quotation funnel, order list, fulfillment, customer performance.

### Analytics

Customizable cross-business dashboard with detailed reports.

### Automations

Workflow canvas, run activity, approvals and operational health.

### Work

Beautiful collaborative boards, project timelines, tasks, discussions and workload.

### Accounting

Ledger-centered interface, journal review, reconciliation, statements and financial controls.

### People

Employee directory, org chart, leave calendar, attendance and onboarding.

### Procurement

Supplier views, purchase order pipelines, receiving and invoice matching.

### Documents

Polished file browser, folders, grid/list views, preview panel and drag-and-drop interactions.

### Business ID

Business Passport, verification progress, credential cards, controlled sharing and evidence history.

### Commerce

Merchant dashboard, products, storefront, orders, checkout, shipping and reports.

### POS

Fast cashier-centered register, product grid, cart and session views.

### Website

Visual drag-and-drop editor, preview and publishing.

### Marketing

Campaign workspace, audiences, funnel reports and automation.

### Support

Split-panel ticket inbox, customer details and agent workflows.

### Subscriptions

Recurring billing dashboard, plans, customer subscriptions, renewals and payment health.

No application should be a generic copy of another's dashboard.

---

# PART VII — SHOPIFY-CLASS CHARTS AND ANALYTICS

## 22. Universal chart architecture

This is a high-priority part of the final UI phase.

Build one reusable analytics visualization system that can be used throughout AfriCore.

Research Shopify's current Analytics overview, reporting and exploration features.

Implement comparable interaction quality using original AfriCore visuals.

The system must support appropriate chart types.

## Required chart types

1. Line charts.
2. Area charts.
3. Multi-series line charts.
4. Stacked area charts.
5. Bar charts.
6. Grouped bar charts.
7. Stacked bar charts.
8. Horizontal bar charts.
9. Donut charts.
10. Pie charts where genuinely appropriate.
11. Funnel charts.
12. Scatter plots.
13. Heatmaps.
14. Waterfall charts.
15. Histograms.
16. Cohort/retention tables.
17. Time-series comparison charts.
18. Sparklines.
19. KPI cards.
20. Detailed data tables and pivot-like summaries.

Use each visualization only when suitable for the underlying data.

Do not turn every metric into a pie chart.

---

# 23. CHART EXPERIENCE

Charts should feel highly interactive and premium.

## Line chart interactions

Implement:

- Smooth, crisp lines.
- Readable axes.
- Precise pointer hover.
- Crosshair.
- Data-point tooltips.
- Active-point highlighting.
- Multiple series.
- Legend toggling.
- Date selection.
- Comparison periods.
- Responsive layout.
- Zoom where useful.
- Drill-down.
- Data export.
- Loading and empty states.

Optional animation must remain performant and respect reduced-motion preferences.

## Date controls

Support:

- Today.
- Yesterday.
- Last 7 days.
- Last 30 days.
- Last 90 days.
- Month to date.
- Quarter to date.
- Year to date.
- Last year.
- Custom range.

Support previous-period comparison.

Choose correct timezone and bucket boundaries.

Use the workspace's configured timezone.

## Multi-series comparisons

Allow useful comparisons such as:

- Current period versus previous period.
- Sales versus refunds.
- Revenue versus expenses.
- Orders versus fulfilled orders.
- New versus returning customers.
- Inventory incoming versus outgoing.
- Marketing spend versus attributed sales.

Never combine incomparable units on one axis without clear explanation.

---

# 24. CUSTOMIZABLE DASHBOARDS

Implement Shopify-style customization patterns.

Users with permission can:

- Add metric cards.
- Remove metric cards.
- Rearrange cards.
- Resize cards.
- Organize sections.
- Save layouts.
- Restore defaults.
- Choose date ranges.
- Add saved reports.
- Set supported metric goals.
- Change visible datasets.
- Select chart types where appropriate.

Use drag-and-drop on desktop.

Provide accessible keyboard alternatives.

Persist the layouts per authorized workspace/user configuration.

A customized dashboard should survive refresh and subsequent sign-in.

Do not let layout personalization change access permissions.

---

# 25. DETAILED REPORTS

Clicking a metric should open a meaningful report.

Example:

Sales KPI → Detailed Sales Report.

The report should include:

- Correct metric definition.
- Visualization.
- Date range.
- Comparisons.
- Dimensions.
- Filters.
- Underlying records where authorized.
- Drill-down.
- Export.
- Saved views.

Do not create charts that lead nowhere.

Support relevant cross-app navigation.

---

# 26. DATA CORRECTNESS

A beautiful chart displaying incorrect numbers is a failed implementation.

All analytics must use authorized, authoritative records.

Clearly distinguish:

- Real financial records.
- Sandbox transactions.
- Imported records.
- Unverified payment evidence.
- Recorded operational events.
- Derived metrics.
- Estimates.
- Forecasts.

Don't mix real and sandbox money into one live revenue number.

Do not treat an invoice as a payment.

Do not treat a stock reservation as dispatched inventory.

Do not count a reversed payment as permanent net collected funds if the reversal is effective.

Do not treat a draft journal as a posted ledger transaction.

Do not invent conversion-rate denominators when visitor-session tracking is unavailable.

## Metric metadata

Each metric must document:

- Name.
- Definition.
- Data source.
- Currency or unit.
- Time range.
- Timezone.
- Refresh timestamp.
- Coverage.
- Missing-data behavior.
- Authorization policy.

Use precise decimal arithmetic for money.

---

# 27. CENTRALIZED ANALYTICS INFRASTRUCTURE

Reuse existing Analytics services and APIs.

Improve them where needed.

Use a shared metric/visualization contract so Finance, Commerce, CRM, Inventory, POS and other apps can use the same chart engine without duplicating business logic.

Provide:

- Typed metric definitions.
- Time-series queries.
- Aggregation.
- Filtering.
- Grouping.
- Comparison.
- Pagination.
- Caching.
- Permission enforcement.
- Export.
- Saved reports.
- Dashboard layouts.

Use appropriate database indexes.

Avoid slow queries that block the UI.

Cache only within correct tenant and permission boundaries.

---

# PART VIII — SERVICES UI TRANSFORMATION

## 28. REDESIGN THE SERVICES EXPERIENCE

The founder wants significant improvements to all existing AfriCore services.

This phase must include the Services area—not just Apps.

For every service, provide a consistent product experience that is appropriate to its actual function.

## Service overview

Show:

- Icon and name.
- Purpose.
- Activation state.
- Connected apps.
- Included capabilities.
- Usage.
- Pricing.
- Configuration.
- Quick actions.
- Recent activity.
- Errors/health where meaningful.
- Documentation.
- API access where applicable.

## Active service page

Provide real operational capabilities, not a marketing card.

Example:

**Invoicing service:** invoices, customers, status, usage, payment records and actions.

**Inventory service:** products, movements, warehouse records and stock.

**Verification service:** evidence requests, verification states and consent.

**AfriCore Pay:** transaction history, checkout links, provider readiness, reconciliation and settlement evidence.

## Service dependency visibility

Show which installed apps use a service.

Allow direct access without opening an app.

Prevent duplicate entitlements.

Explain usage-based costs clearly.

## Developer presentation

In Developer workspaces, eligible services should be presented as APIs and infrastructure tools.

Include:

- Authentication.
- API key management.
- Documentation.
- Request examples.
- Webhooks.
- Logs.
- Usage.
- Rate limits.
- Error diagnostics.
- Environment readiness.

Do not misrepresent a business dashboard as a developer API console.

## Personal presentation

Keep the service experience relevant to individuals and freelancers.

Hide or explain unsupported business-only functionality.

---

# PART IX — PROFILE, NOTIFICATIONS AND WORKSPACE SETTINGS

## 29. User profile enhancement

The earlier approved dashboard included a profile picture.

The founder previously deferred profile-image uploads.

Implement this during the final UI phase.

Support:

- Profile image upload.
- Image cropping/preview.
- Remove/change image.
- Secure file validation.
- Appropriate size limits.
- Authorized storage.
- Initials fallback.

Do not use fabricated profile photographs.

## 30. Notifications

Improve:

- Notification bell.
- Unread count.
- Notification center.
- Relevant event summaries.
- Actionable links.
- Approval requests.
- Preferences.
- Read states.
- Realtime/polling updates.
- Reduced notification noise.

## 31. Workspace settings

Create a consistent settings experience:

- Workspace profile.
- Members.
- Roles.
- Permissions.
- Security.
- Notifications.
- Service configuration.
- Billing.
- App management.
- Integrations.
- Audit history.
- Data/privacy settings.

Preserve backend enforcement.

---

# PART X — PERFORMANCE, ACCESSIBILITY AND MOBILE

## 32. Responsiveness

Test:

- 320px.
- 375px.
- 390px.
- 768px.
- 1024px.
- 1280px.
- 1440px.
- Large desktop screens.

Mobile layouts must remain usable.

Do not simply shrink desktop charts and tables until they become unreadable.

Provide mobile-specific arrangements.

## 33. Accessibility

Target WCAG 2.2 AA.

Include:

- Semantic controls.
- Keyboard navigation.
- Visible focus.
- Appropriate contrast.
- Screen-reader labels.
- Accessible chart alternatives.
- Accessible data tables.
- Reduced motion.
- Touch target sizing.

## 34. Performance

- Route-level code splitting.
- Lazy-load heavy chart/editor modules.
- Efficient data fetching.
- Virtualized long lists where appropriate.
- Cached analytics.
- Optimized images.
- Responsive rendering.
- No excessive full-page spinners.
- Fast app switching.

Avoid unnecessary visual animation that slows operational workflows.

---

# PART XI — SECURITY AND FINANCIAL SAFETY

## 35. Preserve all existing guarantees

- Neon Managed Auth.
- Session security.
- Workspace isolation.
- Role permissions.
- Service authorization.
- Approval boundaries.
- Audit trails.
- Payment idempotency.
- Issued invoice integrity.
- Accounting posting controls.
- Stock reservation accuracy.
- Private document access.
- Credential verification.
- Data protection.

New Commerce, Website and Marketing features introduce additional attack surfaces.

Validate:

- Checkout manipulation.
- Discount abuse.
- Script injection.
- Unsafe website content.
- Uploaded files.
- Public storefront authorization.
- Customer data exposure.
- Webhook spoofing.
- Duplicate orders.
- Payment retries.
- Tenant boundary violations.

Use server-side calculations and validation.

Never trust client-provided order totals.

---

# PART XII — TESTING

## 36. Wave 3 end-to-end tests

### Commerce

Create store → add canonical product → publish → add to cart → checkout → confirm test payment → verify order → verify stock → verify Finance → verify CRM.

### POS

Open register → sell product → close transaction → verify inventory → verify payment evidence → close session.

### Website

Create page → edit blocks → preview → publish → open public site → verify persisted content.

### Marketing

Create consented segment → configure campaign → run supported test delivery → verify reporting.

### Support

Create ticket → assign agent → respond → attach order → resolve → confirm history.

### Subscriptions

Create plan → subscribe customer → generate invoice → test valid renewal event → verify idempotency and status.

## 37. Full UI regression

For every existing application and service:

- Open dashboard.
- Open records.
- Navigate.
- Search.
- Filter.
- Create.
- Edit.
- Save.
- Refresh.
- Verify persistence.
- Test authorization.
- Test mobile.
- Test chart rendering where applicable.
- Test failures.
- Check accessibility.

## 38. Chart tests

- Correct aggregation.
- Correct date boundaries.
- Correct currency.
- Correct comparison periods.
- Correct tooltip values.
- Correct empty states.
- Correct negative values.
- Correct partial data.
- Correct permission enforcement.
- Correct sandbox separation.
- Correct reversal handling.
- Correct exports.

Do not claim Shopify-level chart quality without actually testing visual interactions.

---

# PART XIII — IMPLEMENTATION ORDER

## PHASE 1 — WAVE 3

### Checkpoint 1

Repository audit, regression baseline and known-issue investigation.

### Checkpoint 2

Commerce shared domain/API foundation.

### Checkpoint 3

Commerce and storefront/checkout.

### Checkpoint 4

POS.

### Checkpoint 5

Website and visual editor.

### Checkpoint 6

Marketing.

### Checkpoint 7

Support.

### Checkpoint 8

Subscriptions.

### Checkpoint 9

Cross-app integrations, security and end-to-end tests.

### Checkpoint 10

Safe migrations and authorized deployment.

Do not start the final UI overhaul before Wave 3's core functionality is verified.

## PHASE 2 — FULL UI/UX TRANSFORMATION

### Checkpoint 11

Visual and UX audit across all eighteen apps and services.

### Checkpoint 12

Design tokens, component system and navigation shell.

### Checkpoint 13

Shared Shopify-class analytics and chart engine.

### Checkpoint 14

All twelve Waves 1–2 app redesigns.

### Checkpoint 15

All six Wave 3 app refinements.

### Checkpoint 16

Direct Services, App Marketplace and Service Marketplace redesign.

### Checkpoint 17

Personal, Business and Developer workspace refinements.

### Checkpoint 18

Profiles, notifications, settings and approval UX.

### Checkpoint 19

Responsive, accessibility and performance validation.

### Checkpoint 20

Complete regression tests, visual screenshots and deployment.

Do not stop after just a few redesigned screens.

---

# PART XIV — REQUIRED REFERENCES

Research current official source material before implementation:

Shopify Analytics:
https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/

Shopify Dashboard Customization:
https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/customizing-overview-dashboard

Shopify Themes:
https://help.shopify.com/en/manual/online-store/themes/customizing-themes/theme-editor/features-overview

Shopify Products:
https://help.shopify.com/en/manual/products

Shopify Orders:
https://help.shopify.com/en/manual/fulfillment/managing-orders

Shopify Checkout:
https://help.shopify.com/en/manual/checkout-settings

Shopify POS:
https://help.shopify.com/en/manual/sell-in-person

Shopify B2B:
https://help.shopify.com/en/manual/b2b

Odoo 20 Documentation:
https://www.odoo.com/documentation/20.0/

Odoo eCommerce:
https://www.odoo.com/documentation/20.0/applications/websites/ecommerce.html

Odoo POS:
https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale.html

Odoo Website:
https://www.odoo.com/documentation/20.0/applications/websites/website.html

Use these for functional patterns and capability benchmarking.

Do not copy source code, protected designs or third-party brand identity.

---

# PART XV — DOCUMENTATION AND REPORTING

Update:

- `AGENTS.md`
- App architecture.
- Commerce domain model.
- Checkout lifecycle.
- Storefront publishing.
- POS.
- Website editor.
- Marketing.
- Support.
- Subscriptions.
- Cross-app event design.
- Entitlement relationships.
- Usage metering.
- Payment/security boundaries.
- Chart architecture.
- Analytics definitions.
- Design system.
- Responsive rules.
- Testing.
- Migration/deployment guides.

Produce:

1. `docs/WAVE_3_IMPLEMENTATION_REPORT.md`
2. `docs/PLATFORM_UI_TRANSFORMATION_REPORT.md`

Include actual test outcomes, implementation evidence, screenshots, limitations and unresolved issues.

Do not report unfinished work as completed.

---

# PART XVI — STRICT FUTURE PHASE BOUNDARIES

Do not begin manufacturing during this assignment.

Do not begin specialized industry apps during this assignment.

Do not begin AfriCore Studio during this assignment.

These are the next major development initiatives after Wave 3 and the platform UI transformation.

Future manufacturing applications may include:

- Manufacturing.
- Quality Control.
- Maintenance.
- Field Service.
- Rental.
- Repair Operations.

Additional vertical apps will be researched and prioritized separately.

AfriCore Studio will later allow authorized users to create custom business apps, forms, record types, views and workflows using secure no-code/low-code tools.

Prepare reusable infrastructure where natural, but do not implement Studio prematurely.

---

# FINAL SUCCESS CRITERIA

This assignment is complete only when:

1. Six new Wave 3 applications work end to end.
2. AfriCore has eighteen usable interconnected business applications.
3. Commerce provides a convincing Shopify-class merchant experience within the documented implemented scope.
4. POS uses canonical inventory and transaction data.
5. Website supports real drag-and-drop editing and publishing.
6. Marketing, Support and Subscriptions perform real supported workflows.
7. Existing services remain independently accessible.
8. App installation activates eligible service dependencies correctly.
9. Security, billing, authorization and financial integrity remain intact.
10. Every one of the eighteen apps receives the final UI transformation.
11. Direct Services pages receive the same quality improvement.
12. The entire authenticated workspace receives coherent navigation and visual design.
13. Shared charts support professional, interactive line, area, bar, donut, funnel and other appropriate visualization types.
14. Dashboards allow useful customization, period comparisons and drill-down.
15. Every analytics figure comes from appropriately authorized and accurately classified records.
16. Mobile and desktop interfaces work.
17. Previous successful workflows remain functional.
18. Known defects are investigated, repaired where applicable and documented.
19. Production changes are validated and deployed safely.
20. Implementation and UI reports contain honest evidence.

## FINAL INSTRUCTION

**Build Wave 3 first. Then redesign the entire AfriCore platform—every app, every relevant service, every important business screen, and the complete analytics experience.**

The outcome must combine:

- Odoo-class interconnected business operations.
- Shopify-class commerce usability.
- Shopify-quality interactive dashboards and data visualizations.
- AfriCore's African payments, business identity and programmable service infrastructure.

Do not settle for generic cards, disconnected modules, placeholder actions or impressive-looking charts backed by incorrect data.

Build a coherent, secure, sophisticated business operating system that people can genuinely use to operate their businesses.

Maintain stage checkpoints, continue implementation where technically possible, and report genuine blockers without inventing completion.

**Manufacturing, specialized industry applications and AfriCore Studio will be implemented in later assignments.**