# Denali Design System

> **Denali** is a treasury relationship intelligence platform for community and regional banks. Named for North America's highest peak, it brings the strength of the summit to your treasury desk — the products your customers run, surfaced and won.

## Product Context

Denali reads a bank's ACH and core activity to surface the treasury products each customer runs **outside** the bank — scored, explained, projected, and routed through approval to the bank's CRM. Built for community and regional banks. Upload-first: no core integration required to start.

### Core Modules

- **Daily:** Dashboard (relationship gap intelligence), Command Center, Run a Report, Workspace, Customers
- **Intelligence:** Assistant (AI), Core Search, ACH Intelligence, Leakage Reports, Income Projections, RFP Intelligence, Merchant Residuals, Vendor Directory
- **Pipeline:** Pipeline (Pipedrive-style board), Referrals, Approval Queue, Executive Reports
- **Admin:** White Label, Blocker Prevention, Admin Settings, Audit Log

### Roles

- **Banker** — view opportunities, run reports, submit referrals. Cannot approve.
- **Approver** — approve referrals, approve/reject CRM push, view audit.
- **Admin** — manage users, settings, white-label, integrations.

### Core Integrations

Jack Henry (first), Fiserv, FIS, CSI/NuPoint, Finastra, plus NACHA file-feed, CRM push (Salesforce, Dynamics, HubSpot), and 110+ integrations.

## Domain Language

See `CONTEXT.md` for the authoritative glossary. Key terms:

- **Opportunity** (not "lead" or "insight") — an AI-identified revenue opportunity with a Score and mandatory Explanation
- **Prospect** — the customer/counterparty an Opportunity targets
- **CRM Push** (not "sync") — one-directional, approval-gated write to external CRM
- **Review Queue** — where approvers approve/reject CRM pushes (nothing reaches CRM without it)
- **Upload** — NACHA/ACH file submitted through Upload Center
- **Connector** — integration with core, CRM, or webhook (credentials server-side only)
- **FI** — Financial Institution, the tenant
- Roles: `analyst`, `approver`, `executive`, `admin`

## Sources

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (`src/`)
- **Backend:** Python FastAPI (`backend/`) — 342 tests
- **Config:** Product catalogs, descriptor rules, field mappings (`config/`)
- **Docs:** PRD, decisions, handoff docs, security notes (`docs/`, `*.md`)

---

## CONTENT FUNDAMENTALS

### Voice & Tone

- **Professional, bank-grade, confident.** Speaks to treasury bankers and bank executives.
- **Perspective:** Second-person ("your customers", "your book") and institutional ("the bank").
- **Casing:** Sentence case for UI. Uppercase tracking for labels and eyebrows. CamelCase for product names.
- **No emoji.** No casual slang. No exclamation marks in UI copy.
- **Copywriting style:** Short, declarative, data-backed. "$1.42M in treasury revenue identified." "428 gap opportunities." "6 weeks to first win plan."
- **Eyebrow/label pattern:** `UPPERCASE TRACKING-WIDE` in red or muted — e.g., "TREASURY INTELLIGENCE", "YOUR NUMBER", "THE PLATFORM"
- **Numbers first:** Lead with the dollar figure or count, then explain.
- **Trust signals:** "Every action audited", "Approval-gated to CRM", "No core integration required"

### Examples

- "Win the treasury business already on your books."
- "Denali reads ACH and core activity to surface the products your customers run outside the bank."
- "$480K in treasury revenue identified across the book, in the first 6 weeks."
- "Three calls, three wins."

---

## VISUAL FOUNDATIONS

### Brand Identity

- **Brandmark:** A designed snow-capped massif — asymmetric ridge with gold gradient rock face (lit left / shadowed right) and irregular snow line with couloirs, over a faint aurora arc.
- **Wordmark:** "Denali" in black (900) weight, tight tracking. On dark: white.
- **Tagline:** "Treasury Intelligence" — 9px, bold, uppercase, tracking-\[0.24em\], in signal red (#bb0000).
- **Feel:** Premium banking software. Think a major retail bank's investor site, not a startup.

### Color System

**Navy + Signal Red on generous white space** — a polished, bank-grade scheme.

| Token | Hex | Usage |
| --- | --- | --- |
| `--navy` | `#3a3a3c` | Primary — headings, nav, sidebar, buttons, text |
| `--navy-deep` | `#1f1f23` | Footer, utility bar, deepest dark |
| `--navy-mid` | `#52525b` | Hover, secondary dark |
| `--red` | `#bb0000` | Primary CTA, accent, signal, eyebrows |
| `--red-dark` | `#990000` | CTA hover, red emphasis |
| `--ink` | `#1c2530` | Body text |
| `--muted` | `#5b6770` | Secondary text, descriptions |
| `--line` | `#dfe3e8` | Borders, dividers, card borders |
| `--mist` | `#f3f5f7` | Light section background |
| `--cream` | `#eef1f4` | Hover backgrounds, default badge |
| `--white` | `#ffffff` | Card surfaces, page bg |

**Badge Tones** (status system):

- `default` — grey (`#eef1f4` bg)
- `green` — held at bank, success, approved
- `amber` — submitted, pending, caution
- `red` — held elsewhere, error, rejected
- `navy` — in CRM, active
- `gold` — high priority, primary CTA accent

**Chart Palette:** `#3a3a3c`, `#bb0000`, `#5fb4d2`, `#990000`, `#52525b`, `#cbd2da`

**Aurora Accents** (decorative only): green `#4ac99b`, blue `#5fb4d2`, purple `#7c8cdc` — used in the mountain mark's aurora arc and background shimmers.

**Gold** (brand mark): light `#f0dcc0`, mid `#d8ac60`, dark `#926c2c` — the mountain's rock gradient.

### Typography

- **Primary font:** Inter (400–900), with Figtree and system-ui fallbacks
- **Headings:** Extrabold (800), tight tracking (-0.02em), navy color
- **Body:** 14px, regular (400), letter-spacing -0.006em
- **Labels:** 11px, semibold (600), uppercase, tracking 0.06em, muted color
- **Eyebrows:** 12px, bold (700), uppercase, tracking 0.16–0.18em, red color
- **KPI values:** 24px+, extrabold (800), tabular-nums
- **Section titles:** 2–2.3rem, extrabold
- **No decorative or serif fonts** in the app UI (only Inter)

### Spacing

- **10px increment system** inherited, but Tailwind-style 4px grid in practice
- **Card padding:** 16px (p-4)
- **Page padding:** 16px mobile, 24px desktop (p-4 md:p-6)
- **Grid gap:** 12px (gap-3)
- **Sidebar width:** 248px

### Border Radius

| Token | Value | Usage |
| --- | --- | --- |
| `--radius-sm` | `4px` | Buttons, badges |
| `--radius-md` | `6px` | Sidebar items, inputs, focus rings |
| `--radius-lg` | `8px` | Cards |
| `--radius-xl` | `12px` | Modals, large panels |
| `--radius-2xl` | `16px` | Premium cards, testimonials |
| `--radius-full` | `9999px` | Pills, avatars, announcement dots |

### Shadows

- **Card:** `0 1px 1px rgba(16,24,40,0.04)` — barely there, just definition
- **Header:** `0 1px 2px -1px rgba(8,47,61,0.10)` — hairline
- **Dropdown:** standard elevated panel
- **Lift (hover):** `0 14px 30px -16px rgba(8,47,61,0.35)` — on `.denali-lift` cards
- **Gold button:** `0 6px 16px -8px rgba(187,0,0,0.55)` — red glow
- **Premium:** `0 40px 80px -34px rgba(28,37,48,0.42)` — hero cards, modals
- **Ring (elite):** inset white ring + deep shadow — for the hero product preview

### Hover & Focus States

- **Buttons:** Background shifts (navy→navy-mid, ghost→mist). Active: translateY(1px).
- **Cards:** `.denali-lift` — translateY(-2px) + deeper shadow on hover. 0.1s ease.
- **Links:** opacity 0.7 on hover.
- **Focus ring:** 2px solid navy, offset 2px, border-radius 6px, soft halo `0 0 0 4px rgba(58,58,60,0.16)`.

### Animation

- **Fade-in:** 0.16s ease — page transitions, card entrances
- **Lift:** 0.1s ease — card hover
- **Aurora shimmer:** 6s ease-in-out infinite — brand mark background
- **Float:** 6.5s / 8s ease-in-out infinite — hero decorative elements
- **Elite rise:** 0.8s cubic-bezier(0.16, 0.84, 0.44, 1) — landing page stagger
- **Gradient text:** 6s linear infinite — red gradient shimmer on hero headline
- **Sheen:** 5s ease-in-out infinite — glass reflection sweep
- **Shimmer (loading):** 1.4s ease infinite — skeleton placeholders
- **All respect `prefers-reduced-motion: reduce`**

### Glass & Premium Effects

- **Glass:** `rgba(255,255,255,0.72)` bg + `saturate(140%) blur(14px)` backdrop
- **Dotted grid:** `radial-gradient(circle at 1px 1px, rgba(58,58,60,0.07) 1px, transparent 0)` at 24px
- **Red glow orbs:** `radial-gradient(circle, #bb0000, transparent 70%)` at 10–25% opacity, blurred
- **Top aurora seam:** `linear-gradient(90deg, transparent, rgba(187,0,0,0.4), transparent)` 1px

### Sidebar

- **Background:** Linear gradient from navy-deep → navy → navy-mid, with a subtle red glow at top
- **Texture:** Diagonal repeating lines at 5% opacity
- **Nav items:** 13.5px, white/60 default, white on active + left accent bar (red gradient)
- **Groups:** 9px uppercase tracking-\[0.2em\] headers, collapsible
- **Active indicator:** 3px rounded pill, left edge, gradient `#ff6a7e → #bb0000`

---

## ICONOGRAPHY

### Approach

Denali uses **minimal monochrome SVG path glyphs** — not an icon font for app chrome. Simple stroked paths (strokeWidth 1.7, round caps/joins) in a 24×24 viewBox.

The **Denali icon font** (1000+ icons, from the open-source denali-design project) is also available at `assets/icons/` for extended icon needs.

### App Chrome Icons

Defined inline as SVG path data. Key glyphs: grid (dashboard), bolt (command), users (customers), data (workbench), doc (reports), search, bars (analytics), list (pipeline), card (merchant), plug (processor), star (rewards), check (approvals), gear (settings), shield (audit), spark (assistant).

### Style Rules

- Stroke-based, 1.7px weight
- Round linecap and linejoin
- 15×15px display size in nav, 17×17px in header
- Color inherits from parent (currentColor)
- opacity 0.9 default in nav

---

## PROJECT STRUCTURE

```
├── styles.css                  # Global CSS entry (imports only)
├── tokens/
│   ├── fonts.css               # Inter from Google Fonts + icon font
│   ├── colors.css              # Navy, red, surfaces, badges, charts, aurora
│   ├── typography.css          # Inter type scale, weights, tracking
│   ├── spacing.css             # Spacing, radius, layout tokens
│   ├── shadows.css             # Shadow system + z-index + transitions
│   └── base.css                # Reset, defaults, focus ring, icon helper
├── components/
│   ├── core/                   # Button, Badge, Card, Tag, Alert
│   ├── forms/                  # Input, Select, Checkbox, Radio, Switch
│   ├── navigation/             # Tabs
│   └── feedback/               # Modal, Tooltip
├── guidelines/                 # Foundation specimen cards
├── assets/
│   ├── icons/                  # Denali icon font (1000+ icons)
│   └── logos/                  # Denali badge marks
├── ui_kits/
│   └── docs-site/              # Banking workstation recreation
├── readme.md                   # This file
└── SKILL.md                    # Agent skill manifest
```

---

## COMPONENTS

| Component | Path | Description |
| --- | --- | --- |
| Button | `components/core/` | Primary (navy), gold (red CTA gradient), ghost, danger |
| Badge | `components/core/` | 6 tones: default, green, amber, red, navy, gold |
| Card | `components/core/` | Surface with border + shadow, optional hover lift |
| Tag | `components/core/` | Filled and outlined pill tags with close action |
| Alert | `components/core/` | Info, success, warning, danger with icon + close |
| Input | `components/forms/` | Text field with icon slots, sizes, error/disabled |
| Select | `components/forms/` | Dropdown with custom arrow |
| Checkbox | `components/forms/` | Standard, partial, disabled states |
| Radio | `components/forms/` | Radio group control |
| Switch | `components/forms/` | Toggle with on/off labels |
| Tabs | `components/navigation/` | Primary (folder) and secondary (underline) |
| Modal | `components/feedback/` | Overlay dialog with header/content/footer |
| Tooltip | `components/feedback/` | Directional tooltip on hover |

## CODEBASE REFERENCE

The full Denali platform codebase includes:

- **Frontend** (`src/`): \~120 React components and pages — Landing, Dashboard, Pipeline, Customer360, ExecutivePortfolio, IncomeProjector, BankerLogin, AuditLog, AdminSettings, WhiteLabelSettings, etc.
- **Backend** (`backend/`): FastAPI with ACH analytics engine, intelligence layer (held-here-elsewhere, relationship gap scoring, income projections, evidence builder, why-now triggers), referral system with approval gates, merchant/processor portfolio, core connectors (Jack Henry, Fiserv, FIS, CSI), rewards engine, vendor management, audit logging, and 342 tests.
- **Config** (`config/`): 77 JSON/CSV rule files — product catalogs, descriptor rules, field mappings, SIC/NAICS matrices, referral workflows, rewards tiers, certification matrices.
- **Docs** (`docs/`): PRD, decisions, security & data flow, core certification paths, connector handoffs, production runbook.
