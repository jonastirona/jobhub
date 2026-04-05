# UI/UX Standards Context Document

_JobHub — ATS for Candidates — Sprint 1 Baseline (S1-002)_

This document defines the team's UI and UX decisions so that every contributor — human or AI — builds interfaces that belong to the same product. Any deviation must be proposed to the team and this document updated before implementation.

**Design direction:** Clean, modern light theme with orange as the primary accent color. The tone is professional, energetic, and approachable. White and light gray surfaces keep the interface bright and scannable. Orange accents draw attention to primary actions and active states without overwhelming the layout.

---

## 1. Navigation Model

**Chosen pattern:** Fixed left sidebar (230px wide)

**Primary destinations (always visible):**

| Label            | Route        | Notes                           |
| ---------------- | ------------ | ------------------------------- |
| Dashboard        | `/dashboard` | Home page, default after login  |
| Profile          | `/profile`   | Candidate data management       |
| Document Library | `/documents` | Global document view (Sprint 3) |
| Settings         | `/settings`  | Account and app preferences     |

**Additional sidebar elements:**

- Logo icon and app name ("JobHub") at the top of the sidebar. The "Hub" portion renders in `--orange-500` (#f97316). The logo icon is a 34×34px rounded square with an orange gradient background.
- Navigation links are vertically stacked with 2px gap.
- Logout link is pinned to the bottom of the sidebar, separated by a top border.

**Navigation behavior rules:**

- The left sidebar is present on every authenticated page with no exceptions.
- The active destination uses an orange gradient background (`--orange-500` → `--orange-600`), white text, and a subtle orange box-shadow (`0 2px 10px rgba(249, 115, 22, 0.25)`).
- Inactive nav items use `--text-secondary` (#6b7280) and shift to `--orange-600` text on `--orange-50` (#fff7ed) background on hover.
- Nav items have 11px 16px padding with `--radius-md` (10px) border-radius and 14.5px font size at weight 500.
- Unauthenticated pages (login, register, reset password) do not show the sidebar. These use a centered card layout on the `--bg-page` background.

---

## 2. Dashboard Interaction Model

**Chosen job display pattern:** Data table with row-level actions

Jobs are displayed in a paginated table inside a white card container. Each row represents one job application. This model supports sorting/filtering naturally and scales cleanly as applications grow.

**Layout structure (top to bottom):**

1. **Top bar** — sticky header (68px) with page title, search box, notification bell, and user pill.
2. **Stat cards row** — 3-column grid of summary metrics (Total Applications, Interviews, Offers).
3. **Job applications table** — the primary data surface with column headers, rows, and pagination footer.

**How a user interacts with a job entry:**

- **View:** Each table row shows: row number, job title + location/type subtitle, company logo initial + name, pipeline stage, applied date (monospace), status badge, and action buttons.
- **Create:** The "＋ Add Job" primary button is positioned in the top-right of the table header. Clicking it opens a modal with the job creation form.
- **Edit:** Clicking a row opens a slide-out drawer from the right side containing the full job detail view with all editable fields.
- **Expand to detail:** The slide-out drawer contains tabs or scrollable sections for: job info, interview tracking, status/timeline, and linked documents (Sprint 2+). Drawer width is 560px on desktop.
- **Quick actions:** Each row has three icon action buttons (view, edit, archive) aligned at the end of the row.

**Consistency rule:** The data table + slide-out drawer pattern is used for all list-to-detail interactions across all sprints. The Document Library (Sprint 3) will follow the same table + drawer model.

---

## 3. Component Library and Usage Rules

**UI framework:** React + Tailwind CSS. All components use the CSS custom properties defined in this document.

**Font stack:** `'Outfit', sans-serif` for all UI text. `'JetBrains Mono', monospace` for dates, IDs, and code-like values.

### Buttons

| Type        | Appearance                                                                             | When to use                                          |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Primary     | Orange gradient fill (`--orange-500` → `--orange-600`), white text, orange glow shadow | Main action per form/section (Add Job, Save, Submit) |
| Secondary   | `--bg-white` background, 1px `--border` (#e5e7eb) outline, `--text-secondary` text     | Supporting actions (Filter, Cancel)                  |
| Destructive | `--red-bg` (#fee2e2) background on hover, `--red` (#dc2626) text                       | Delete, archive, irreversible actions                |
| Ghost       | Transparent background, no border, `--text-muted` (#9ca3af) text                       | Tertiary actions, close, dismiss                     |
| Icon button | 32×32px, transparent background, `--text-muted` color, `--radius-sm`                   | Row-level actions (view, edit, archive)              |

All buttons use `font-weight: 600`, `font-size: 13px`, `padding: 9px 18px`, and `border-radius: var(--radius-sm)` (6px). Hover states apply `translateY(-1px)` and increased shadow.

### Forms

- Labels are positioned above inputs.
- Required fields are indicated by a red asterisk (`*`) after the label text.
- Inputs use `--bg-input` (#f4f5f7) background, 1px `--border` (#e5e7eb) border, `--radius-sm` (6px) border-radius, `--text-primary` (#1a1a2e) text, 13.5px font size.
- Input focus state: border changes to `--orange-400` (#fb923c) with an orange glow (`0 0 0 3px rgba(249, 115, 22, 0.08)`).
- Validation errors appear below the field in `--red` (#dc2626) text at 12px font size with a small warning icon prefix.
- All forms preserve unsaved work on validation failure (form state is never cleared).
- Save/submit buttons are right-aligned at the bottom of the form. Cancel/ghost buttons appear to the left of the primary action.

### Cards (Containers)

- Cards are used as section containers (stat cards, table wrapper, form sections) — not as individual job entries.
- Card background: `--bg-card` (#ffffff).
- Card border: none (uses box-shadow instead).
- Card box-shadow: `--shadow-card` = `0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)`.
- Card border-radius: `--radius-lg` (14px).
- Card padding: 22–24px.
- Hover state (where interactive): shadow increases to `--shadow-elevated` (`0 4px 16px rgba(0,0,0,0.08)`), `translateY(-1px)`.

### Stat Cards

- Displayed in a 3-column grid at the top of the dashboard with 20px gap.
- Each card contains: colored icon wrap (52×52px, rounded 10px, tinted background), label (13px, weight 500, `--text-secondary`), value (30px, weight 800, `--text-primary`, -1px letter-spacing), trend line, and a mini bar chart on the right.
- Accent colors per card:
  - Applications: orange (`--orange-50` bg, `--orange-500` icon)
  - Interviews: blue (`--blue-bg` bg, `--blue` icon)
  - Offers: green (`--green-bg` bg, `--green` icon)
- Mini bar charts: 7 bars, 6px wide, 3px border-radius, colored from light to saturated in the card's accent ramp.

### Modals and Drawers

- **Modals** are used for: job creation forms, confirmation dialogs, and destructive action confirmations.
- **Drawers** (slide-out from right) are used for: job detail view, document detail view, any expanded editing context.
- Both are closable by: X button (top-right), clicking the backdrop overlay, and pressing Escape.
- Modal max-width: 480px for forms, 400px for confirmations.
- Drawer width: 560px on desktop, full-screen on mobile.
- Backdrop: black overlay at 40% opacity.

### Status Badges / Pipeline Indicators

| Stage      | Background               | Text Color                   | Display style |
| ---------- | ------------------------ | ---------------------------- | ------------- |
| Interested | `#f3f4f6` (gray)         | `--text-secondary` (#6b7280) | Pill + dot    |
| Applied    | `--blue-bg` (#dbeafe)    | `--blue` (#2563eb)           | Pill + dot    |
| Interview  | `--orange-100` (#ffedd5) | `--orange-700` (#c2410c)     | Pill + dot    |
| Offer      | `--green-bg` (#dcfce7)   | `--green` (#16a34a)          | Pill + dot    |
| Rejected   | `--red-bg` (#fee2e2)     | `--red` (#dc2626)            | Pill + dot    |
| Archived   | `#f3f4f6` (gray)         | `--text-muted` (#9ca3af)     | Pill + dot    |

Badge format: `display: inline-flex`, 5px 12px padding, 50px border-radius (full pill), 12px font-size, weight 600. Each includes a 6px circular dot in `currentColor` before the label text.

These stage colors and pill styles are used everywhere a pipeline stage appears — dashboard table, job detail views, analytics, and filters.

---

## 4. Color Palette

| Role             | Value                  | CSS Variable       | Usage                                        |
| ---------------- | ---------------------- | ------------------ | -------------------------------------------- |
| Primary          | `#f97316`              | `--orange-500`     | Primary buttons, active nav, brand accent    |
| Primary hover    | `#ea580c`              | `--orange-600`     | Hover/active for primary elements            |
| Primary light    | `#fff7ed`              | `--orange-50`      | Hover backgrounds, tinted surfaces           |
| Primary soft     | `#ffedd5`              | `--orange-100`     | Interview badge background                   |
| Primary border   | `rgba(249,115,22,0.2)` | `--border-orange`  | Subtle orange-tinted borders                 |
| Success          | `#16a34a`              | `--green`          | Offer stage, positive trends, success toasts |
| Success bg       | `#dcfce7`              | `--green-bg`       | Success badge backgrounds                    |
| Warning          | `#ca8a04`              | `--yellow`         | Attention indicators                         |
| Warning bg       | `#fef9c3`              | `--yellow-bg`      | Warning badge backgrounds                    |
| Error            | `#dc2626`              | `--red`            | Rejected stage, errors, destructive actions  |
| Error bg         | `#fee2e2`              | `--red-bg`         | Error badge backgrounds, destructive hover   |
| Info             | `#2563eb`              | `--blue`           | Applied stage, informational indicators      |
| Info bg          | `#dbeafe`              | `--blue-bg`        | Info badge backgrounds                       |
| Page background  | `#f4f5f7`              | `--bg-page`        | Page body behind cards                       |
| Surface/card     | `#ffffff`              | `--bg-white`       | Cards, sidebar, topbar, modals               |
| Input background | `#f4f5f7`              | `--bg-input`       | Form input backgrounds, search box           |
| Row hover        | `#fef6ee`              | `--bg-row-hover`   | Table row hover (warm orange tint)           |
| Border           | `#e5e7eb`              | `--border`         | Card borders, dividers, input borders        |
| Border light     | `#f0f0f2`              | `--border-light`   | Subtle row separators                        |
| Text primary     | `#1a1a2e`              | `--text-primary`   | Headings, body text, values                  |
| Text secondary   | `#6b7280`              | `--text-secondary` | Labels, nav items, supporting text           |
| Text muted       | `#9ca3af`              | `--text-muted`     | Placeholders, captions, disabled text        |
| Text white       | `#ffffff`              | `--text-white`     | Text on orange/colored backgrounds           |

**Rule:** All colors must be referenced by CSS variable name in component code, never hardcoded hex values.

---

## 5. Typography

**Primary font:** `'Outfit', sans-serif` — used for all UI text.
**Monospace font:** `'JetBrains Mono', monospace` — used for dates, row numbers, and code/data values.

| Element             | Size   | Weight        | Color                | Notes                     |
| ------------------- | ------ | ------------- | -------------------- | ------------------------- |
| Page title (topbar) | 20px   | 700 (bold)    | `--text-primary`     | -0.3px tracking           |
| Section heading     | 16px   | 700 (bold)    | `--text-primary`     |                           |
| Stat card label     | 13px   | 500 (medium)  | `--text-secondary`   |                           |
| Stat card value     | 30px   | 800 (xbold)   | `--text-primary`     | -1px tracking             |
| Table header        | 12px   | 600 (semi)    | `--text-muted`       | Uppercase, 0.5px tracking |
| Table body text     | 14px   | 400 (regular) | `--text-primary`     |                           |
| Job title (in row)  | 14px   | 600 (semi)    | `--text-primary`     |                           |
| Job subtitle (row)  | 12px   | 400 (regular) | `--text-muted`       |                           |
| Date values         | 13px   | 400 (regular) | `--text-secondary`   | Monospace font            |
| Button text         | 13px   | 600 (semi)    | Per button type      |                           |
| Nav item            | 14.5px | 500 (medium)  | `--text-secondary`   |                           |
| Brand name          | 20px   | 700 (bold)    | `--text-primary`     | "Hub" in `--orange-500`   |
| Status badge        | 12px   | 600 (semi)    | Per stage            |                           |
| Trend text          | 12px   | 500 (medium)  | `--green` or `--red` |                           |

---

## 6. Spacing and Layout

**Spacing scale (4px base):** 4 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 48

**Border-radius scale:**

| Token         | Value | Usage                                          |
| ------------- | ----- | ---------------------------------------------- |
| `--radius-sm` | 6px   | Buttons, inputs, action buttons, company logos |
| `--radius-md` | 10px  | Nav items, icon wraps                          |
| `--radius-lg` | 14px  | Cards, table containers, modals                |
| `--radius-xl` | 20px  | Large decorative containers                    |
| `50px`        | —     | Pill badges, search box, user pill             |

**Page layout rules:**

- Sidebar width: 230px (fixed).
- Main content: `margin-left: 230px`.
- Top bar: 68px height, sticky, white background, bottom border.
- Content area padding: 28px 32px.
- Stat cards: 3-column grid, 20px gap, 28px bottom margin.
- Table section: full width within content area.

**Table layout:**

- Header cells: 14px 24px padding, `--bg-page` background, uppercase.
- Body cells: 16px 24px padding.
- Row separator: 1px solid `--border-light`.
- Footer: 14px 24px padding, 1px top border.

---

## 7. Feedback and State Patterns

### Loading States

- Page-level: skeleton placeholders matching stat cards and table rows (pulsing `--bg-page` → `--border-light`).
- Button loading: spinner replaces label; button disabled with reduced opacity.

### Success Feedback

- After save/create/update: toast notification from top-right.
- Toast: white background, 1px `--border`, `--radius-md`. Green left-border accent (3px solid `--green`).
- Auto-dismiss after 3 seconds. Includes dismiss X button.

### Error Feedback

- Form validation: inline per-field errors in `--red` (see Section 3).
- Server errors: toast from top-right with red left-border accent.
- Network errors: full-width `--red-bg` banner at top of content area with retry action.
- Error messages use plain language, no codes or stack traces.

### Empty States

- Dashboard with no jobs: centered within the table container. Muted icon (48px, `--text-muted`), heading "No applications yet" in `--text-primary`, subtext in `--text-secondary`, and primary "Add Job" button.
- Profile incomplete: handled by completion indicator (Section 8).

### Confirmation Dialogs

- Used before: delete, archive, discard unsaved changes.
- Pattern: centered modal (400px), white background. Clear heading ("Delete this job?"), consequence text, ghost "Cancel" (left) + destructive button (right) with explicit label. Never "OK" or "Yes".

---

## 8. Profile Completion Indicator

**Display style:** Segmented progress bar with percentage

**Location:** Top of the profile page, full content width inside a card.

**Appearance:** Horizontal bar divided into segments per profile section. Completed segments fill with `--orange-500`; incomplete segments remain `--bg-page` (#f4f5f7). Percentage label (e.g., "40% complete") to the right in `--text-secondary`. Below the bar, a line lists incomplete sections.

**Tracked sections (Sprint 1 baseline):**

- Identity & Contact: first name, last name, email, phone, location
- Professional Summary: headline, summary paragraph

**Behavior:**

- Updates immediately on save (no page reload).
- Incomplete required fields flagged with a subtle orange left-border on the section card.
- New segments added automatically as Sprint 2 sections arrive.

---

## 9. Responsive Behavior

**Breakpoints:**

| Name    | Min-width | Notes                                       |
| ------- | --------- | ------------------------------------------- |
| Mobile  | 0px       | Single column, sidebar becomes overlay menu |
| Tablet  | 768px     | 2-column stat grid, collapsible sidebar     |
| Desktop | 1024px    | Full layout, 3-column stats, fixed sidebar  |

**Key responsive rules:**

- Desktop is the primary design target.
- Below 1024px: stat cards → 2-column grid.
- Below 768px: stat cards → single column. Sidebar → hamburger overlay. Table → horizontal scroll.
- Drawers → full-screen on mobile.
- Modals → near-full-width (16px margin) on mobile.
- Forms remain single-column at all breakpoints.

---

## 10. Accessibility Baseline

- Color contrast meets WCAG AA. `--text-primary` (#1a1a2e) on white ≈ 16:1. `--text-secondary` (#6b7280) on white ≈ 5.5:1. `--text-muted` (#9ca3af) is used only for non-essential text.
- All form inputs have associated `<label>` elements.
- Interactive elements are keyboard-reachable via Tab.
- Focus indicators: 2px `--orange-500` outline with 2px offset on all interactive elements. Never removed.
- Escape closes modals and drawers. Enter submits forms and activates buttons.
- Status changes (toasts, validation errors) announced via `aria-live="polite"`.
- Icon-only buttons include `aria-label` attributes.
- Pipeline badges include text labels, not just color.

---

## 11. Animations and Transitions

- **Page load:** Stat cards stagger with `fadeInUp` (0.4s ease, 80ms stagger). Table fades up 200ms after last card.
- **Hover:** `transition: all 0.15s ease` on all interactive elements.
- **Row hover:** background to `--bg-row-hover` over 120ms.
- **Drawers:** slide from right, 250ms ease-out. Backdrop fades 200ms.
- **Modals:** scale from 96% with fade, 200ms.
- **Toasts:** slide from right, 300ms.
- **Buttons:** `translateY(-1px)` + shadow increase, 150ms.
- **Reduced motion:** all animations respect `prefers-reduced-motion: reduce`.

---

## 12. Company Logo Initials

In the job table, a 32×32px rounded square (`--radius-sm`) displays the company's first letter in white at 13px bold. Each logo uses a unique gradient background. Use a deterministic mapping (e.g., hash of company name) so the same company always gets the same color.

---

## 13. Pagination

- Table footer, right-aligned.
- Page buttons: 34×34px, `--radius-sm`, 1px `--border`, `--text-secondary`, 13px weight 500.
- Active page: `--orange-500` background, white text, orange box-shadow.
- Hover: border → `--orange-300`, text → `--orange-500`.
- Navigation arrows (‹ ›): same button style, 16px font.
- "Show X entries" dropdown: left-aligned in footer.

---

## 14. Consistency Checklist

Use this before each PR that touches UI:

- [ ] Does this screen use the left sidebar navigation on a white background?
- [ ] Do buttons follow Section 3 rules (orange gradient primary, outlined secondary, red destructive)?
- [ ] Do status badges use the exact pipeline colors and pill+dot format from Section 3?
- [ ] Are form inputs using `--bg-input` with `--border` and orange focus ring?
- [ ] Are form validation errors inline below the field in `--red`?
- [ ] Does spacing follow the 4px scale in Section 6?
- [ ] Are all containers using `--bg-white` with `--shadow-card` and `--radius-lg`?
- [ ] Are loading, success, and error states handled per Section 7?
- [ ] Is the feature usable at mobile (< 768px) and desktop (≥ 1024px)?
- [ ] Are all interactive elements keyboard-accessible with visible focus indicators?
- [ ] Do animations respect `prefers-reduced-motion`?
- [ ] Are all colors referenced by CSS variable name, not hardcoded hex?

---

## How to Use This Document

**For team members:** Reference this before building any UI. Every component, page, and interaction should trace back to a decision here. If you need to deviate, propose the change to the team and update this document first.

**For AI coding assistants:** Include this document as context when generating frontend code. All generated components, pages, and styles must use the CSS custom properties, typography, spacing, and interaction patterns defined here. Do not invent new colors, fonts, or layout patterns outside this system.

**Living document:** Update as needed.
