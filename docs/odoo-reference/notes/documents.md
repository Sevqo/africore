# Documents reference notes

Date: 19 November 2026. Reference scope: user-supplied Odoo screenshots and official Odoo 20 user documentation. The screenshots are visual references, not proof of AfriCore behavior.

## Reference patterns

The supplied screens show a left navigation tree for All, Company, My Drive, Shared with me, Recent and Trash; a folder/file card or list area; breadcrumb navigation; a New menu for upload, request, link, spreadsheet and folder creation; a details/chatter pane beside the file preview; per-folder actions; and bulk file selection. Other references show linked business records, planned activities and file tags. The official [Odoo 20 Documents guide](https://www.odoo.com/documentation/20.0/applications/productivity/documents.html) and [Documents features page](https://www.odoo.com/app/documents-features) also describe versions, requests, links, sharing roles/expiry, file workflows, OCR/AI sorting and PDF operations. [Finance Documents](https://www.odoo.com/documentation/20.0/applications/finance/documents.html), [Sign](https://www.odoo.com/documentation/20.0/applications/productivity/sign.html), and [Spreadsheet](https://www.odoo.com/documentation/20.0/applications/finance/spreadsheet.html) cover adjacent product capabilities.

## AfriCore behavior and comparison

The base AfriCore Documents implementation predates this checkpoint and remains authoritative for encrypted canonical file/version storage, file-size/type/quota checks, membership and explicit grants, inherited folder permissions, privacy-scoped linked records, reviews/requests, trash/restore, tags/stars, server paging and image/text previews. The 2.11B delta adds a lazy server-paged nested-folder tree, branch loading/error/retry/More controls, a mobile tree toggle, clearer private-folder copy and a lazy-loaded PDF.js canvas preview. It does not add tables, API routes or migrations.

The local synthetic browser run expanded a nested folder, opened a 605-byte generated PDF and showed its text and `Page 1 of 1`. The PDF canvas fit the 550px preview viewport. The authorized Download control completed. PDF bytes remained private and were delivered via the existing authorized content route; rendering used a locally bundled PDF.js worker. No external viewer iframe was used. This is a functional spot check, not a full desktop/tablet visual parity study.

## Coverage and limits

Existing backend tests cover document grants, folder inheritance, content access, expiry/revocation, exact-version review transitions, request recipient validation, trash/restore, linked records, company isolation and integrations with People, Work, Sales, Procurement and Finance. Existing tests also cover upload type/size and quota boundaries. The 2.11B local browser check adds nested tree navigation and PDF preview/download; it did not manually exercise every permission variant in the browser.

AfriCore does not provide public/external links, guest sharing, email/Outlook ingestion, OCR, AI sorting, spreadsheet editing, Sign, file locking, ZIP folder download, batch upload, video/Office preview, PDF merge/split/rotate or malware scanning. Upload is still one file at a time and bounded at 2 MiB. Do not claim Odoo feature parity. Browser tests used synthetic data only; no production or hosted file was accessed or changed. External Cybrosys screenshots could not be fetched by the research browser, so their pixels were not independently verified beyond the supplied attachments.

## Acceptance checks

Founder review should cover Company/My Drive scope separation, breadcrumb/back navigation, folder paging/error recovery, folder rename/move/trash permissions, list/card controls, bulk action authorization, share/view/download restrictions, expiry/revocation, versions/review invalidation, request submit/review, recoverable trash, source-record links and cross-company isolation. Check PDF navigation/zoom at desktop and narrow width, plus a non-PDF private preview. Confirm no horizontal overflow on a phone-sized viewport. Confirm intended hosted runtime separately before release acceptance.
