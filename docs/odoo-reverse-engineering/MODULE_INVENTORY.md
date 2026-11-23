# Odoo 20 Community module inventory

Source: branch 20.0, commit 4968b8772ab96e25471ebbcdcbe32f6049e5b728.

Indexed 668 module manifests and 1393 dependency edges. Manifest parse errors: 0.

The JSON contains manifest metadata/dependencies and statically discovered model classes, fields, method and constraint names, plus Python/XML/security/controller/wizard/report/test paths. No addon Python was executed.

REA 6.10.1 import-reference-source was invoked on the account addon and returned capability_unavailable: safe no-follow opens require Linux/macOS; WSL access was denied. This fallback index is AST-produced, not REA output.

## AfriCore groups

| App group | Modules |
|---|---:|
| Commerce | 25 |
| Finance | 0 |
| Sales | 27 |
| Inventory | 18 |
| CRM | 10 |
| Procurement | 10 |
| Accounting | 253 |
| POS | 54 |
| Work | 11 |
| People | 21 |
| Documents | 2 |
| Analytics | 3 |
| Automations | 2 |
| Business ID | 0 |
| Calendar | 6 |
| Website | 62 |
| Marketing | 26 |
| Support | 6 |
| Subscriptions | 1 |
| Manufacturing | 18 |
| Field Operations | 11 |
| Logistics | 5 |
| Property & Hospitality | 0 |
| Knowledge & Learning | 5 |
| AfriCore Studio | 0 |
| Integrations Hub | 3 |
| Shared platform | 89 |

## Addon list

| Technical name | Display name | Category | AfriCore group | Dependencies | License | Models | XML/view files |
|---|---|---|---|---|---|---:|---:|
| account | Invoicing | Accounting/Accounting | Accounting | analytic, base_setup, digest, onboarding, portal, product | LGPL-3 | 96 | 138 |
| account_check_printing | Check Printing Base | Accounting/Accounting | Accounting | account | LGPL-3 | 6 | 5 |
| account_debit_note | Debit Notes | Accounting/Accounting | Accounting | account | LGPL-3 | 3 | 4 |
| account_edi | Import/Export Invoices From XML/PDF | Accounting/Accounting | Accounting | account | LGPL-3 | 8 | 4 |
| account_edi_proxy_client | Proxy features for account_edi | Accounting/Accounting | Accounting | account, certificate | LGPL-3 | 2 | 1 |
| account_edi_ubl_cii | Import/Export electronic invoices with UBL/CII | Accounting/Accounting | Accounting | account | LGPL-3 | 23 | 201 |
| account_fleet | Accounting/Fleet bridge | Accounting/Accounting | Field Operations | account, fleet | LGPL-3 | 7 | 6 |
| account_payment | Payment - Account | Accounting/Accounting | Accounting | account, payment | LGPL-3 | 11 | 14 |
| account_payment_custom | Payment Custom / Account Payment | Accounting/Payment Custom | Accounting | account_payment, payment_custom | LGPL-3 | 4 | 2 |
| account_payment_interco | Intercompany Payment - Account | Accounting/Accounting | Accounting | account_payment | LGPL-3 | 3 | 1 |
| account_peppol | Peppol | Accounting/Accounting | Accounting | account_edi_proxy_client, account_edi_ubl_cii | LGPL-3 | 15 | 15 |
| account_qr_code_emv | account_qr_code_emv | Accounting/Payment | Accounting | account | LGPL-3 | 1 | 1 |
| account_qr_code_sepa | Account SEPA QR Code | Accounting/Payment | Accounting | account | LGPL-3 | 1 | 0 |
| account_tax_python | Define Taxes as Python Code | Accounting/Accounting | Accounting | account | LGPL-3 | 1 | 1 |
| account_test | Accounting Consistency Tests | Accounting/Accounting | Accounting | account | LGPL-3 | 2 | 4 |
| account_update_tax_tags | Account - Allow updating tax grids | Accounting/Accounting | Accounting | account | LGPL-3 | 1 | 2 |
| analytic | Analytic Accounting | Accounting/Accounting | Accounting | base, mail, uom | LGPL-3 | 10 | 8 |
| api_doc | API Documentation | Hidden | Integrations Hub | web | LGPL-3 | 1 | 10 |
| attachment_indexation | Attachments List and Document Indexation | Hidden/Tools | Shared platform | web | LGPL-3 | 1 | 0 |
| auth_ldap | Authentication via LDAP | Hidden/Tools | Shared platform | base, base_setup | LGPL-3 | 4 | 2 |
| auth_oauth | OAuth2 Authentication | Hidden/Tools | Shared platform | auth_signup, base, base_setup, web | LGPL-3 | 4 | 4 |
| auth_passkey | Passkeys | Hidden/Tools | Shared platform | base_setup, web | LGPL-3 | 4 | 5 |
| auth_passkey_portal | Passkeys Portal | Hidden/Tools | Shared platform | auth_passkey, portal | LGPL-3 | 0 | 2 |
| auth_password_policy | Password Policy | Hidden/Tools | Shared platform | base_setup, web | LGPL-3 | 2 | 4 |
| auth_password_policy_portal | Password Policy support for Signup | Tools | Shared platform | auth_password_policy, portal | LGPL-3 | 1 | 1 |
| auth_password_policy_signup | Password Policy support for Signup | Hidden/Tools | Documents | auth_password_policy, auth_signup | LGPL-3 | 1 | 2 |
| auth_signup | Signup | Hidden/Tools | Documents | base_setup, mail, web | LGPL-3 | 4 | 9 |
| auth_timeout | Auth Timeout | Hidden/Tools | Shared platform | auth_passkey, auth_totp, auth_totp_mail, bus | LGPL-3 | 5 | 1 |
| auth_totp | Two-Factor Authentication (TOTP) | Extra Tools | Shared platform | web | LGPL-3 | 5 | 5 |
| auth_totp_mail | 2FA Invite mail | Extra Tools | Shared platform | auth_totp, mail | LGPL-3 | 4 | 7 |
| auth_totp_portal | TOTPortal | Hidden | Shared platform | auth_totp, portal | LGPL-3 | 1 | 1 |
| barcodes | Barcode | Supply Chain/Inventory | Inventory | web | LGPL-3 | 4 | 7 |
| barcodes_gs1_nomenclature | Barcode - GS1 Nomenclature | Supply Chain/Inventory | Inventory | barcodes, uom | LGPL-3 | 3 | 2 |
| base_address_extended | Extended Addresses | Sales/Sales | Sales | web | LGPL-3 | 3 | 3 |
| base_automation | Automation Rules | Sales/Sales | Automations | base, digest, mail, resource, sms | LGPL-3 | 3 | 7 |
| base_geolocalize | Partners Geolocation | Sales/Sales | Sales | base_setup | LGPL-3 | 4 | 5 |
| base_import | Base import | Hidden/Tools | Shared platform | web | LGPL-3 | 4 | 8 |
| base_import_module | Base import module | Hidden/Tools | Shared platform | web | LGPL-3 | 4 | 2 |
| base_install_request | Base - Module Install Request | Hidden | Shared platform | mail | LGPL-3 | 3 | 4 |
| base_report_paper_muncher | Report Engine: Paper Muncher | Hidden/Tools | Shared platform | base_setup | LGPL-3 | 1 | 0 |
| base_report_wkhtmltox | Report Engine: wkhtmltopdf/wkhtmltoimage | Hidden/Tools | Shared platform | — | LGPL-3 | 1 | 0 |
| base_setup | Initial Setup Tools | Hidden | Shared platform | base, web | LGPL-3 | 4 | 4 |
| base_sparse_field | Sparse Fields | Hidden | Shared platform | base | LGPL-3 | 3 | 1 |
| board | Dashboards | Productivity | Shared platform | spreadsheet_dashboard | LGPL-3 | 1 | 4 |
| bus | IM Bus | Hidden | Shared platform | base, web | LGPL-3 | 11 | 1 |
| calendar | Calendar | Productivity/Calendar | Calendar | base, mail | LGPL-3 | 20 | 39 |
| calendar_sms | Calendar - SMS | Productivity/Calendar | Calendar | calendar, sms | LGPL-3 | 3 | 3 |
| certificate | Certificate | Hidden/Tools | Shared platform | base_setup | LGPL-3 | 2 | 4 |
| cloud_storage | Cloud Storage | Technical Settings | Shared platform | base_setup, mail | LGPL-3 | 4 | 3 |
| cloud_storage_azure | Cloud Storage Azure | Technical Settings | Shared platform | cloud_storage | LGPL-3 | 2 | 1 |
| cloud_storage_google | Cloud Storage Google | Technical Settings | Shared platform | cloud_storage | LGPL-3 | 2 | 1 |
| cloud_storage_migration | Cloud Storage Migration | Technical Settings | Shared platform | cloud_storage | LGPL-3 | 3 | 4 |
| contacts | Contacts | Sales/CRM | Sales | base_address_extended, mail, web_hierarchy | LGPL-3 | 2 | 2 |
| crm | CRM | Sales/CRM | CRM | base_install_request, base_setup, calendar, contacts, digest, mail, phone_validation, resource, sales_team, utm, web_tour | LGPL-3 | 23 | 49 |
| crm_iap_enrich | Lead Enrichment | Sales/CRM | CRM | iap_crm, iap_mail | LGPL-3 | 2 | 5 |
| crm_iap_mine | Lead Generation | Sales/CRM | CRM | iap_crm, iap_mail | LGPL-3 | 7 | 7 |
| crm_livechat | CRM Livechat | Sales/CRM | Support | crm, im_livechat | LGPL-3 | 6 | 6 |
| crm_mail_plugin | CRM Mail Plugin | Sales/CRM | CRM | crm, mail_plugin | LGPL-3 | 0 | 2 |
| crm_sale_project | CRM - Project | Sales/CRM | Work | crm, sale_project | LGPL-3 | 4 | 4 |
| crm_sms | SMS in CRM | Sales/CRM | Marketing | crm, sms | LGPL-3 | 0 | 1 |
| data_recycle | Data Recycle | Productivity/Data Cleaning | Shared platform | mail | LGPL-3 | 2 | 6 |
| delivery | Delivery Costs | Sales/Delivery | Logistics | payment_custom, sale | LGPL-3 | 16 | 22 |
| digest | KPI Digests | Marketing | Shared platform | mail, portal, resource | LGPL-3 | 5 | 8 |
| event | Events Organization | Marketing/Events | Shared platform | barcodes, base_setup, digest, mail, phone_validation, portal, utm | LGPL-3 | 20 | 40 |
| event_booth | Events Booths | Marketing/Events | Shared platform | event | LGPL-3 | 5 | 11 |
| event_booth_sale | Events Booths Sales | Marketing/Events | Sales | event_booth, event_sale | LGPL-3 | 10 | 8 |
| event_crm | Event CRM | Marketing/Events | CRM | crm, event | LGPL-3 | 6 | 9 |
| event_crm_sale | Event CRM Sale | Marketing/Events | CRM | event_crm, event_sale | LGPL-3 | 1 | 1 |
| event_product | Events Product | Marketing/Events | Shared platform | account, event, product | LGPL-3 | 6 | 5 |
| event_sale | Events Sales | Marketing/Events | Sales | event_product, sale_management | LGPL-3 | 10 | 13 |
| event_sms | SMS on Events | Marketing/Events | Marketing | event, sms | LGPL-3 | 4 | 2 |
| fleet | Fleet | Human Resources/Fleet | Field Operations | base, mail | LGPL-3 | 17 | 15 |
| fleet_maintenance | Maintenance - Fleet | Human Resources | Field Operations | fleet, maintenance | LGPL-3 | 2 | 3 |
| gamification | Gamification | Human Resources | People | mail | LGPL-3 | 11 | 19 |
| gamification_sale_crm | CRM Gamification | Sales/CRM | CRM | gamification, sale_crm | LGPL-3 | 0 | 2 |
| google_account | Google Users | Hidden/Tools | Accounting | base_setup | LGPL-3 | 1 | 0 |
| google_address_autocomplete | Google Address Autocomplete | Hidden/Tools | Shared platform | web | LGPL-3 | 2 | 4 |
| google_calendar | Google Calendar | Productivity | Calendar | calendar, google_account | LGPL-3 | 12 | 6 |
| google_gmail | Google Gmail | Hidden | Shared platform | mail | LGPL-3 | 5 | 4 |
| google_recaptcha | Google reCAPTCHA integration | Hidden | Shared platform | base_setup | LGPL-3 | 2 | 2 |
| hr | Employees | Human Resources/Employees | People | auth_signup, base_setup, digest, phone_validation, resource_mail, web_hierarchy | LGPL-3 | 34 | 56 |
| hr_address_extended | HR Address Extended | Human Resources/Employees | People | base_address_extended, hr | LGPL-3 | 2 | 1 |
| hr_attendance | Attendances | Human Resources/Attendances | People | barcodes, base_geolocalize, hr, hr_work_entry | LGPL-3 | 12 | 29 |
| hr_calendar | Display Working Hours in Calendar | Human Resources/Employees | Calendar | calendar, hr | LGPL-3 | 4 | 6 |
| hr_calendar_google | HR Calendar with Google Calendar | Human Resources/Remote Work | Calendar | google_calendar, hr_calendar | LGPL-3 | 2 | 1 |
| hr_expense | Expenses | Human Resources/Expenses | People | account, hr, web_tour | LGPL-3 | 25 | 27 |
| hr_fleet | Fleet History | Human Resources | Field Operations | fleet, hr | LGPL-3 | 9 | 5 |
| hr_gamification | HR Gamification | Human Resources | People | gamification, hr | LGPL-3 | 6 | 4 |
| hr_holidays | Time Off | Human Resources/Time Off | People | hr_calendar, hr_work_entry, resource | LGPL-3 | 37 | 53 |
| hr_holidays_attendance | HR Attendance Holidays | Human Resources | People | hr_attendance, hr_holidays | LGPL-3 | 11 | 7 |
| hr_livechat | HR - Livechat | Human Resources | Support | hr, im_livechat | LGPL-3 | 0 | 3 |
| hr_maintenance | Maintenance - HR | Human Resources | Field Operations | hr, maintenance | LGPL-3 | 6 | 3 |
| hr_presence | Employee Presence Control | Human Resources | People | hr, hr_holidays, sms | LGPL-3 | 6 | 6 |
| hr_recruitment | Recruitment | Human Resources/Recruitment | People | attachment_indexation, calendar, digest, hr, utm, web_tour | LGPL-3 | 29 | 34 |
| hr_recruitment_skills | Recruitment - Skills Management | Human Resources/Recruitment | People | hr_recruitment, hr_skills | LGPL-3 | 3 | 6 |
| hr_recruitment_sms | Recruitment - SMS | Human Resources/Recruitment | Marketing | hr_recruitment, sms | LGPL-3 | 1 | 2 |
| hr_recruitment_survey | Hr Recruitment Interview Forms | Human Resources | Knowledge & Learning | hr_recruitment, survey | LGPL-3 | 5 | 9 |
| hr_skills | Skills Management | Human Resources/Employees | People | hr | LGPL-3 | 16 | 27 |
| hr_skills_event | Skills Events | Hidden | People | event, hr_skills | LGPL-3 | 2 | 3 |
| hr_skills_slides | Skills e-learning | Human Resources/Employees | Knowledge & Learning | hr_skills, website_slides | LGPL-3 | 5 | 7 |
| hr_skills_survey | Skills Certification | Human Resources/Employees | Knowledge & Learning | hr_skills, survey | LGPL-3 | 3 | 4 |
| hr_timesheet | Task Logs | Services/Timesheets | People | analytic, hr, project, uom | LGPL-3 | 19 | 22 |
| hr_timesheet_attendance | Timesheets/attendances reporting | Human Resources/Attendances | People | hr_attendance, hr_timesheet | LGPL-3 | 2 | 1 |
| hr_work_entry | Work Entries | Human Resources/Employees | People | hr | LGPL-3 | 13 | 15 |
| html_builder | HTML Builder |  | Shared platform | html_editor | LGPL-3 | 2 | 81 |
| html_editor | HTML Editor | Hidden | Shared platform | base, bus, web | LGPL-3 | 22 | 75 |
| http_routing | Web Routing | Hidden | Shared platform | web | LGPL-3 | 3 | 2 |
| iap | In-App Purchase | Hidden/Tools | Integrations Hub | base_setup, web | LGPL-3 | 5 | 5 |
| iap_crm | IAP / CRM | Hidden/Tools | CRM | crm, iap_mail | LGPL-3 | 1 | 0 |
| iap_mail | IAP / Mail | Hidden/Tools | Integrations Hub | iap, mail | LGPL-3 | 1 | 2 |
| im_livechat | Live Chat | Website/Live Chat | Support | digest, mail, phone_validation, utm | LGPL-3 | 23 | 78 |
| iot_drivers | Hardware Proxy | Hidden | Shared platform | — | LGPL-3 | 0 | 0 |
| iot_webserial | Web Serial IoT devices | Administration/IoT | Shared platform | web | LGPL-3 | 0 | 1 |
| l10n_account_edi_ubl_cii_tests | Testing the Import/Export invoices with UBL/CII | Accounting/Accounting | Accounting | account_edi_ubl_cii, l10n_au, l10n_be, l10n_de, l10n_fr_account, l10n_nl | LGPL-3 | 0 | 42 |
| l10n_account_withholding_tax | Withholding Tax | Accounting/Localizations | Accounting | account | LGPL-3 | 11 | 8 |
| l10n_account_withholding_tax_pos | Withholding Tax on Payment - PoS | Accounting/Localizations | Accounting | l10n_account_withholding_tax, point_of_sale | LGPL-3 | 1 | 0 |
| l10n_ae | United Arab Emirates - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_gcc_invoice | LGPL-3 | 2 | 5 |
| l10n_ae_pos | United Arab Emirates - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_ae, l10n_gcc_pos | LGPL-3 | 1 | 1 |
| l10n_ae_ubl_pint | United Arab Emirates - UBL PINT | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii, account_peppol, l10n_ae | LGPL-3 | 14 | 29 |
| l10n_anz_ubl_pint | Australia & New Zealand - UBL PINT | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii | LGPL-3 | 3 | 1 |
| l10n_ar | Argentina - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_latam_invoice_document | LGPL-3 | 22 | 32 |
| l10n_ar_pos | Argentinean - Point of Sale with AR Doc | Accounting/Localizations/Point of Sale | Accounting | l10n_ar, point_of_sale | LGPL-3 | 4 | 2 |
| l10n_ar_stock | Argentinean - Stock | Accounting/Localizations | Accounting | l10n_ar, stock_account | LGPL-3 | 3 | 7 |
| l10n_ar_website_sale | Argentinean eCommerce | Accounting/Localizations/Website | Website | l10n_ar, website_sale | LGPL-3 | 3 | 2 |
| l10n_ar_withholding | Argentina - Payment Withholdings | Accounting/Localizations | Accounting | l10n_account_withholding_tax, l10n_ar, l10n_latam_check | LGPL-3 | 12 | 5 |
| l10n_at | Austria - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, l10n_din5008 | LGPL-3 | 2 | 3 |
| l10n_au | Australia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 4 | 16 |
| l10n_bd | Bangladesh - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_account_withholding_tax | LGPL-3 | 2 | 2 |
| l10n_be | Belgium - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 8 | 4 |
| l10n_be_pos | BE POS Localization | Sales/Point of Sale | Accounting | account, l10n_be, point_of_sale | LGPL-3 | 1 | 0 |
| l10n_be_pos_restaurant | Belgian POS Restaurant Localization | Sales/Point of Sale | POS | l10n_be, pos_restaurant | LGPL-3 | 2 | 0 |
| l10n_be_pos_sale | l10n_be_pos_sale | Sales/Point of Sale | POS | l10n_be, pos_sale | LGPL-3 | 1 | 0 |
| l10n_bf | Burkina Faso - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_bg | Bulgaria - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 2 |
| l10n_bg_ledger | Bulgaria - Report ledger | Accounting/Localizations/Account Charts | Accounting | l10n_bg | LGPL-3 | 2 | 2 |
| l10n_bh | Bahrain - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_gcc_invoice | LGPL-3 | 2 | 4 |
| l10n_bh_pos | Bahrain - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_bh, l10n_gcc_pos | LGPL-3 | 2 | 1 |
| l10n_bj | Benin - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_bo | Bolivia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_br | Brazilian - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_qr_code_emv, l10n_latam_invoice_document | LGPL-3 | 13 | 14 |
| l10n_br_sales | Brazil - Sale | Sales/Sales | Accounting | l10n_br, sale | LGPL-3 | 1 | 3 |
| l10n_br_website_sale | Brazil - Website Sale | Sales/Sales | Website | l10n_br, website_sale | LGPL-3 | 0 | 1 |
| l10n_ca | Canada - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 5 | 7 |
| l10n_cd | Democratic Republic of the Congo - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_cf | Central African Republic - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_cg | Congo - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_ch | Switzerland - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, l10n_din5008 | LGPL-3 | 10 | 11 |
| l10n_ch_pos | Swiss - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_ch, point_of_sale | LGPL-3 | 1 | 0 |
| l10n_ci | Ivory Coast - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_cl | Chile - Accounting | Accounting/Localizations/Account Charts | Accounting | account, contacts, l10n_latam_invoice_document, uom | LGPL-3 | 11 | 17 |
| l10n_cm | Cameroon - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_cn | China - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base | LGPL-3 | 9 | 11 |
| l10n_co | Colombia - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_debit_note | LGPL-3 | 2 | 2 |
| l10n_co_pos | Colombian - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_co, point_of_sale | LGPL-3 | 2 | 1 |
| l10n_cr | Costa Rica - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 1 |
| l10n_cy | Cyprus - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 1 | 3 |
| l10n_cz | Czech - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 6 | 8 |
| l10n_de | Germany - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, l10n_din5008 | LGPL-3 | 10 | 5 |
| l10n_din5008 | DIN 5008 | Accounting/Localizations | Accounting | account | LGPL-3 | 4 | 5 |
| l10n_din5008_expense | DIN 5008 - Expenses | Accounting/Localizations | Accounting | hr_expense, l10n_din5008 | LGPL-3 | 0 | 1 |
| l10n_din5008_purchase | DIN 5008 - Purchase | Accounting/Localizations | Accounting | l10n_din5008, purchase | LGPL-3 | 0 | 1 |
| l10n_din5008_repair | DIN 5008 - Repair | Accounting/Localizations | Field Operations | l10n_din5008, repair | LGPL-3 | 1 | 2 |
| l10n_din5008_sale | DIN 5008 - Sale | Accounting/Localizations | Accounting | l10n_din5008, sale | LGPL-3 | 0 | 2 |
| l10n_din5008_stock | DIN 5008 - Stock | Accounting/Localizations | Accounting | l10n_din5008, stock | LGPL-3 | 0 | 2 |
| l10n_dk | Denmark - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_proxy_client, account_edi_ubl_cii | LGPL-3 | 15 | 20 |
| l10n_dk_fik | Denmark - FIK Number | Accounting/Localizations | Accounting | l10n_dk | LGPL-3 | 2 | 1 |
| l10n_do | Dominican Republic - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_latam_invoice_document | LGPL-3 | 4 | 8 |
| l10n_dz | Algeria - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_ec | Ecuadorian Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_debit_note, base, l10n_latam_invoice_document | LGPL-3 | 10 | 9 |
| l10n_ec_sale | Ecuador - Sale | Accounting/Localizations/Sale | Accounting | l10n_ec, sale | LGPL-3 | 2 | 2 |
| l10n_ee | Estonia - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 3 | 3 |
| l10n_eg | Egypt - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_account_withholding_tax | LGPL-3 | 4 | 5 |
| l10n_eg_edi_eta | Egypt E-Invoicing | account | Accounting | l10n_eg | LGPL-3 | 16 | 11 |
| l10n_eg_edi_pos | Egypt E-Receipts (POS) | Accounting/Localizations/EDI | Accounting | l10n_eg_edi_eta, point_of_sale | LGPL-3 | 5 | 5 |
| l10n_es | Spain - Accounting (PGCE 2008) | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 11 | 20 |
| l10n_es_edi_facturae | Spain - Facturae EDI | Accounting/Localizations/EDI | Accounting | certificate, l10n_es | LGPL-3 | 11 | 24 |
| l10n_es_edi_sii | Spain - SII EDI Suministro de Libros | Accounting/Localizations/EDI | Accounting | certificate, l10n_es | LGPL-3 | 9 | 6 |
| l10n_es_edi_tbai | Spain - TicketBAI | Accounting/Localizations/EDI | Accounting | certificate, l10n_es | LGPL-3 | 8 | 29 |
| l10n_es_edi_tbai_pos | Spain - Point of Sale + TicketBAI | Accounting/Localizations/Point of Sale | Accounting | l10n_es_edi_tbai, point_of_sale | LGPL-3 | 4 | 3 |
| l10n_es_edi_verifactu | Spain - Veri*Factu | Accounting/Localizations/EDI | Accounting | certificate, l10n_es | LGPL-3 | 12 | 10 |
| l10n_es_edi_verifactu_pos | Spain - Veri*Factu for Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_es_edi_verifactu, point_of_sale | LGPL-3 | 6 | 3 |
| l10n_es_pos | [Deprecated] Spain - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_es, point_of_sale | LGPL-3 | 6 | 3 |
| l10n_es_stock | Spain - Stock - DeCA | Accounting/Localizations | Accounting | l10n_es, stock | LGPL-3 | 4 | 3 |
| l10n_es_stock_batch | Spain - Stock - DeCA Batch Transfers | Accounting/Localizations | Accounting | l10n_es_stock | LGPL-3 | 1 | 1 |
| l10n_es_website_sale | Spain - ECommerce | Accounting/Localizations/Website | Website | l10n_es, website_sale | LGPL-3 | 5 | 1 |
| l10n_es_website_sale_id_type | Spain - eCommerce ID Types | Accounting/Localizations/Website | Website | l10n_es_website_sale | LGPL-3 | 1 | 1 |
| l10n_et | Ethiopia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_eu_account_vies | VAT VIES Validation | Accounting/Accounting | Accounting | account | LGPL-3 | 2 | 2 |
| l10n_eu_oss | EU One Stop Shop (OSS) | Accounting/Localizations | Accounting | account | LGPL-3 | 2 | 1 |
| l10n_fi | Finland - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 3 | 3 |
| l10n_fi_sale | Finland - Sale | Sales/Sales | Accounting | l10n_fi, sale | LGPL-3 | 1 | 0 |
| l10n_fr | France - Localizations | Accounting/Localizations/Account Charts | Accounting | base | LGPL-3 | 2 | 3 |
| l10n_fr_account | France - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, l10n_fr | LGPL-3 | 14 | 6 |
| l10n_fr_facturx_chorus_pro | France - BIS3 integration for Chorus Pro | Accounting/Localizations/EDI | Accounting | account, account_edi_ubl_cii, l10n_fr_account | LGPL-3 | 2 | 5 |
| l10n_fr_hr_holidays | France - Time Off | Human Resources/Time Off | Accounting | hr_holidays | LGPL-3 | 4 | 2 |
| l10n_fr_payment | France - Worldline Payment Branding |  | Accounting | l10n_fr, payment | LGPL-3 | 2 | 0 |
| l10n_fr_pdp | France - E-Invoicing (Approved Platform) | Accounting/Localizations/EDI | Accounting | account_peppol, iap, l10n_fr_account | LGPL-3 | 23 | 48 |
| l10n_fr_pdp_penalty_rate | France - PDP Late Payment Penalty Rate | Accounting/Localizations/EDI | Accounting | l10n_fr_pdp | LGPL-3 | 5 | 2 |
| l10n_fr_pdp_pos | France - E-reporting for POS | Accounting/Localizations/Reporting | Accounting | l10n_fr_pdp, point_of_sale | LGPL-3 | 2 | 0 |
| l10n_fr_pos_cert | France - VAT Anti-Fraud Certification for Point of Sale (CGI 286 I-3 bis) | Accounting/Localizations/Point of Sale | POS | l10n_fr_account, point_of_sale | LGPL-3 | 9 | 8 |
| l10n_ga | Gabon - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_gcc_invoice | Gulf Cooperation Council - Invoice | Accounting/Localizations | Accounting | account | LGPL-3 | 5 | 2 |
| l10n_gcc_invoice_stock_account | Gulf Cooperation Council WMS Accounting | Accounting/Localizations | Accounting | l10n_gcc_invoice, stock_account | LGPL-3 | 0 | 1 |
| l10n_gcc_pos | Gulf Cooperation Council - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_gcc_invoice, point_of_sale | LGPL-3 | 3 | 2 |
| l10n_ge | Georgia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_gf | Guyana - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_gn | Guinea - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_gp | Guadeloupe - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_gq | Guinea Equatorial - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_gr | Greece - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 1 | 2 |
| l10n_gr_edi | Greece - myDATA | Accounting/Localizations | Accounting | account_edi_ubl_cii, l10n_gr | LGPL-3 | 13 | 16 |
| l10n_gr_edi_delivery_note | Greece - myDATA Delivery Note | Accounting/Localizations | Logistics | l10n_gr_edi, sale, sale_stock, stock | LGPL-3 | 4 | 4 |
| l10n_gr_edi_e_invoo | Greece - myDATA E-invoicing through e-invoo | Accounting/Localizations/EDI | Accounting | account_edi_proxy_client, l10n_gr_edi | LGPL-3 | 5 | 2 |
| l10n_gr_edi_e_invoo_bridge | Greece - myDATA E-invoicing through e-invoo (direct API) | Accounting/Localizations/EDI | Accounting | l10n_gr_edi, l10n_gr_edi_e_invoo | LGPL-3 | 4 | 2 |
| l10n_gt | Guatemala - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 1 |
| l10n_gw | Guinea-Bissau - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_hk | Hong Kong - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_qr_code_emv | LGPL-3 | 2 | 4 |
| l10n_hn | Honduras - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base | LGPL-3 | 1 | 1 |
| l10n_hr | Croatia - Accounting (Euro) | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_hr_edi | Croatia - e-invoicing | Accounting/Localizations/Reporting | Accounting | account_edi_ubl_cii, l10n_hr | LGPL-3 | 16 | 20 |
| l10n_hr_kuna | Croatia - Accounting (Kuna) | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_hu | Hungary - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 3 | 2 |
| l10n_hu_edi | Hungary - E-invoicing | Accounting/Localizations/EDI | Accounting | account_debit_note, l10n_hu | LGPL-3 | 14 | 57 |
| l10n_id | Indonesian - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 4 | 5 |
| l10n_id_efaktur_coretax | Indonesia E-faktur (Coretax) | Accounting/Localizations/EDI | Accounting | l10n_id | LGPL-3 | 8 | 10 |
| l10n_id_pos | Indonesia - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_id, point_of_sale | LGPL-3 | 3 | 0 |
| l10n_id_pos_self_order_qris | Indonesia - POS Self Order QRIS | Sales/Point of Sale | POS | l10n_id_pos, pos_self_order | LGPL-3 | 1 | 1 |
| l10n_ie | Ireland - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 3 | 2 |
| l10n_il | Israel - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_in | Indian - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_debit_note, account_tax_python, iap, l10n_account_withholding_tax | LGPL-3 | 21 | 31 |
| l10n_in_boe | Indian - Bill Of Entry | Accounting/Localizations | Accounting | l10n_in, stock_landed_costs | LGPL-3 | 3 | 2 |
| l10n_in_edi | Indian - E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_in | LGPL-3 | 9 | 6 |
| l10n_in_ewaybill | Indian - E-waybill | Accounting/Localizations | Accounting | l10n_in | LGPL-3 | 8 | 8 |
| l10n_in_ewaybill_irn | Indian - E-waybill thru IRN | Accounting/Localizations | Accounting | l10n_in_edi, l10n_in_ewaybill | LGPL-3 | 1 | 2 |
| l10n_in_ewaybill_stock | Indian - E-waybill Stock | Accounting/Localizations/EDI | Accounting | l10n_in_ewaybill, l10n_in_stock | LGPL-3 | 3 | 4 |
| l10n_in_hr_holidays | India - Time Off | Human Resources/Time Off | Accounting | hr_holidays | LGPL-3 | 4 | 4 |
| l10n_in_pos | Indian - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_in, point_of_sale | LGPL-3 | 14 | 13 |
| l10n_in_purchase_stock | India Purchase and Warehouse Management | Accounting/Localizations/Purchase | Accounting | l10n_in_stock, purchase_stock | LGPL-3 | 3 | 0 |
| l10n_in_sale | Indian - Sale Report(GST) | Accounting/Localizations/Sale | Accounting | l10n_in, sale | LGPL-3 | 3 | 2 |
| l10n_in_sale_stock | India Sales and Warehouse Management | Accounting/Localizations/Sale | Accounting | l10n_in_sale, l10n_in_stock, sale_stock | LGPL-3 | 3 | 0 |
| l10n_in_stock | Indian - Stock Report(GST) | Accounting/Localizations | Accounting | l10n_in, stock, stock_account | LGPL-3 | 2 | 3 |
| l10n_iq | Iraq - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 1 |
| l10n_it | Italy - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 5 | 12 |
| l10n_it_edi | Italy - E-invoicing | Accounting/Localizations/EDI | Accounting | account_debit_note, account_edi_proxy_client, l10n_it | LGPL-3 | 14 | 68 |
| l10n_it_edi_doi | Italy - Declaration of Intent | Accounting/Localizations | Accounting | l10n_it_edi, sale | LGPL-3 | 8 | 7 |
| l10n_it_edi_sale | Italy - Sale E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_it_edi, sale | LGPL-3 | 1 | 1 |
| l10n_it_stock_ddt | Italy - Stock DDT | Accounting/Localizations/EDI | Accounting | l10n_it_edi, stock_account, stock_delivery | LGPL-3 | 3 | 6 |
| l10n_jo | Jordan - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_jo_edi | Jordan E-Invoicing | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii, l10n_jo | LGPL-3 | 7 | 14 |
| l10n_jo_edi_pos | Jordan Accounting EDI for POS | Accounting/Localizations/EDI | Accounting | l10n_jo_edi, pos_edi_ubl | LGPL-3 | 7 | 6 |
| l10n_jp | Japan - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 12 |
| l10n_jp_ubl_pint | Japan - UBL PINT | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii | LGPL-3 | 3 | 1 |
| l10n_ke | Kenya - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 5 | 6 |
| l10n_ke_edi_tremol | Kenya Tremol Device EDI Integration | Accounting/Localizations/EDI | Accounting | l10n_ke | LGPL-3 | 6 | 5 |
| l10n_kh | Cambodia - Accounting | Accounting/Localizations/Account Charts | Accounting | account_qr_code_emv, l10n_account_withholding_tax | LGPL-3 | 2 | 5 |
| l10n_km | Comoros - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_kr | Republic of Korea - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 3 | 6 |
| l10n_kr_sale | Republic of Korea - Sales | Accounting/Localizations/Sale | Accounting | l10n_kr, sale | LGPL-3 | 1 | 1 |
| l10n_kw | Kuwait - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_gcc_invoice | LGPL-3 | 1 | 1 |
| l10n_kz | Kazakhstan - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_la | Laos - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_latam_check | Third Party and Deferred/Electronic Checks Management | Accounting/Localizations | Accounting | account | LGPL-3 | 10 | 6 |
| l10n_latam_invoice_document | LATAM Document | Accounting/Localizations | Accounting | account, account_debit_note | LGPL-3 | 9 | 7 |
| l10n_lb_account | Lebanon - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 1 |
| l10n_lk | Sri Lanka - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_account_withholding_tax | LGPL-3 | 5 | 6 |
| l10n_lt | Lithuania - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 3 | 4 |
| l10n_lu | Luxembourg - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 1 | 6 |
| l10n_lv | Latvia - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 1 | 2 |
| l10n_ma | Morocco - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base | LGPL-3 | 3 | 3 |
| l10n_mc | Monaco - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_mk | North Macedonia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 2 |
| l10n_ml | Mali - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_mm | Myanmar - Accounting | Accounting/Localizations/Account Charts | Accounting | account_qr_code_emv, l10n_account_withholding_tax | LGPL-3 | 2 | 3 |
| l10n_mn | Mongolia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_mq | Martinique - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_mr | Mauritania - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_mt | Malta - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 1 | 3 |
| l10n_mt_pos | Malta - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | point_of_sale | LGPL-3 | 1 | 2 |
| l10n_mu_account | Mauritius - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 3 | 3 |
| l10n_mx | Mexico - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 6 | 6 |
| l10n_my | Malaysia - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_tax_python | LGPL-3 | 3 | 3 |
| l10n_my_edi | Malaysia - E-invoicing | Accounting/Localizations/EDI | Accounting | account_edi_proxy_client, l10n_my, l10n_my_ubl_pint | LGPL-3 | 15 | 27 |
| l10n_my_edi_pos | Malaysia - E-invoicing (POS) | Accounting/Localizations/EDI | Accounting | l10n_my_edi, point_of_sale | LGPL-3 | 5 | 10 |
| l10n_my_ubl_pint | Malaysia - UBL PINT | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii | LGPL-3 | 5 | 5 |
| l10n_mz | Mozambique - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base | LGPL-3 | 1 | 2 |
| l10n_ne | Niger - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_ng | Nigeria - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_nl | Netherlands - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 5 | 5 |
| l10n_no | Norway - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 6 | 3 |
| l10n_nz | New Zealand - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 4 |
| l10n_om | Oman - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_gcc_invoice | LGPL-3 | 1 | 2 |
| l10n_pa | Panama - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base_address_extended, contacts, l10n_latam_invoice_document | LGPL-3 | 6 | 7 |
| l10n_pe | Peru - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_debit_note, l10n_latam_invoice_document | LGPL-3 | 9 | 7 |
| l10n_pe_pos | Peruvian - Point of Sale with Pe Doc | Accounting/Localizations/Point of Sale | Accounting | l10n_pe, point_of_sale | LGPL-3 | 6 | 3 |
| l10n_ph | Philippines - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_account_withholding_tax | LGPL-3 | 8 | 12 |
| l10n_ph_invoice | Philippines - Discount Privileges on Invoice | Accounting/Localizations | Accounting | l10n_ph | LGPL-3 | 7 | 4 |
| l10n_ph_sale | Philippines - Discount Privileges on Sale Orders | Accounting/Localizations | Accounting | l10n_ph_invoice, sale | LGPL-3 | 5 | 1 |
| l10n_pk | Pakistan - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_tax_python, l10n_account_withholding_tax, product | LGPL-3 | 6 | 6 |
| l10n_pk_edi | Pakistan - E-invoicing | Accounting/Localizations/EDI | Accounting | account_debit_note, iap, l10n_pk, stock_delivery | LGPL-3 | 14 | 11 |
| l10n_pk_edi_pos | Pakistan - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | iap, l10n_pk, pos_discount, stock_delivery | LGPL-3 | 7 | 10 |
| l10n_pl | Poland - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 10 | 8 |
| l10n_pl_edi | Polish E-Invoicing FA(3) | Accounting/Localizations | Accounting | certificate, l10n_pl | LGPL-3 | 6 | 19 |
| l10n_pl_edi_batch | Polish E-Invoicing Batch Download | Accounting/Localizations | Accounting | l10n_pl_edi | LGPL-3 | 5 | 2 |
| l10n_pl_edi_jst | Polish E-Invoicing FA(3) LGU support | Accounting/Localizations | Accounting | l10n_pl, l10n_pl_edi | LGPL-3 | 2 | 3 |
| l10n_pt | Portugal - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, base | LGPL-3 | 3 | 2 |
| l10n_qa | Qatar - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_gcc_invoice | LGPL-3 | 1 | 1 |
| l10n_re | Reunion - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_ro | Romania - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 2 | 3 |
| l10n_ro_edi | Romania - E-invoicing | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii, l10n_ro | LGPL-3 | 11 | 15 |
| l10n_ro_edi_stock | Romania - E-Transport | Accounting/Localizations/EDI | Accounting | l10n_ro_edi, stock_delivery | LGPL-3 | 4 | 13 |
| l10n_rs | Serbia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 5 |
| l10n_rs_edi | Serbia - eFaktura E-invoicing | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii, l10n_rs | LGPL-3 | 7 | 5 |
| l10n_rw | Rwanda - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_sa | Saudi Arabia - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_debit_note, l10n_account_withholding_tax, l10n_gcc_invoice | LGPL-3 | 9 | 11 |
| l10n_sa_edi | Saudi Arabia - E-invoicing | Accounting/Localizations/EDI | Accounting | account_edi_ubl_cii, certificate, l10n_sa | LGPL-3 | 19 | 23 |
| l10n_sa_edi_pos | Saudi Arabia - E-invoicing (Simplified) | Accounting/Localizations/EDI | Accounting | l10n_sa_edi, l10n_sa_pos | LGPL-3 | 6 | 2 |
| l10n_sa_pos | Saudi Arabia - Point of Sale | Accounting/Localizations/Point of Sale | Accounting | l10n_gcc_pos, l10n_sa | LGPL-3 | 3 | 2 |
| l10n_se | Sweden - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 7 | 5 |
| l10n_sg | Singapore - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii, account_peppol, account_qr_code_emv | LGPL-3 | 8 | 8 |
| l10n_sg_ubl_pint | Singapore - UBL PINT | Accounting/Localizations/EDI | Accounting | l10n_sg | LGPL-3 | 4 | 1 |
| l10n_si | Slovenian - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_edi_ubl_cii | LGPL-3 | 3 | 6 |
| l10n_sk | Slovak - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 6 | 5 |
| l10n_sn | Sénégal - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_syscohada | OHADA - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 1 |
| l10n_td | Tchad - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_test_pos_qr_payment | POS QR Tests | Sales/Point of Sale | POS | account_qr_code_sepa, l10n_be, l10n_br, l10n_ch, l10n_hk, point_of_sale | LGPL-3 | 0 | 0 |
| l10n_tg | Togo - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_syscohada | LGPL-3 | 2 | 2 |
| l10n_th | Thailand - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_qr_code_emv, l10n_account_withholding_tax | LGPL-3 | 12 | 14 |
| l10n_tn | Tunisia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_tr | Türkiye - Accounting | Accounting/Localizations/Account Charts | Accounting | account, contacts | LGPL-3 | 8 | 6 |
| l10n_tw | Taiwan - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 6 |
| l10n_tw_edi_ecpay | Taiwan - E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_tw | LGPL-3 | 10 | 6 |
| l10n_tw_edi_ecpay_pos | Taiwan - E-invoicing Pos | Point of sale/Localizations/EDI | Accounting | l10n_tw_edi_ecpay, point_of_sale | LGPL-3 | 6 | 6 |
| l10n_tw_edi_ecpay_sale | Taiwan - E-invoicing Sales | Website Sale/Localizations/EDI | Accounting | l10n_tw_edi_ecpay, sale | LGPL-3 | 1 | 1 |
| l10n_tw_edi_ecpay_website_sale | Taiwan - E-invoicing Ecommerce | Website Sale/Localizations/EDI | Website | l10n_tw_edi_ecpay_sale, website_sale | LGPL-3 | 3 | 2 |
| l10n_tz_account | Tanzania - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 3 |
| l10n_ua | Ukraine - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_ug | Uganda - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_uk | United Kingdom - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 5 |
| l10n_us | United States - Localizations | Accounting/Localizations/Account Charts | Accounting | base, base_address_extended | LGPL-3 | 3 | 4 |
| l10n_us_account | United States - Accounting | Accounting/Localizations/Account Charts | Accounting | account, base_address_extended, l10n_us | LGPL-3 | 5 | 7 |
| l10n_uy | Uruguay - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_latam_invoice_document | LGPL-3 | 7 | 9 |
| l10n_uz | Uzbekistan - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 2 |
| l10n_ve | Venezuela - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 1 |
| l10n_vn | Vietnam - Accounting | Accounting/Localizations/Account Charts | Accounting | account, account_qr_code_emv | LGPL-3 | 3 | 5 |
| l10n_vn_edi_viettel | Vietnam - E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_vn | LGPL-3 | 8 | 5 |
| l10n_vn_edi_viettel_pos | Vietnam - POS E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_vn_edi_viettel, point_of_sale | LGPL-3 | 7 | 4 |
| l10n_vn_edi_viettel_stock | Vietnam - Delivery E-invoicing | Accounting/Localizations/EDI | Accounting | l10n_vn_edi_viettel, stock | LGPL-3 | 7 | 4 |
| l10n_yt | Mayotte - Accounting | Accounting/Localizations/Account Charts | Accounting | account, l10n_fr_account | LGPL-3 | 0 | 0 |
| l10n_za | South Africa - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 1 | 2 |
| l10n_zm_account | Zambia - Accounting | Accounting/Localizations/Account Charts | Accounting | account | LGPL-3 | 2 | 3 |
| link_tracker | Link Tracker | Marketing | Shared platform | mail, utm | LGPL-3 | 5 | 2 |
| loyalty | Coupons & Loyalty | Sales | Sales | account, portal, product | LGPL-3 | 13 | 17 |
| lunch | Lunch | Human Resources/Lunch | People | mail | LGPL-3 | 13 | 18 |
| mail | Discuss | Productivity/Discuss | Shared platform | base, base_setup, bus, html_editor, web_tour | LGPL-3 | 94 | 271 |
| mail_bot | OdooBot | Productivity/Discuss | Shared platform | mail | LGPL-3 | 3 | 2 |
| mail_bot_hr | OdooBot - HR | Productivity/Discuss | Shared platform | hr, mail_bot | LGPL-3 | 0 | 1 |
| mail_group | Mail Group |  | Shared platform | mail, portal | LGPL-3 | 5 | 14 |
| mail_plugin | Mail Plugin | Sales/CRM | Sales | contacts, digest, web | LGPL-3 | 1 | 4 |
| mail_tracking | Discuss Tracking | Productivity/Discuss | Shared platform | mail | LGPL-3 | 5 | 3 |
| mail_tracking_mass_mailing | Mass Mailing Tracking | Productivity/Discuss | Marketing | mail_tracking, mass_mailing | LGPL-3 | 3 | 1 |
| mail_tracking_sms | SMS Message Tracking | Productivity/Discuss | Marketing | mail_tracking, sms | LGPL-3 | 3 | 1 |
| maintenance | Maintenance | Supply Chain/Maintenance | Field Operations | mail | LGPL-3 | 7 | 9 |
| marketing_card | Marketing Card | Marketing/Marketing Card | Marketing | base_report_wkhtmltox, link_tracker, mass_mailing, website | LGPL-3 | 8 | 12 |
| marketing_card_event | Marketing Card For Events | Marketing/Marketing Card | Marketing | event, marketing_card | LGPL-3 | 3 | 2 |
| mass_mailing | Email Marketing | Marketing/Email Marketing | Marketing | contacts, digest, html_builder, link_tracker, mail, social_media, utm, web_tour | LGPL-3 | 32 | 103 |
| mass_mailing_crm | Mass mailing on lead / opportunities | Marketing/Email Marketing | Marketing | crm, mass_mailing | LGPL-3 | 3 | 1 |
| mass_mailing_crm_sms | Mass mailing sms on lead / opportunities | Marketing/Email Marketing | Marketing | mass_mailing_crm, mass_mailing_sms | LGPL-3 | 1 | 0 |
| mass_mailing_event | Mass mailing on attendees | Marketing/Email Marketing | Marketing | event, mass_mailing | LGPL-3 | 2 | 1 |
| mass_mailing_event_sms | Event Attendees SMS Marketing | Marketing/Email Marketing | Marketing | event, mass_mailing, mass_mailing_event, mass_mailing_sms, sms | LGPL-3 | 1 | 0 |
| mass_mailing_event_track | Mass mailing on track speakers | Marketing/Email Marketing | Marketing | mass_mailing, website_event_track | LGPL-3 | 2 | 1 |
| mass_mailing_event_track_sms | Track Speakers SMS Marketing | Marketing/Email Marketing | Marketing | mass_mailing, mass_mailing_sms, sms, website_event_track | LGPL-3 | 1 | 0 |
| mass_mailing_sale | Mass mailing on sale orders | Marketing/Email Marketing | Marketing | mass_mailing, sale | LGPL-3 | 3 | 5 |
| mass_mailing_sale_sms | Mass mailing sms on sale orders | Marketing/Email Marketing | Marketing | mass_mailing_sale, mass_mailing_sms | LGPL-3 | 1 | 0 |
| mass_mailing_slides | Mass mailing on course members | Marketing/Email Marketing | Marketing | mass_mailing, website_slides | LGPL-3 | 1 | 1 |
| mass_mailing_sms | SMS Marketing | Marketing/Email Marketing | Marketing | mass_mailing, portal, sms | LGPL-3 | 14 | 16 |
| mass_mailing_themes | Mass Mailing Themes | Marketing/Email Marketing | Marketing | mass_mailing | LGPL-3 | 0 | 2 |
| microsoft_account | Microsoft Users | Hidden/Tools | Accounting | base_setup | LGPL-3 | 2 | 1 |
| microsoft_calendar | Outlook Calendar | Productivity | Calendar | calendar, microsoft_account | LGPL-3 | 9 | 6 |
| microsoft_outlook | Microsoft Outlook | Hidden | Shared platform | mail | LGPL-3 | 5 | 4 |
| mrp | Manufacturing | Supply Chain/Manufacturing | Manufacturing | product, resource, stock | LGPL-3 | 55 | 62 |
| mrp_account | Accounting - MRP | Supply Chain/Manufacturing | Manufacturing | mrp, stock_account | LGPL-3 | 20 | 13 |
| mrp_delivery | Delivery and MRP Management | Shipping Connectors | Manufacturing | mrp, stock_delivery | LGPL-3 | 1 | 0 |
| mrp_landed_costs | Landed Costs On MO | Supply Chain/Manufacturing | Manufacturing | mrp, stock_landed_costs | LGPL-3 | 1 | 1 |
| mrp_product_expiry | Manufacturing Expiry | Supply Chain/Manufacturing | Manufacturing | mrp, product_expiry | LGPL-3 | 2 | 1 |
| mrp_repair | Mrp Repairs | Supply Chain/Inventory | Manufacturing | mrp, repair | LGPL-3 | 4 | 2 |
| mrp_subcontracting | MRP Subcontracting | Supply Chain/Manufacturing | Manufacturing | mrp | LGPL-3 | 18 | 25 |
| mrp_subcontracting_account | Subcontracting Management with Stock Valuation | Supply Chain/Manufacturing | Manufacturing | mrp_account, mrp_subcontracting | LGPL-3 | 2 | 0 |
| mrp_subcontracting_dropshipping | Dropship and Subcontracting Management | Supply Chain/Purchase | Manufacturing | mrp_subcontracting, stock_dropshipping | LGPL-3 | 10 | 2 |
| mrp_subcontracting_landed_costs | Landed Costs With Subcontracting order | Supply Chain/Manufacturing | Manufacturing | mrp_landed_costs, mrp_subcontracting | LGPL-3 | 1 | 1 |
| mrp_subcontracting_purchase | Purchase and Subcontracting Management | Supply Chain/Purchase | Manufacturing | mrp_subcontracting_account, purchase_mrp | LGPL-3 | 10 | 3 |
| mysubscription | My Subscription | Sales | Subscriptions | base, web | LGPL-3 | 1 | 11 |
| onboarding | Onboarding Toolbox | Hidden | Shared platform | web | LGPL-3 | 4 | 3 |
| partner_autocomplete | Partner Autocomplete | Hidden/Tools | Shared platform | iap_mail | LGPL-3 | 5 | 5 |
| partnership | Partnership / Membership | Sales/CRM | Sales | crm, sale | LGPL-3 | 7 | 7 |
| payment | Payment Engine | Hidden | Commerce | onboarding, portal | LGPL-3 | 14 | 16 |
| payment_adyen | Payment Provider: Adyen | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 4 | 6 |
| payment_aps | Payment Provider: Amazon Payment Services | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_asiapay | Payment Provider: AsiaPay | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_authorize | Payment Provider: Authorize.Net | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 5 |
| payment_buckaroo | Payment Provider: Buckaroo | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_custom | Payment Provider: Custom Payment Modes | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 4 |
| payment_demo | Payment Provider: Demo | Accounting/Accounting | Commerce | payment | LGPL-3 | 3 | 6 |
| payment_dpo | Payment Provider: DPO | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_ecpay | Payment Provider: ECPay | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_flutterwave | Payment Provider: Flutterwave | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 3 |
| payment_iyzico | Payment Provider: Iyzico | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_mercado_pago | Payment Provider: Mercado Pago | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 5 |
| payment_mollie | Payment Provider: Mollie | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 3 |
| payment_nuvei | Payment Provider: Nuvei | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_paymob | Payment Provider: Paymob | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_paypal | Payment Provider: Paypal | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 6 |
| payment_payu | Payment Provider: PayU | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 4 |
| payment_qfpay | Payment Provider: QFPay | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 4 |
| payment_razorpay | Payment Provider: Razorpay | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 4 |
| payment_redsys | Payment Provider: Redsys | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_stripe | Payment Provider: Stripe | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 3 | 5 |
| payment_toss_payments | Payment Provider: Toss Payments | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 4 |
| payment_worldline | Payment Provider: Worldline | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 3 |
| payment_xendit | Payment Provider: Xendit | Accounting/Payment Providers | Commerce | payment | LGPL-3 | 2 | 4 |
| phone_validation | Phone Numbers Validation | Hidden | Shared platform | base, mail | LGPL-3 | 9 | 4 |
| point_of_sale | Point of Sale | Sales/Point of Sale | POS | account, barcodes_gs1_nomenclature, base_report_wkhtmltox, digest, google_address_autocomplete, html_editor, iot_webserial, phone_validation, product, resource | LGPL-3 | 67 | 147 |
| populate | Populate | Hidden/Tools | Shared platform | base | LGPL-3 | 4 | 0 |
| portal | Customer Portal | Hidden | Shared platform | auth_signup, base_address_extended, html_editor, http_routing, mail, web | LGPL-3 | 14 | 14 |
| portal_discuss | Portal Discuss | Services | Shared platform | mail, portal | LGPL-3 | 2 | 2 |
| portal_rating | Portal Rating | Services | Support | portal, rating | LGPL-3 | 3 | 10 |
| pos_account_tax_python | Allow custom taxes in POS | Accounting/Accounting | POS | account_tax_python, point_of_sale | LGPL-3 | 1 | 0 |
| pos_adyen | POS Adyen | Sales/Point of Sale | POS | payment_adyen, point_of_sale | LGPL-3 | 5 | 2 |
| pos_bancontact_pay | POS Bancontact Pay & Wero | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 5 | 3 |
| pos_cashdro | POS Cashdro Cash Machines | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 2 |
| pos_cashmatic | POS Cashmatic Cash Machines | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 2 |
| pos_discount | Point of Sale Discounts | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 5 | 6 |
| pos_dpopay | PoS DPO Pay | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 2 | 2 |
| pos_edi_ubl | Point of Sale UBL | Sales/Point of Sale | POS | account_edi_ubl_cii, point_of_sale | LGPL-3 | 1 | 0 |
| pos_event | POS - Event | Technical | POS | event_product, point_of_sale | LGPL-3 | 11 | 12 |
| pos_event_sale | PoS - Event Sale | Technical | POS | event_sale, pos_event, pos_sale | LGPL-3 | 3 | 0 |
| pos_glory_cash | POS Glory Cash Machines | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 5 |
| pos_hr | POS - HR | Sales/Point of Sale | POS | hr, point_of_sale | LGPL-3 | 13 | 14 |
| pos_hr_restaurant | POS HR Restaurant | Sales/Point of Sale | POS | pos_hr, pos_restaurant | LGPL-3 | 0 | 0 |
| pos_imin | POS iMin | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 1 |
| pos_loyalty | Point of Sale - Coupons & Loyalty | Sales/Point Of Sale | POS | loyalty, point_of_sale | LGPL-3 | 14 | 16 |
| pos_mercado_pago | POS Mercado Pago | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 1 |
| pos_mollie | POS Mollie | Sales/Point of Sale | POS | payment_mollie, point_of_sale | LGPL-3 | 1 | 1 |
| pos_mrp | pos_mrp | Sales/Point of Sale | POS | mrp, pos_stock | LGPL-3 | 3 | 0 |
| pos_online_payment | Point of Sale online payment |  | POS | account_payment, point_of_sale | LGPL-3 | 6 | 7 |
| pos_online_payment_self_order | POS Self-Order / Online Payment | Sales/Point of Sale | POS | pos_online_payment, pos_self_order | LGPL-3 | 6 | 2 |
| pos_partner_autocomplete | POS Partner Autocomplete | Sales/Point of Sale | POS | partner_autocomplete, point_of_sale | LGPL-3 | 0 | 0 |
| pos_pine_labs | POS Pine Labs | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 2 | 2 |
| pos_qfpay | POS QFPay | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 1 |
| pos_razorpay | POS Razorpay | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 2 | 1 |
| pos_repair | POS - Repair | Technical | POS | pos_stock, repair | LGPL-3 | 2 | 0 |
| pos_restaurant | Restaurant | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 13 | 42 |
| pos_restaurant_loyalty | POS - Restaurant Loyalty | Sales/Point of Sale | POS | pos_loyalty, pos_restaurant | LGPL-3 | 0 | 0 |
| pos_safaricom | POS Safaricom | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 4 | 3 |
| pos_sale | POS - Sales | Sales/Point of Sale | POS | point_of_sale, sale_management | LGPL-3 | 14 | 9 |
| pos_sale_delivery | POS - Sales Delivery | Hidden | POS | pos_sale, stock_delivery | LGPL-3 | 1 | 0 |
| pos_sale_loyalty | POS - Sales Loyalty | Sales/Point of Sale | POS | pos_loyalty, pos_sale | LGPL-3 | 2 | 0 |
| pos_sale_margin | POS - Sale Margin | Sales/Point of Sale | POS | pos_sale, sale_margin | LGPL-3 | 1 | 0 |
| pos_sale_stock | POS - Sales Stock | Sales/Point of Sale | POS | pos_sale, pos_stock | LGPL-3 | 6 | 1 |
| pos_self_order | POS Self Order | Sales/Point Of Sale | POS | base_geolocalize, google_address_autocomplete, http_routing, link_tracker, pos_restaurant | LGPL-3 | 24 | 59 |
| pos_self_order_bancontact_pay | POS Self Order Bancontact Pay & Wero | Sales/Point of Sale | POS | pos_bancontact_pay, pos_self_order | LGPL-3 | 2 | 1 |
| pos_self_order_event | POS Self Order - Event | Sales/Point Of Sale | POS | pos_event, pos_self_order | LGPL-3 | 3 | 5 |
| pos_self_order_pine_labs | POS Self Order Pine Labs | Sales/Point Of Sale | POS | pos_pine_labs, pos_self_order | LGPL-3 | 1 | 0 |
| pos_self_order_qfpay | POS Self Order QFPay | Sales/Point Of Sale | POS | pos_qfpay, pos_self_order | LGPL-3 | 1 | 0 |
| pos_self_order_razorpay | POS Self Order Razorpay | Sales/Point Of Sale | POS | pos_razorpay, pos_self_order | LGPL-3 | 1 | 0 |
| pos_self_order_sale | POS Self Order Sale | Sales/Point Of Sale | POS | pos_sale, pos_self_order | LGPL-3 | 1 | 2 |
| pos_self_order_sms | POS Self Order SMS | Sales/Point Of Sale | POS | pos_self_order, pos_sms | LGPL-3 | 2 | 2 |
| pos_sms | POS - SMS | Send sms to customer for order confirmation | POS | point_of_sale, sms | LGPL-3 | 3 | 3 |
| pos_stock | PoS - Stock | Sales/Point of Sale | POS | point_of_sale, stock_account | LGPL-3 | 19 | 17 |
| pos_stripe | POS Stripe | Sales/Point of Sale | POS | payment_stripe, point_of_sale | LGPL-3 | 1 | 1 |
| pos_sumup | POS SumUp | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 1 | 1 |
| pos_viva_com | PoS Viva.com | Sales/Point of Sale | POS | point_of_sale | LGPL-3 | 2 | 1 |
| printer | Printer |  | Shared platform | base | LGPL-3 | 3 | 5 |
| privacy_lookup | Privacy | Hidden | Shared platform | mail | LGPL-3 | 4 | 3 |
| product | Products & Pricelists | Sales/Sales | Sales | base, mail, uom | LGPL-3 | 34 | 44 |
| product_email_template | Product Email Template | Accounting/Accounting | Accounting | account | LGPL-3 | 2 | 2 |
| product_expiry | Products Expiration Date | Supply Chain/Inventory | Inventory | stock | LGPL-3 | 15 | 15 |
| product_margin | Margins by Products | Sales/Sales | Sales | account | LGPL-3 | 2 | 2 |
| product_matrix | Product Matrix | Sales/Sales | Sales | account | LGPL-3 | 2 | 5 |
| project | Project | Services/Project | Work | analytic, base_setup, digest, mail, portal_rating, resource, web, web_tour | LGPL-3 | 33 | 74 |
| project_account | Project - Account | Accounting/Accounting | Accounting | account, project | LGPL-3 | 1 | 3 |
| project_hr_expense | Project Expenses | Services/expenses | People | hr_expense, project_account | LGPL-3 | 2 | 2 |
| project_hr_skills | Project - Skills | Services/Project | People | hr_skills, project | LGPL-3 | 3 | 2 |
| project_mail_plugin | Project Mail Plugin | Services/Project | Work | mail_plugin, project | LGPL-3 | 0 | 2 |
| project_mrp | MRP Project | Services/Project | Manufacturing | mrp, project | LGPL-3 | 5 | 3 |
| project_mrp_account | MRP Account Project | Services/Project | Manufacturing | mrp_account, project_mrp, project_stock_account | LGPL-3 | 5 | 3 |
| project_mrp_sale | MRP Project Sale | Services/Project | Manufacturing | project_mrp, sale_mrp, sale_project | LGPL-3 | 1 | 0 |
| project_mrp_stock_landed_costs | Project MRP Landed Costs | Supply Chain/Manufacturing | Manufacturing | mrp_landed_costs, project_mrp_account | LGPL-3 | 1 | 0 |
| project_purchase | Project Purchase | Services/Project | Procurement | project_account, purchase | LGPL-3 | 4 | 3 |
| project_purchase_stock | Project - Purchase - Stock | Services/Project | Inventory | project_purchase, project_stock | LGPL-3 | 3 | 0 |
| project_sale_expense | Project - Sale - Expense | Services/Project | Work | project_hr_expense, sale_expense, sale_project | LGPL-3 | 3 | 0 |
| project_sms | Project - SMS | Services/Project | Marketing | project, sms | LGPL-3 | 4 | 4 |
| project_stock | Project Stock | Services/Project | Inventory | project, stock | LGPL-3 | 2 | 2 |
| project_stock_account | Project Stock Account | Services/Project | Accounting | project_stock, stock_account | LGPL-3 | 4 | 1 |
| project_stock_landed_costs | Project Stock Landed Costs | Supply Chain/Inventory | Inventory | project_stock_account, stock_landed_costs | LGPL-3 | 1 | 0 |
| project_timesheet_holidays | Timesheet when on Time Off | Human Resources | Work | hr_holidays, hr_timesheet | LGPL-3 | 8 | 3 |
| project_todo | To-Do | Productivity/To-Do | Work | project | LGPL-3 | 3 | 8 |
| purchase | Purchase | Supply Chain/Purchase | Procurement | account | LGPL-3 | 21 | 33 |
| purchase_alternative | Purchase Alternative | Supply Chain/Purchase | Procurement | purchase | LGPL-3 | 5 | 5 |
| purchase_alternative_sale | Purchase Alternative Sale | Supply Chain/Purchase | Procurement | purchase_alternative, sale_purchase | LGPL-3 | 1 | 0 |
| purchase_alternative_stock | Purchase Alternative Stock | Supply Chain/Purchase | Inventory | purchase_alternative, purchase_stock | LGPL-3 | 3 | 1 |
| purchase_edi_ubl_bis3 | Import/Export electronic orders with UBL | Supply Chain/Purchase | Procurement | account_edi_ubl_cii, purchase | LGPL-3 | 3 | 4 |
| purchase_mrp | Purchase and MRP Management | Supply Chain/Purchase | Manufacturing | mrp, purchase_stock | LGPL-3 | 9 | 5 |
| purchase_product_matrix | Purchase Matrix | Supply Chain/Purchase | Procurement | product_matrix, purchase | LGPL-3 | 2 | 4 |
| purchase_repair | Purchase Repair | Supply Chain/Purchase | Field Operations | purchase_stock, repair | LGPL-3 | 2 | 2 |
| purchase_requisition | Purchase Agreements | Supply Chain/Purchase | Procurement | purchase | LGPL-3 | 6 | 7 |
| purchase_requisition_stock | Purchase Requisition Stock | Supply Chain/Purchase | Inventory | purchase_requisition, purchase_stock | LGPL-3 | 5 | 2 |
| purchase_stock | Purchase Stock | Supply Chain/Purchase | Inventory | purchase, stock_account | LGPL-3 | 26 | 22 |
| rating | Customer Rating | Productivity | Support | mail | LGPL-3 | 5 | 4 |
| repair | Repairs | Supply Chain/Inventory | Field Operations | sale_management, sale_stock | LGPL-3 | 20 | 14 |
| resource | Resource | Hidden | Shared platform | base, web | LGPL-3 | 7 | 15 |
| resource_mail | Resource Mail | Hidden | Shared platform | mail, resource | LGPL-3 | 1 | 3 |
| rpc | RPC endpoints | Extra Tools | Shared platform | base | LGPL-3 | 0 | 0 |
| sale | Sales | Sales/Sales | Sales | account_payment, sales_team, utm | LGPL-3 | 30 | 64 |
| sale_crm | Opportunity to Quotation | Sales/Sales | CRM | crm, sale | LGPL-3 | 4 | 5 |
| sale_edi_ubl | Import electronic orders with UBL | Sales/Sales | Sales | account_edi_ubl_cii, sale | LGPL-3 | 5 | 1 |
| sale_expense | Sales Expense | Sales/Sales | Sales | hr_expense, sale_management | LGPL-3 | 8 | 6 |
| sale_expense_margin | Sales Expense Margin | Sales/Sales | Sales | sale_expense, sale_margin | LGPL-3 | 2 | 0 |
| sale_gelato | Gelato | Sales/Sales | Sales | delivery, sale | LGPL-3 | 9 | 8 |
| sale_gelato_stock | Gelato/Stock bridge | Sales/Sales | Inventory | sale_gelato, sale_stock | LGPL-3 | 1 | 0 |
| sale_loyalty | Sale Loyalty | Sales/Sales | Sales | loyalty, sale | LGPL-3 | 10 | 10 |
| sale_loyalty_delivery | Sale Loyalty - Delivery | Sales/Sales | Logistics | delivery, sale_loyalty | LGPL-3 | 4 | 1 |
| sale_management | Sales | Sales/Sales | Sales | digest, sale | LGPL-3 | 7 | 14 |
| sale_margin | Margins in Sales Orders | Sales/Sales | Sales | sale_management | LGPL-3 | 4 | 4 |
| sale_mrp | Sales and MRP Management | Sales/Sales | Manufacturing | mrp, sale_stock | LGPL-3 | 7 | 3 |
| sale_mrp_margin | Sale Mrp Margin | Sales/Sales | Manufacturing | sale_mrp, sale_stock_margin | LGPL-3 | 0 | 0 |
| sale_pdf_quote_builder | Sales PDF Quotation Builder | Sales/Sales | Sales | sale_management | LGPL-3 | 7 | 14 |
| sale_product_matrix | Sale Matrix | Sales/Sales | Sales | product_matrix, sale | LGPL-3 | 3 | 4 |
| sale_project | Sales - Project | Sales/Sales | Work | project_account, sale_management, sale_service | LGPL-3 | 15 | 16 |
| sale_project_margin | Sales Margins in Projects | Sales/Sales | Work | sale_margin, sale_project | LGPL-3 | 1 | 3 |
| sale_project_stock | Sale Project - Sale Stock | Sales | Inventory | project_stock_account, sale_project, sale_stock | LGPL-3 | 4 | 0 |
| sale_project_stock_account | Sale Project Stock Account | Hidden | Accounting | project_stock_account, sale_project | LGPL-3 | 1 | 0 |
| sale_purchase | Sale Purchase | Sales/Sales | Procurement | purchase, sale | LGPL-3 | 5 | 4 |
| sale_purchase_project | Sale Purchase Project | Sales | Procurement | project_purchase, sale_project, sale_purchase | LGPL-3 | 2 | 0 |
| sale_purchase_stock | MTO Sale <-> Purchase | Sales/Sales | Inventory | purchase_stock, sale_purchase, sale_stock | LGPL-3 | 5 | 2 |
| sale_service | Sales - Service | Sales/Sales | Sales | sale_management | LGPL-3 | 1 | 1 |
| sale_sms | Sale - SMS | Sales/Sales | Marketing | sale, sms | LGPL-3 | 0 | 0 |
| sale_stock | Sales and Warehouse Management | Sales/Sales | Inventory | sale, stock_account | LGPL-3 | 21 | 24 |
| sale_stock_margin | Sale Stock Margin | Sales/Sales | Inventory | sale_margin, sale_stock | LGPL-3 | 1 | 0 |
| sale_stock_product_expiry | Sale Stock Product Expiry | Sales/Sales | Inventory | product_expiry, sale_stock | LGPL-3 | 2 | 1 |
| sale_timesheet | Sales Timesheet | Sales/Sales | Work | hr_timesheet, sale_project | LGPL-3 | 18 | 18 |
| sale_timesheet_margin | Service Margins in Sales Orders | Sales/Sales | Work | sale_margin, sale_timesheet | LGPL-3 | 1 | 0 |
| sales_team | Sales Teams | Sales/Sales | Sales | base, mail | LGPL-3 | 4 | 8 |
| sms | SMS gateway | Sales/Sales | Marketing | base, iap_mail, mail, phone_validation | LGPL-3 | 18 | 20 |
| sms_twilio | Twilio SMS | Hidden/Tools | Marketing | sms | LGPL-3 | 8 | 3 |
| snailmail | Snail Mail | Hidden/Tools | Shared platform | iap_mail, mail | LGPL-3 | 8 | 5 |
| snailmail_account | Snail Mail - Account | Hidden/Tools | Accounting | account, snailmail | LGPL-3 | 4 | 1 |
| social_media | Social Media | Marketing/Social Marketing | Marketing | base | LGPL-3 | 1 | 2 |
| spreadsheet | Spreadsheet | Productivity/Dashboard | Analytics | bus, portal, web | LGPL-3 | 6 | 13 |
| spreadsheet_account | Spreadsheet Accounting Formulas | Accounting | Accounting | account, spreadsheet | LGPL-3 | 2 | 0 |
| spreadsheet_dashboard | Spreadsheet dashboard | Productivity/Dashboard | Analytics | spreadsheet | LGPL-3 | 4 | 15 |
| spreadsheet_dashboard_account | Spreadsheet dashboard for accounting | Productivity/Dashboard | Accounting | spreadsheet_account, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_event_sale | Spreadsheet dashboard for events | Productivity/Dashboard | Sales | event_sale, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_hr_expense | Spreadsheet dashboard for expenses | Productivity/Dashboard | People | sale_expense, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_hr_timesheet | Spreadsheet dashboard for time sheets | Productivity/Dashboard | People | hr_timesheet, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_im_livechat | Spreadsheet dashboard for live chat | Productivity/Dashboard | Support | im_livechat, spreadsheet_dashboard | LGPL-3 | 0 | 2 |
| spreadsheet_dashboard_pos_hr | Spreadsheet dashboard for point of sale | Productivity/Dashboard | POS | pos_hr, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_pos_restaurant | Spreadsheet dashboard for restaurants | Productivity/Dashboard | POS | pos_hr, pos_restaurant, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_sale | Spreadsheet dashboard for sales | Productivity/Dashboard | Sales | sale, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_sale_timesheet | Spreadsheet dashboard for time sheets | Productivity/Dashboard | Work | sale_timesheet, spreadsheet_dashboard | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_stock_account | Spreadsheet dashboard for stock | Productivity/Dashboard | Accounting | spreadsheet_dashboard, stock_account | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_website_sale | Spreadsheet dashboard for eCommerce | Productivity/Dashboard | Website | spreadsheet_dashboard, website_sale | LGPL-3 | 0 | 1 |
| spreadsheet_dashboard_website_sale_slides | Spreadsheet dashboard for eLearning | Productivity/Dashboard | Website | spreadsheet_dashboard, website_sale_slides | LGPL-3 | 0 | 1 |
| stock | Inventory | Supply Chain/Inventory | Inventory | barcodes_gs1_nomenclature, digest, product | LGPL-3 | 68 | 107 |
| stock_account | WMS Accounting | Supply Chain/Inventory | Accounting | account, stock | LGPL-3 | 22 | 16 |
| stock_delivery | Delivery - Stock | Shipping Connectors | Logistics | delivery, printer, sale_stock | LGPL-3 | 20 | 21 |
| stock_dropshipping | Drop Shipping | Supply Chain/Inventory | Logistics | sale_purchase_stock | LGPL-3 | 13 | 5 |
| stock_fleet | Stock Transport |  | Field Operations | fleet, stock | LGPL-3 | 5 | 9 |
| stock_landed_costs | WMS Landed Costs | Supply Chain/Inventory | Inventory | purchase_stock, stock_account | LGPL-3 | 10 | 5 |
| stock_maintenance | Stock - Maintenance | Supply Chain/Inventory | Field Operations | maintenance, stock | LGPL-3 | 2 | 2 |
| stock_sms | Stock - SMS | Supply Chain/Inventory | Inventory | sms, stock | LGPL-3 | 4 | 3 |
| survey | Surveys | Marketing/Surveys | Knowledge & Learning | auth_signup, digest, gamification, http_routing, mail, web_tour | LGPL-3 | 13 | 39 |
| survey_crm | Survey CRM | Marketing/Surveys | Knowledge & Learning | crm, survey | LGPL-3 | 5 | 5 |
| test_base_automation | Test - Base Automation | Hidden | Automations | base_automation | LGPL-3 | 13 | 0 |
| test_crm_full | Test Full Crm Flow | Hidden/Tests | CRM | crm, crm_iap_enrich, crm_iap_mine, crm_sms, event_crm, sale_crm, website_crm, website_crm_iap_reveal, website_crm_livechat, website_crm_partner_assign | LGPL-3 | 0 | 0 |
| test_discuss_full | Test Discuss (full) | Productivity/Discuss | Shared platform | calendar, crm, crm_livechat, hr_attendance, hr_fleet, hr_holidays, im_livechat, mail, mail_bot, microsoft_calendar, project_todo, website_livechat, website_sale, website_slides | LGPL-3 | 0 | 0 |
| test_event_full | Test Full Event Flow | Hidden/Tests | Shared platform | event, event_booth, event_crm, event_crm_sale, event_sale, event_sms, payment_demo, website_event_booth_sale_exhibitor, website_event_exhibitor, website_event_sale, website_event_track, website_event_track_live, website_event_track_quiz | LGPL-3 | 0 | 2 |
| test_html_field_history | Test - html_field_history | Hidden | Shared platform | html_editor | LGPL-3 | 1 | 0 |
| test_import_export | Test - Import & Export | Hidden | Shared platform | base_import, test_base, web, website | LGPL-3 | 57 | 0 |
| test_mail | Mail Tests | Hidden | Shared platform | mail, mail_tracking, phone_validation, test_base | LGPL-3 | 48 | 3 |
| test_mail_full | Mail Tests (Full) | Hidden | Shared platform | mail, mail_bot, mail_tracking_mass_mailing, mass_mailing, mass_mailing_sms, phone_validation, portal, rating, sms, test_mail, test_mail_sms, test_mass_mailing | LGPL-3 | 7 | 2 |
| test_mail_sms | SMS Tests | Hidden | Marketing | mail, mail_tracking_sms, sms, sms_twilio, test_base | LGPL-3 | 7 | 0 |
| test_mass_mailing | Mass Mail Tests | Marketing/Email Marketing | Marketing | mail_tracking_mass_mailing, mass_mailing, mass_mailing_sms, sms_twilio, test_mail, test_mail_sms | LGPL-3 | 10 | 0 |
| test_populate | Odoo Populate Tests | Hidden/Tests | Shared platform | populate | LGPL-3 | 11 | 1 |
| test_resource | Test - Resource | Hidden | Shared platform | resource | LGPL-3 | 3 | 0 |
| test_sale_product_configurators | Sale Product Configurators Tests | Hidden | Sales | event_sale, sale_management, sale_product_matrix | LGPL-3 | 0 | 0 |
| test_sale_purchase_edi_ubl | Test - Sale & Purchase Order EDI | Hidden | Procurement | purchase_edi_ubl_bis3, sale_edi_ubl | LGPL-3 | 0 | 0 |
| test_spreadsheet | Spreadsheet Test | Hidden | Analytics | spreadsheet | LGPL-3 | 1 | 1 |
| test_translation_mode | Translation Mode | Hidden | Shared platform | web | LGPL-3 | 2 | 3 |
| test_utm | UTM Tests | Hidden | Shared platform | utm | LGPL-3 | 2 | 0 |
| test_website | Website Test | Hidden | Website | theme_default, web_unsplash, website | LGPL-3 | 7 | 8 |
| test_website_modules | Website Modules Test | Hidden | Website | theme_default, website, website_blog, website_crm_iap_reveal, website_event_sale, website_livechat, website_sale, website_slides | LGPL-3 | 0 | 0 |
| test_website_slides_full | Test Full eLearning Flow | Hidden/Tests | Website | website_sale_slides, website_slides_forum, website_slides_survey | LGPL-3 | 0 | 2 |
| theme_default | Default Theme | Theme | Shared platform | website | LGPL-3 | 0 | 1 |
| uom | Units of measure | Sales/Sales | Sales | base | LGPL-3 | 2 | 5 |
| utm | UTM Trackers | Marketing | Shared platform | base, web | LGPL-3 | 7 | 12 |
| web | Web | Hidden | Shared platform | base | LGPL-3 | 16 | 287 |
| web_hierarchy | Web Hierarchy | Hidden | Shared platform | web | LGPL-3 | 3 | 3 |
| web_tour | Tours | Hidden | Shared platform | web | LGPL-3 | 4 | 6 |
| web_unsplash | Unsplash Image Library | Hidden | Shared platform | base_setup, html_editor | LGPL-3 | 4 | 4 |
| website | Website | Website/Website | Website | auth_signup, digest, google_recaptcha, html_builder, html_editor, http_routing, mail, portal, social_media, utm, web | LGPL-3 | 68 | 418 |
| website_address_autocomplete | Website Address Autocomplete | Website/Website | Website | google_address_autocomplete, website | LGPL-3 | 2 | 3 |
| website_blog | Blog | Website/Website | Website | html_builder, website_mail, website_partner | LGPL-3 | 9 | 27 |
| website_cf_turnstile | Cloudflare Turnstile | Website/Website | Website | website | LGPL-3 | 2 | 2 |
| website_crm | Contact Form | Website/Website | Website | crm, website | LGPL-3 | 3 | 6 |
| website_crm_iap_reveal | Lead Generation From Website Visits | Sales/CRM | Website | crm_iap_mine, iap_crm, iap_mail, website_crm | LGPL-3 | 4 | 7 |
| website_crm_livechat | Lead Livechat Sessions | Website/Website | Website | crm_livechat, website_crm, website_livechat | LGPL-3 | 3 | 1 |
| website_crm_partner_assign | Resellers | Website/Website | Website | account, base_geolocalize, crm, portal, website_google_map, website_partner, website_partnership | LGPL-3 | 9 | 17 |
| website_crm_sms | Send SMS to Visitor with leads | Website/Website | Website | crm, website_sms | LGPL-3 | 1 | 0 |
| website_customer | Customer References | Website/Website | Website | website_crm_partner_assign, website_google_map, website_partner | LGPL-3 | 3 | 4 |
| website_event | Events | Marketing/Events | Website | event, html_builder, website, website_mail, website_partner | LGPL-3 | 12 | 35 |
| website_event_booth | Online Event Booths | Marketing/Events | Website | event_booth, website_event | LGPL-3 | 3 | 6 |
| website_event_booth_exhibitor | Booths/Exhibitors Bridge | Marketing/Events | Website | website_event_booth, website_event_exhibitor | LGPL-3 | 2 | 6 |
| website_event_booth_sale | Online Event Booth Sale | Marketing/Events | Website | event_booth_sale, website_event_booth, website_sale | LGPL-3 | 3 | 2 |
| website_event_booth_sale_exhibitor | Booths Sale/Exhibitors Bridge | Marketing/Events | Website | website_event_booth_sale, website_event_exhibitor | LGPL-3 | 1 | 0 |
| website_event_crm | Website Events CRM | Website/Website | Website | event_crm, website_event | LGPL-3 | 1 | 2 |
| website_event_exhibitor | Event Exhibitors | Marketing/Events | Website | website_event | LGPL-3 | 6 | 14 |
| website_event_sale | Online Event Ticketing | Website/Website | Website | event_sale, website_event, website_sale | LGPL-3 | 8 | 5 |
| website_event_track | Advanced Events | Marketing | Website | website_event | LGPL-3 | 13 | 33 |
| website_event_track_live | Live Event Tracks | Marketing/Events | Website | website_event_track | LGPL-3 | 1 | 5 |
| website_event_track_live_quiz | Quiz on Live Event Tracks | Marketing/Events | Website | website_event_track_live, website_event_track_quiz | LGPL-3 | 0 | 3 |
| website_event_track_quiz | Quizzes on Tracks | Marketing/Events | Website | website_event_track, website_profile | LGPL-3 | 6 | 12 |
| website_forum | Forum | Website/Website | Website | auth_signup, website_mail, website_profile | LGPL-3 | 13 | 35 |
| website_google_map | Google Maps | Website/Website | Website | base_geolocalize, website_partner | LGPL-3 | 0 | 1 |
| website_hr_recruitment | Online Jobs | Website/Website | Website | hr_recruitment, website_mail | LGPL-3 | 6 | 11 |
| website_hr_recruitment_livechat | Website IM Livechat HR Recruitment | Website/Live Chat | Website | im_livechat, website_hr_recruitment | LGPL-3 | 0 | 1 |
| website_links | Link Tracker | Website/Website | Website | link_tracker, website | LGPL-3 | 1 | 5 |
| website_livechat | Website Live Chat | Website/Live Chat | Website | im_livechat, website | LGPL-3 | 9 | 9 |
| website_mail | Website Mail | Website/Website | Website | mail, website | LGPL-3 | 2 | 1 |
| website_mail_group | Website Mail Group |  | Website | mail_group, website | LGPL-3 | 1 | 5 |
| website_mass_mailing | Newsletter Subscribe Button | Website/Website | Website | google_recaptcha, mass_mailing, website | LGPL-3 | 0 | 12 |
| website_mass_mailing_event | Mass mailing on website events | Marketing/Email Marketing/Website | Website | mass_mailing, website_event | LGPL-3 | 0 | 3 |
| website_mass_mailing_sms | Newsletter Subscribe SMS Template | Website/Website | Website | mass_mailing_sms, website_mass_mailing | LGPL-3 | 0 | 3 |
| website_partner | Website Partner | Website/Website | Website | website | LGPL-3 | 1 | 4 |
| website_partnership | Website Partnership | Website/Website | Website | partnership, website_partner | LGPL-3 | 2 | 7 |
| website_payment | Website Payment | Website/Website | Website | account_payment, portal, website | LGPL-3 | 2 | 7 |
| website_profile | Website profile | Website/Website | Website | gamification, html_editor, website_partner | LGPL-3 | 3 | 5 |
| website_project | Online Task Submission | Website/Website | Website | project, website | LGPL-3 | 1 | 3 |
| website_sale | eCommerce | Website/Website | Website | delivery, digest, html_builder, portal_rating, sale, website, website_mail, website_payment | LGPL-3 | 43 | 108 |
| website_sale_collect | Click & Collect | Website/Website | Website | base_geolocalize, payment_custom, website_sale_stock | LGPL-3 | 10 | 18 |
| website_sale_gelato | eCommerce/Gelato bridge | Website/Website | Website | sale_gelato, website_sale | LGPL-3 | 4 | 2 |
| website_sale_loyalty | Coupons, Promotions, Gift Card and Loyalty for eCommerce | Website/Website | Website | sale_loyalty, website_links, website_sale | LGPL-3 | 7 | 10 |
| website_sale_mass_mailing | Checkout Newsletter | Website/Website | Website | mass_mailing_sale, website_mass_mailing, website_sale | LGPL-3 | 2 | 3 |
| website_sale_mrp | Kit Availability | Website/Website | Website | sale_mrp, website_sale_stock | LGPL-3 | 1 | 0 |
| website_sale_project | Website Sale - Project | Website/Website | Website | project, website_sale | LGPL-3 | 2 | 1 |
| website_sale_slides | Sell Courses | Website/eLearning | Website | website_sale, website_slides | LGPL-3 | 5 | 14 |
| website_sale_stock | Product Availability | Website/Website | Website | sale_stock, stock_delivery, website_sale | LGPL-3 | 9 | 17 |
| website_slides | eLearning | Website/eLearning | Website | digest, portal_rating, website, website_mail, website_profile | LGPL-3 | 25 | 65 |
| website_slides_forum | Forum on Courses | Website/eLearning | Website | website_forum, website_slides | LGPL-3 | 2 | 9 |
| website_slides_survey | Course Certifications | Website/eLearning | Website | survey, website_slides | LGPL-3 | 6 | 21 |
| website_sms | Send SMS to Visitor | Website/Website | Website | sms, website | LGPL-3 | 1 | 1 |
| website_timesheet | Hide Portal Timesheet Information | Website/Website | Website | hr_timesheet, website | LGPL-3 | 1 | 0 |
| base | Base | Hidden | Shared platform | — | LGPL-3 | 130 | 88 |
| test_assetsbundle | test-assetsbundle | Hidden/Tests | Shared platform | base | LGPL-3 | 1 | 8 |
| test_base | Test ORM | Hidden/Tests | Shared platform | base | LGPL-3 | 260 | 10 |
| test_data_module | test module to test data only modules | Hidden/Tests | Shared platform | — | LGPL-3 | 0 | 0 |
| test_data_module_install | test installation of data module | Hidden/Tests | Shared platform | test_data_module | LGPL-3 | 0 | 0 |
| test_http | Test HTTP | Hidden/Tests | Shared platform | mail, rpc, web, web_tour | LGPL-3 | 5 | 2 |
| test_inherit | test-inherit | Hidden/Tests | Shared platform | base, test_base | LGPL-3 | 19 | 1 |
| test_inherit_depends | test-inherit-depends | Hidden/Tests | Shared platform | test_base, test_inherit | LGPL-3 | 2 | 0 |
| test_inherits_depends | test-inherits-depends | Hidden/Tests | Shared platform | test_base | LGPL-3 | 1 | 0 |
| test_l10n | Test Localization | Hidden/Tests | Shared platform | base | LGPL-3 | 0 | 0 |
| test_lint | Test Lint | Hidden/Tests | Shared platform | base | LGPL-3 | 0 | 0 |
| test_main_flows | Test Main Flow | Hidden/Tests | Shared platform | account, crm, mrp, purchase_stock, sale_timesheet, web_tour | LGPL-3 | 1 | 0 |
| test_tests | Test Tests | Hidden/Tests | Shared platform | base, web | LGPL-3 | 33 | 1 |
| test_translation | Test Translation | Hidden/Tests | Shared platform | base, web_tour | LGPL-3 | 7 | 3 |
| test_uninstall | test-uninstall | Hidden/Tests | Shared platform | base | LGPL-3 | 2 | 0 |
| test_web | test_search_panel | Hidden/Tests | Shared platform | test_base, web | LGPL-3 | 13 | 0 |
