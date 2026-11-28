export type WebsiteThemePreset = {
  id: string;
  name: string;
  vibe: string;
  primary: string;
  background: string;
  width: 'standard' | 'wide';
  typography: 'system' | 'modern' | 'serif';
  section_spacing: 'compact' | 'standard' | 'relaxed';
  header_style: 'plain' | 'sticky' | 'contrast';
  footer_style: 'light' | 'dark';
  button_style: 'rounded' | 'square';
};

export type WebsiteSectionSeed = {
  type:
    | 'announcement'
    | 'hero'
    | 'heading'
    | 'text'
    | 'image'
    | 'gallery'
    | 'columns'
    | 'features'
    | 'stats'
    | 'team'
    | 'cta'
    | 'testimonial'
    | 'pricing'
    | 'faq'
    | 'booking'
    | 'newsletter'
    | 'contact'
    | 'contact_form'
    | 'footer'
    | 'commerce_showcase';
  title: string;
  body: string;
  button_label?: string;
  button_url?: string;
  storefront_slug?: string;
  booking_url?: string;
  background?: string;
  content_width?: 'theme' | 'narrow' | 'wide';
  alignment?: 'start' | 'center';
  layout_columns?: 'auto' | 'two' | 'three';
};

export type SinglePageTemplate = {
  id: string;
  name: string;
  category: 'All' | 'Business' | 'Commerce' | 'Hospitality' | 'Services' | 'Creative';
  summary: string;
  accent: string;
  theme: Omit<WebsiteThemePreset, 'id' | 'name' | 'vibe'>;
  sections: WebsiteSectionSeed[];
};

export type SiteStarterKit = {
  id: string;
  name: string;
  category: 'Commerce' | 'Hospitality' | 'Business' | 'Services' | 'Creative';
  tagline: string;
  badge: string;
  accent: string;
  connectsTo: string[];
  theme: Omit<WebsiteThemePreset, 'id' | 'name' | 'vibe'>;
  pages: Array<{
    title: string;
    slug: string;
    meta_description: string;
    isDefault?: boolean;
    sections: WebsiteSectionSeed[];
  }>;
};

export const WEBSITE_THEME_PRESETS: WebsiteThemePreset[] = [
  {
    id: 'africore-emerald',
    name: 'AfriCore Emerald',
    vibe: 'Crisp, modern & trustworthy',
    primary: '#047857',
    background: '#ffffff',
    width: 'wide',
    typography: 'system',
    section_spacing: 'standard',
    header_style: 'sticky',
    footer_style: 'dark',
    button_style: 'rounded',
  },
  {
    id: 'editorial-ivory',
    name: 'Editorial Ivory',
    vibe: 'Warm serif luxury & craft',
    primary: '#7c2d12',
    background: '#faf8f5',
    width: 'standard',
    typography: 'serif',
    section_spacing: 'relaxed',
    header_style: 'plain',
    footer_style: 'dark',
    button_style: 'rounded',
  },
  {
    id: 'midnight-slate',
    name: 'Midnight Slate',
    vibe: 'Sharp SaaS & enterprise tech',
    primary: '#1d4ed8',
    background: '#ffffff',
    width: 'wide',
    typography: 'modern',
    section_spacing: 'standard',
    header_style: 'contrast',
    footer_style: 'dark',
    button_style: 'rounded',
  },
  {
    id: 'terracotta-craft',
    name: 'Terracotta Market',
    vibe: 'Boutique retail & artisanal',
    primary: '#b45309',
    background: '#fffdf9',
    width: 'wide',
    typography: 'serif',
    section_spacing: 'standard',
    header_style: 'sticky',
    footer_style: 'light',
    button_style: 'rounded',
  },
  {
    id: 'coastal-teal',
    name: 'Coastal Clinic',
    vibe: 'Calm healthcare & wellness',
    primary: '#0f766e',
    background: '#ffffff',
    width: 'standard',
    typography: 'system',
    section_spacing: 'relaxed',
    header_style: 'plain',
    footer_style: 'light',
    button_style: 'rounded',
  },
  {
    id: 'minimal-mono',
    name: 'Minimal Monochrome',
    vibe: 'High-contrast studio portfolio',
    primary: '#111827',
    background: '#ffffff',
    width: 'wide',
    typography: 'modern',
    section_spacing: 'relaxed',
    header_style: 'plain',
    footer_style: 'dark',
    button_style: 'square',
  },
];

export const SITE_STARTER_KITS: SiteStarterKit[] = [
  {
    id: 'retail-storefront',
    name: 'Retail & Online Store',
    category: 'Commerce',
    tagline: 'Launch a brand homepage connected directly to your Commerce store & AfriCore Marketplace.',
    badge: '4 pages · Commerce-linked',
    accent: '#047857',
    connectsTo: ['Commerce Store', 'CRM Leads', 'Marketplace'],
    theme: {
      primary: '#047857',
      background: '#ffffff',
      width: 'wide',
      typography: 'system',
      section_spacing: 'standard',
      header_style: 'sticky',
      footer_style: 'dark',
      button_style: 'rounded',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Shop our curated collection with transparent pricing, fast local delivery, and direct merchant support.',
        isDefault: true,
        sections: [
          {
            type: 'announcement',
            title: 'Free city delivery on orders above KES 5,000 · Same-day dispatch before 2 PM',
            body: '',
            background: '#ecfdf5',
            alignment: 'center',
          },
          {
            type: 'hero',
            title: 'Everyday essentials crafted to last.',
            body: 'Discover verified products shipped straight from our warehouse with real-time stock and instant receipts.',
            button_label: 'Shop Collection',
            button_url: '/catalog',
            background: '#ffffff',
            alignment: 'center',
          },
          {
            type: 'commerce_showcase',
            title: 'Featured from our store',
            body: 'Live catalog synced directly from your Commerce store inventory.',
            button_label: 'Browse Full Store',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'features',
            title: 'Why shoppers choose us',
            body: 'Verified Inventory :: Real-time stock availability on every product\nFast Delivery :: Same-day Nairobi dispatch & nationwide courier shipping\nEasy Support :: Direct merchant assistance for exchanges and orders',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'testimonial',
            title: 'Trusted by repeat buyers',
            body: '“Order arrived the same afternoon in pristine packaging. Best shopping experience we have had online.” — Wanjiku M., Nairobi',
            background: '#f8fafc',
            alignment: 'center',
          },
          {
            type: 'newsletter',
            title: 'Get new arrivals & seasonal drops first',
            body: 'Join our customer list for early access to limited stock and member-only discount codes.',
            button_label: 'Subscribe',
            background: '#ffffff',
            alignment: 'center',
          },
        ],
      },
      {
        title: 'Catalog',
        slug: 'catalog',
        meta_description: 'Browse our live product catalog and checkout securely.',
        sections: [
          {
            type: 'hero',
            title: 'Our Live Catalog',
            body: 'Every item below reflects live pricing and availability from our Commerce store.',
            background: '#ffffff',
          },
          {
            type: 'commerce_showcase',
            title: 'All Featured Products',
            body: 'Click any item or visit our full storefront to add items to your cart.',
            button_label: 'Open Storefront Checkout',
            background: '#f8fafc',
          },
          {
            type: 'faq',
            title: 'Shipping & Returns FAQ',
            body: 'How long does delivery take? :: Nairobi orders ship within 4 hours; upcountry courier takes 24-48 hours.\nCan I pick up my order in person? :: Yes, select store pickup at checkout once your order is confirmed.\nHow do returns work? :: Reach out within 7 days with your receipt number for an instant exchange or refund.',
            background: '#ffffff',
          },
        ],
      },
      {
        title: 'About',
        slug: 'about',
        meta_description: 'Learn the story behind our brand, sourcing standards, and team.',
        sections: [
          {
            type: 'hero',
            title: 'Built on quality & direct relationships',
            body: 'We partner directly with makers and suppliers so you get transparent pricing without middlemen.',
            background: '#ffffff',
          },
          {
            type: 'stats',
            title: 'By the numbers',
            body: '10,000+ :: Orders delivered\n99.4% :: On-time fulfillment\n24 hrs :: Average dispatch\n4.9 / 5 :: Customer rating',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'text',
            title: 'Our promise',
            body: 'Every item is inspected before dispatch, invoiced transparently, and backed by responsive local support.',
            background: '#ffffff',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Contact our team for wholesale inquiries, custom orders, or order support.',
        sections: [
          {
            type: 'hero',
            title: 'Talk to our team',
            body: 'Questions about bulk pricing, delivery timelines, or product specs? Send us a message below.',
            background: '#ffffff',
          },
          {
            type: 'contact_form',
            title: 'Send an inquiry',
            body: 'Messages flow straight into our CRM so our team can respond quickly.',
            background: '#f8fafc',
          },
        ],
      },
    ],
  },
  {
    id: 'restaurant-cafe',
    name: 'Restaurant & Café',
    category: 'Hospitality',
    tagline: 'Showcase your menu, ambiance, and let guests reserve a table with Calendar booking.',
    badge: '4 pages · Booking-ready',
    accent: '#7c2d12',
    connectsTo: ['Calendar Booking', 'POS Menu', 'CRM Inquiries'],
    theme: {
      primary: '#7c2d12',
      background: '#faf8f5',
      width: 'standard',
      typography: 'serif',
      section_spacing: 'relaxed',
      header_style: 'plain',
      footer_style: 'dark',
      button_style: 'rounded',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Seasonal kitchen, specialty coffee, and warm hospitality — reserve your table online.',
        isDefault: true,
        sections: [
          {
            type: 'announcement',
            title: 'Open Tuesday – Sunday · 8:00 AM – 10:30 PM · Weekend Brunch from 9 AM',
            body: '',
            background: '#fef3c7',
            alignment: 'center',
          },
          {
            type: 'hero',
            title: 'Seasonal plates, fire-roasted coffee, unhurried evenings.',
            body: 'Locally sourced ingredients prepared fresh every morning in the heart of the city.',
            button_label: 'Explore the Menu',
            button_url: '/menu',
            background: '#faf8f5',
            alignment: 'center',
          },
          {
            type: 'columns',
            title: 'House Favorites',
            body: 'Wood-Fired Flatbreads :: Hand-stretched sourdough topped with seasonal farm produce & herbs\nSingle-Origin Espresso :: Roasted weekly from highland estates for balanced sweetness\nChef’s Tasting Platter :: Five shareable courses crafted for group dining & celebrations',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'booking',
            title: 'Reserve a Table',
            body: 'Book dining tables, patio seating, or private group events directly on our live calendar.',
            button_label: 'Book a Table',
            background: '#faf8f5',
            alignment: 'center',
          },
          {
            type: 'testimonial',
            title: 'From our guests',
            body: '“The atmosphere is unmatched and every dish tastes genuinely seasonal. Our go-to spot for client lunches.” — David K.',
            background: '#ffffff',
            alignment: 'center',
          },
        ],
      },
      {
        title: 'Menu',
        slug: 'menu',
        meta_description: 'View our breakfast, lunch, dinner, and specialty drinks menu.',
        sections: [
          {
            type: 'hero',
            title: 'Kitchen & Coffee Menu',
            body: 'Crafted daily with fresh seasonal produce. Vegetarian and gluten-free options always available.',
            background: '#faf8f5',
          },
          {
            type: 'pricing',
            title: 'Signature Dishes & Set Menus',
            body: 'Morning Roast & Pastry | KES 850 | Single-origin pour-over paired with warm cardamom croissant\nChef’s Lunch Plate | KES 1,650 | Chargrilled chicken or halloumi, herb pilaf & citrus slaw\nEvening Tasting for Two | KES 4,800 | Four seasonal courses plus artisan dessert to share',
            background: '#ffffff',
            layout_columns: 'three',
          },
        ],
      },
      {
        title: 'Private Events',
        slug: 'events',
        meta_description: 'Host birthdays, team dinners, and private tastings with us.',
        sections: [
          {
            type: 'hero',
            title: 'Private Dining & Catering',
            body: 'From intimate 12-guest courtyard dinners to 80-person corporate receptions.',
            background: '#faf8f5',
          },
          {
            type: 'contact_form',
            title: 'Request an Event Quote',
            body: 'Tell us your preferred date, guest count, and menu preferences.',
            background: '#ffffff',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Find our location, opening hours, and direct contact form.',
        sections: [
          {
            type: 'contact',
            title: 'Visit Us',
            body: 'Westlands Courtyard, Nairobi\nTuesday – Sunday: 8:00 AM – 10:30 PM\nReservations & Takeaway: hello@example.com',
            background: '#faf8f5',
          },
          {
            type: 'contact_form',
            title: 'Message the Host Desk',
            body: 'Dietary questions or group bookings? Drop us a note anytime.',
            background: '#ffffff',
          },
        ],
      },
    ],
  },
  {
    id: 'saas-startup',
    name: 'SaaS & Tech Startup',
    category: 'Business',
    tagline: 'High-converting software landing site with metrics, pricing tiers, FAQ, and lead capture.',
    badge: '4 pages · CRM-connected',
    accent: '#1d4ed8',
    connectsTo: ['CRM Pipeline', 'Calendar Demos', 'Pricing'],
    theme: {
      primary: '#1d4ed8',
      background: '#ffffff',
      width: 'wide',
      typography: 'modern',
      section_spacing: 'standard',
      header_style: 'contrast',
      footer_style: 'dark',
      button_style: 'rounded',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Modern cloud software that streamlines operations, billing, and customer workflows.',
        isDefault: true,
        sections: [
          {
            type: 'announcement',
            title: 'New Release: Automated Workflows & Real-Time Analytics are now live →',
            body: '',
            background: '#eff6ff',
            alignment: 'center',
          },
          {
            type: 'hero',
            title: 'Run your entire operation on one modern platform.',
            body: 'Automate repetitive tasks, collaborate in real time, and ship faster with enterprise-grade reliability.',
            button_label: 'View Pricing',
            button_url: '/pricing',
            background: '#ffffff',
            alignment: 'center',
          },
          {
            type: 'stats',
            title: 'Proven at scale',
            body: '99.98% :: Platform uptime\n3.4× :: Faster onboarding\n42% :: Lower ops overhead\n500+ :: Active teams',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'features',
            title: 'Everything your team needs',
            body: 'Unified Data Model :: Eliminate silos across sales, finance, and fulfillment\nRole-Based Security :: Granular permissions and complete audit trails out of the box\nInstant Reporting :: Live executive dashboards with one-click CSV exports',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'pricing',
            title: 'Simple, predictable pricing',
            body: 'Starter | KES 2,500 / mo | Up to 5 team members, core workflows & email support\nGrowth | KES 7,500 / mo | Unlimited team members, automations & API access\nEnterprise | Custom | Dedicated SLA, custom security reviews & priority onboarding',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'cta',
            title: 'Ready to modernize your stack?',
            body: 'Book a 20-minute walkthrough with our product specialists.',
            button_label: 'Book a Demo',
            button_url: '/contact',
            background: '#ffffff',
            alignment: 'center',
          },
        ],
      },
      {
        title: 'Product',
        slug: 'product',
        meta_description: 'Deep dive into platform capabilities, integrations, and security architecture.',
        sections: [
          {
            type: 'hero',
            title: 'Engineered for clarity and speed',
            body: 'Built from the ground up so teams spend less time reconciling spreadsheets and more time growing.',
            background: '#ffffff',
          },
          {
            type: 'columns',
            title: 'Core Modules',
            body: 'Workflow Engine :: Trigger approvals and notifications automatically\nConnected Ledger :: Keep every invoice, order, and receipt reconciled\nOpen API :: Integrate with webhooks and scoped developer tokens',
            background: '#f8fafc',
            layout_columns: 'three',
          },
        ],
      },
      {
        title: 'Pricing',
        slug: 'pricing',
        meta_description: 'Compare Starter, Growth, and Enterprise plans with transparent billing.',
        sections: [
          {
            type: 'hero',
            title: 'Plans that scale with your team',
            body: 'Start free in sandbox and upgrade only when your team is ready.',
            background: '#ffffff',
            alignment: 'center',
          },
          {
            type: 'pricing',
            title: 'Monthly Plans',
            body: 'Starter | KES 2,500 / mo | Core apps, 5 users & community support\nGrowth | KES 7,500 / mo | Full suite, unlimited users & API webhooks\nEnterprise | Custom | Dedicated environment, SSO & priority SLA',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'faq',
            title: 'Billing Questions',
            body: 'Can we switch plans anytime? :: Yes, upgrade or downgrade without lock-in.\nIs there a free sandbox? :: Every workspace starts with a full-featured sandbox environment.',
            background: '#ffffff',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Schedule a product demo or contact our sales engineering team.',
        sections: [
          {
            type: 'booking',
            title: 'Schedule a Live Product Demo',
            body: 'Pick a time that works for your team and see the platform configured for your workflow.',
            button_label: 'Choose a Time Slot',
            background: '#f8fafc',
            alignment: 'center',
          },
          {
            type: 'contact_form',
            title: 'Send us a message',
            body: 'Share your goals and we will follow up within one business day.',
            background: '#ffffff',
          },
        ],
      },
    ],
  },
  {
    id: 'agency-consulting',
    name: 'Agency & Consulting Firm',
    category: 'Services',
    tagline: 'Position your expertise with case metrics, leadership profiles, and discovery booking.',
    badge: '4 pages · Team & Booking',
    accent: '#111827',
    connectsTo: ['Calendar Discovery Calls', 'CRM Leads'],
    theme: {
      primary: '#111827',
      background: '#ffffff',
      width: 'wide',
      typography: 'modern',
      section_spacing: 'relaxed',
      header_style: 'plain',
      footer_style: 'dark',
      button_style: 'square',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Strategic advisory, design, and engineering partners for ambitious organizations.',
        isDefault: true,
        sections: [
          {
            type: 'hero',
            title: 'We help ambitious teams turn strategy into measurable outcomes.',
            body: 'Senior advisors, designers, and engineers embedded directly with your leadership team.',
            button_label: 'Book a Discovery Call',
            button_url: '/contact',
            background: '#ffffff',
          },
          {
            type: 'stats',
            title: 'Track record',
            body: '120+ :: Client engagements\n14 :: Markets served\n92% :: Multi-year retention\n$45M+ :: Client revenue unlocked',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'features',
            title: 'Practice Areas',
            body: 'Commercial Strategy :: Pricing architecture, market expansion & unit economics\nDigital Transformation :: End-to-end ERP, commerce, and data modernization\nBrand & Experience :: High-converting digital flagships and design systems',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'team',
            title: 'Leadership',
            body: 'Amara Ochieng | Managing Partner | 15 years leading regional commercial & digital transformations\nBrian Kamau | Head of Engineering | Distributed systems, fintech rails & enterprise security\nZainab Hassan | Design Director | Brand systems, UX research & conversion architecture',
            background: '#f8fafc',
            layout_columns: 'three',
          },
          {
            type: 'cta',
            title: 'Planning a major initiative this quarter?',
            body: 'Let’s scope goals, timelines, and expected ROI together.',
            button_label: 'Start a Conversation',
            button_url: '/contact',
            background: '#ffffff',
            alignment: 'center',
          },
        ],
      },
      {
        title: 'Services',
        slug: 'services',
        meta_description: 'Explore our advisory, implementation, and retained partnership engagements.',
        sections: [
          {
            type: 'hero',
            title: 'Focused engagements. Clear deliverables.',
            body: 'No endless slide decks — every project ships working systems and trained teams.',
            background: '#ffffff',
          },
          {
            type: 'pricing',
            title: 'Engagement Models',
            body: 'Diagnostic Sprint | 2 Weeks | Deep operational audit, architecture blueprint & 90-day roadmap\nBuild & Launch | 6–10 Weeks | Cross-functional delivery team shipping your product or platform\nExecutive Retainer | Monthly | Ongoing advisory, quarterly reviews & team enablement',
            background: '#f8fafc',
            layout_columns: 'three',
          },
        ],
      },
      {
        title: 'About',
        slug: 'about',
        meta_description: 'Meet the partners and principles guiding our practice.',
        sections: [
          {
            type: 'hero',
            title: 'Independent thinking. Practical execution.',
            body: 'Founded by operators who have built and scaled businesses firsthand.',
            background: '#ffffff',
          },
          {
            type: 'team',
            title: 'Our Partners',
            body: 'Amara Ochieng | Managing Partner | Strategy & market growth\nBrian Kamau | Head of Engineering | Cloud platforms & integrations\nZainab Hassan | Design Director | Digital products & brand systems',
            background: '#f8fafc',
            layout_columns: 'three',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Schedule a discovery call or submit an RFP.',
        sections: [
          {
            type: 'booking',
            title: 'Book a 30-Minute Discovery Call',
            body: 'Select an open slot directly on our partner calendar.',
            button_label: 'Book Call',
            background: '#f8fafc',
          },
          {
            type: 'contact_form',
            title: 'Project Inquiry',
            body: 'Share your timeline and objectives — all submissions go directly to our managing partners.',
            background: '#ffffff',
          },
        ],
      },
    ],
  },
  {
    id: 'clinic-wellness',
    name: 'Clinic, Salon & Wellness',
    category: 'Services',
    tagline: 'Calm, appointment-first website with treatments menu, specialists, and online booking.',
    badge: '3 pages · Appointment-first',
    accent: '#0f766e',
    connectsTo: ['Calendar Appointments', 'CRM Patients/Clients'],
    theme: {
      primary: '#0f766e',
      background: '#ffffff',
      width: 'standard',
      typography: 'system',
      section_spacing: 'relaxed',
      header_style: 'plain',
      footer_style: 'light',
      button_style: 'rounded',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Modern care, experienced specialists, and effortless online appointment booking.',
        isDefault: true,
        sections: [
          {
            type: 'hero',
            title: 'Thoughtful care designed around your schedule.',
            body: 'Certified practitioners, calm treatment rooms, and instant online booking with zero waiting-room friction.',
            button_label: 'Book an Appointment',
            button_url: '/book',
            background: '#ffffff',
            alignment: 'center',
          },
          {
            type: 'features',
            title: 'Our Specialties',
            body: 'Preventive Consultations :: Comprehensive assessments tailored to your goals\nModern Diagnostics :: Clear results explained without jargon\nContinuity of Care :: Follow-up reminders and personal care plans',
            background: '#f0fdfa',
            layout_columns: 'three',
          },
          {
            type: 'pricing',
            title: 'Popular Appointments',
            body: 'Initial Consultation | KES 3,500 | 45-minute full evaluation & tailored plan\nFollow-Up Session | KES 2,000 | 30-minute progress review & adjustment\nComprehensive Package | KES 9,500 | Three sessions plus priority booking',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'booking',
            title: 'Schedule Your Visit Online',
            body: 'Choose your preferred practitioner and time slot in seconds.',
            button_label: 'Book Now',
            background: '#f0fdfa',
            alignment: 'center',
          },
        ],
      },
      {
        title: 'Book Now',
        slug: 'book',
        meta_description: 'Book an appointment online and prepare for your visit.',
        sections: [
          {
            type: 'booking',
            title: 'Online Appointment Booking',
            body: 'Instant confirmation and calendar reminders sent right to your inbox.',
            button_label: 'Select Appointment Time',
            background: '#ffffff',
            alignment: 'center',
          },
          {
            type: 'faq',
            title: 'Before Your Visit',
            body: 'How early should I arrive? :: Please arrive 10 minutes ahead for your first appointment.\nCan I reschedule online? :: Yes, use the management link in your booking confirmation.',
            background: '#f8fafc',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Clinic hours, location, and patient support inquiries.',
        sections: [
          {
            type: 'contact',
            title: 'Location & Hours',
            body: 'Monday – Friday: 8:00 AM – 6:30 PM\nSaturday: 9:00 AM – 3:00 PM\nDirect Desk: care@example.com',
            background: '#ffffff',
          },
          {
            type: 'contact_form',
            title: 'Ask Our Reception Team',
            body: 'Have a question before booking? Send us a confidential message.',
            background: '#f8fafc',
          },
        ],
      },
    ],
  },
  {
    id: 'hospitality-property',
    name: 'Real Estate & Hospitality',
    category: 'Hospitality',
    tagline: 'Showcase spaces, amenities, photo galleries, and capture viewing/booking inquiries.',
    badge: '3 pages · Gallery & Leads',
    accent: '#b45309',
    connectsTo: ['CRM Viewing Leads', 'Public Media Gallery'],
    theme: {
      primary: '#b45309',
      background: '#fffdf9',
      width: 'wide',
      typography: 'serif',
      section_spacing: 'relaxed',
      header_style: 'sticky',
      footer_style: 'dark',
      button_style: 'rounded',
    },
    pages: [
      {
        title: 'Home',
        slug: 'home',
        meta_description: 'Curated residences and boutique stays designed for comfort, light, and location.',
        isDefault: true,
        sections: [
          {
            type: 'hero',
            title: 'Spaces crafted for calm living & memorable stays.',
            body: 'Architectural residences and hospitality suites in prime neighborhoods with dedicated concierge management.',
            button_label: 'Explore Spaces',
            button_url: '/spaces',
            background: '#fffdf9',
            alignment: 'center',
          },
          {
            type: 'stats',
            title: 'Portfolio Highlights',
            body: '24 :: Curated properties\n98% :: Guest satisfaction\n24/7 :: Concierge support\n10 min :: To business district',
            background: '#ffffff',
            layout_columns: 'three',
          },
          {
            type: 'gallery',
            title: 'Featured Spaces Gallery',
            body: 'Attach reviewed architectural and interior photos from your Website Media library.',
            background: '#fffdf9',
            layout_columns: 'three',
          },
          {
            type: 'contact_form',
            title: 'Schedule a Private Viewing or Stay Inquiry',
            body: 'Tell us your dates or property requirements and our leasing advisor will reply today.',
            background: '#ffffff',
          },
        ],
      },
      {
        title: 'Spaces',
        slug: 'spaces',
        meta_description: 'Compare suites, residences, and flexible lease options.',
        sections: [
          {
            type: 'hero',
            title: 'Available Suites & Residences',
            body: 'Move-in ready spaces with high-speed fiber, backup power, and curated furnishings.',
            background: '#fffdf9',
          },
          {
            type: 'pricing',
            title: 'Current Availability',
            body: 'Garden Studio | KES 95,000 / mo | 52 sqm · Private balcony · Full kitchen & fiber\nTwo-Bedroom Loft | KES 165,000 / mo | 110 sqm · Corner sunlight · Dedicated parking\nPenthouse Suite | KES 280,000 / mo | 190 sqm · Rooftop terrace · Concierge included',
            background: '#ffffff',
            layout_columns: 'three',
          },
        ],
      },
      {
        title: 'Contact',
        slug: 'contact',
        meta_description: 'Reach our hospitality and leasing advisors.',
        sections: [
          {
            type: 'contact_form',
            title: 'Contact Our Leasing & Concierge Desk',
            body: 'Request floor plans, corporate stay rates, or an in-person tour.',
            background: '#fffdf9',
          },
        ],
      },
    ],
  },
];

const themeOf = ({
  id: _id,
  name: _name,
  vibe: _vibe,
  ...theme
}: WebsiteThemePreset): Omit<WebsiteThemePreset, 'id' | 'name' | 'vibe'> => theme;

export const SINGLE_PAGE_TEMPLATES: SinglePageTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    category: 'Business',
    summary: 'Start clean and drag in any of the 20 visual blocks.',
    accent: '#087e78',
    theme: themeOf(WEBSITE_THEME_PRESETS[0]),
    sections: [],
  },
  {
    id: 'product-launch',
    name: 'Product & Store Landing',
    category: 'Commerce',
    summary: 'Announcement bar, hero, live Commerce showcase, social proof & newsletter.',
    accent: '#047857',
    theme: themeOf(WEBSITE_THEME_PRESETS[0]),
    sections: SITE_STARTER_KITS[0].pages[0].sections,
  },
  {
    id: 'saas-landing',
    name: 'SaaS & App Launch',
    category: 'Business',
    summary: 'Hero, key metrics, feature grid, pricing plans, FAQ & demo CTA.',
    accent: '#1d4ed8',
    theme: themeOf(WEBSITE_THEME_PRESETS[2]),
    sections: SITE_STARTER_KITS[2].pages[0].sections,
  },
  {
    id: 'restaurant-menu',
    name: 'Restaurant & Dining',
    category: 'Hospitality',
    summary: 'Hours banner, editorial hero, signature dishes & table reservation block.',
    accent: '#7c2d12',
    theme: themeOf(WEBSITE_THEME_PRESETS[1]),
    sections: SITE_STARTER_KITS[1].pages[0].sections,
  },
  {
    id: 'agency-profile',
    name: 'Agency & Studio',
    category: 'Services',
    summary: 'Bold positioning hero, impact stats, services, leadership team & CTA.',
    accent: '#111827',
    theme: themeOf(WEBSITE_THEME_PRESETS[5]),
    sections: SITE_STARTER_KITS[3].pages[0].sections,
  },
  {
    id: 'booking-page',
    name: 'Appointment & Consultation',
    category: 'Services',
    summary: 'Built for clinics, salons, coaches & advisors with Calendar booking.',
    accent: '#0f766e',
    theme: themeOf(WEBSITE_THEME_PRESETS[4]),
    sections: SITE_STARTER_KITS[4].pages[0].sections,
  },
  {
    id: 'event-conference',
    name: 'Event & Conference',
    category: 'Creative',
    summary: 'Event banner, hero, speaker lineup, ticket tiers & registration inquiry.',
    accent: '#7c3aed',
    theme: {
      primary: '#7c3aed',
      background: '#ffffff',
      width: 'wide',
      typography: 'modern',
      section_spacing: 'standard',
      header_style: 'contrast',
      footer_style: 'dark',
      button_style: 'rounded',
    },
    sections: [
      {
        type: 'announcement',
        title: 'Early-Bird Tickets Open · Nairobi Summit · 2 Days · 20+ Speakers',
        body: '',
        background: '#f5f3ff',
        alignment: 'center',
      },
      {
        type: 'hero',
        title: 'Build What Comes Next — Annual Founders & Operators Summit',
        body: 'Two days of practical playbooks, live product demos, and curated roundtables with regional leaders.',
        button_label: 'Reserve Your Seat',
        button_url: '#register',
        background: '#ffffff',
        alignment: 'center',
      },
      {
        type: 'team',
        title: 'Featured Speakers',
        body: 'Dr. Grace Njeri | Keynote · Fintech Infrastructure | Scaling instant settlement networks across East Africa\nSamuel Mutua | Founder · Retail Operations | Growing multi-branch POS & online stores profitably\nLina Odhiambo | Partner · Growth Advisory | Building repeatable enterprise sales pipelines',
        background: '#f8fafc',
        layout_columns: 'three',
      },
      {
        type: 'pricing',
        title: 'Passes & Sponsorships',
        body: 'Standard Pass | KES 6,500 | Full 2-day sessions, workshops & networking lunch\nVIP Executive | KES 14,500 | Front-row seating, speaker dinner & lounge access\nTeam Pack (5 Seats) | KES 27,500 | Five full passes with priority registration',
        background: '#ffffff',
        layout_columns: 'three',
      },
      {
        type: 'contact_form',
        title: 'Register or Inquire About Group Passes',
        body: 'Leave your details below and our events desk will confirm your pass and invoice.',
        background: '#f8fafc',
      },
    ],
  },
  {
    id: 'portfolio-showcase',
    name: 'Creative Portfolio',
    category: 'Creative',
    summary: 'Minimalist showcase with media gallery, selected case studies & inquiry form.',
    accent: '#111827',
    theme: themeOf(WEBSITE_THEME_PRESETS[5]),
    sections: [
      {
        type: 'hero',
        title: 'Design, Photography & Digital Craft.',
        body: 'Independent studio creating distinctive visual identities, digital flagships, and editorial campaigns.',
        button_label: 'Commission a Project',
        button_url: '#contact',
        background: '#ffffff',
      },
      {
        type: 'gallery',
        title: 'Selected Works',
        body: 'Attach reviewed images from your Website Media library to showcase your best projects.',
        background: '#f8fafc',
        layout_columns: 'three',
      },
      {
        type: 'testimonial',
        title: 'Client Feedback',
        body: '“Transformed how customers perceive our brand. Conversions jumped immediately after launch.” — Maya S.',
        background: '#ffffff',
        alignment: 'center',
      },
      {
        type: 'contact_form',
        title: 'Let’s work together',
        body: 'Share your project scope and ideal launch date.',
        background: '#f8fafc',
      },
    ],
  },
  {
    id: 'pricing-faq',
    name: 'Pricing & FAQ',
    category: 'Business',
    summary: 'Clear multi-tier comparison table paired with expandable buyer FAQs.',
    accent: '#087e78',
    theme: themeOf(WEBSITE_THEME_PRESETS[0]),
    sections: [
      {
        type: 'hero',
        title: 'Transparent pricing, built for every stage.',
        body: 'No hidden fees, clear deliverables, and flexible upgrades whenever your needs grow.',
        background: '#ffffff',
        alignment: 'center',
      },
      {
        type: 'pricing',
        title: 'Compare Plans',
        body: 'Essential | KES 4,000 / mo | Ideal for solo operators & small shops\nProfessional | KES 9,500 / mo | Full workflow automation & priority support\nEnterprise | Custom | Multi-branch governance & dedicated onboarding',
        background: '#f8fafc',
        layout_columns: 'three',
      },
      {
        type: 'faq',
        title: 'Frequently Asked Questions',
        body: 'How quickly can we get started? :: Same day — activate your workspace and launch immediately.\nDo you offer annual billing discounts? :: Yes, save 15% when billed annually.\nCan we migrate our existing data? :: Our team supports CSV imports for products, customers, and records.',
        background: '#ffffff',
      },
    ],
  },
  {
    id: 'contact-hub',
    name: 'Contact & Lead Capture',
    category: 'Business',
    summary: 'Contact info, live CRM-connected inquiry form, and appointment booking.',
    accent: '#047857',
    theme: themeOf(WEBSITE_THEME_PRESETS[0]),
    sections: [
      {
        type: 'hero',
        title: 'We’d love to hear from you.',
        body: 'Reach our sales, support, or partnerships team — every message is tracked and answered promptly.',
        background: '#ffffff',
      },
      {
        type: 'contact_form',
        title: 'Send an inquiry',
        body: 'Your inquiry is securely delivered to our workspace inbox and CRM.',
        background: '#f8fafc',
      },
      {
        type: 'booking',
        title: 'Prefer a live call?',
        body: 'Book a quick 20-minute session directly on our calendar.',
        button_label: 'Schedule a Call',
        background: '#ffffff',
      },
    ],
  },
];
