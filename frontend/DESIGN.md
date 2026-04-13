# DESIGN.md

## Product Context
This frontend is the web dashboard of a phishing website detection and active defense system.

It is used for:
- security dashboard overview
- website analysis detail pages
- detection history
- model/service status
- plugin/device connection status
- risk analytics and system monitoring

This product must feel like a real security SaaS platform.

Core feeling:
- professional
- trustworthy
- modern
- calm
- technical
- efficient

Avoid:
- childish visuals
- toy-like UI
- over-decorated styles
- overly colorful layouts
- flashy gradients everywhere
- entertainment-style pages

---

## Design Goal
The final UI should look like:
- a real cybersecurity product
- an enterprise security console
- an AI-driven risk analysis dashboard
- a polished competition-ready system

The interface must be:
- easy to scan quickly
- visually consistent
- clean and information-dense without being messy
- suitable for demo, judging, and presentation

---

## Tech and Styling Preference
When generating UI:
- prefer React component architecture
- prefer Tailwind CSS utility classes
- prefer reusable UI components
- avoid scattered inline styles
- keep code maintainable and structured

If charts are needed:
- use simple, clean charts
- prioritize readability over decoration

---

## Visual Identity

### Overall Style
Use a modern light-theme enterprise security dashboard style.

The layout should feel:
- stable
- professional
- data-driven
- serious but not heavy

This is not a social product.
This is not an e-commerce product.
This is not a playful AI chat app.

It is a network security and risk intelligence product.

---

## Color System

### Primary Colors
Use blue as the main trust color.

Recommended:
- Primary: #2563EB
- Primary Hover: #1D4ED8
- Primary Soft: #DBEAFE

### Semantic Colors
Safe:
- #16A34A

Warning:
- #F59E0B

Danger:
- #DC2626

Info:
- #0EA5E9

### Neutral Colors
Background:
- #F8FAFC

Surface:
- #FFFFFF

Surface Secondary:
- #F1F5F9

Border:
- #E2E8F0

Text Primary:
- #0F172A

Text Secondary:
- #475569

Text Muted:
- #64748B

### Usage Rules
- Blue = core actions, active selection, important metrics
- Green = safe result, healthy status, successful connection
- Orange = suspicious, medium risk, warnings
- Red = malicious, danger, urgent issues
- Gray/slate = neutral information, inactive state, secondary content

Do not overuse red.
Do not make the whole dashboard feel alarming.
Only use strong danger colors where risk is actually high.

---

## Typography

### Font Style
Use modern sans-serif fonts.
Prefer clean system-style reading experience.

### Typography Hierarchy
- Page Title: bold and prominent
- Section Title: clear and compact
- Card Title: medium-bold
- Body Text: readable and concise
- Secondary Description: muted and smaller
- Risk Score / Status Result: visually prominent

### Text Tone
All interface text should feel:
- short
- professional
- clear
- product-oriented
- security-console-like

Avoid:
- long academic paragraphs
- exaggerated marketing copy
- decorative slogans
- vague button labels

Good examples:
- Scan Now
- View Report
- Detection History
- Risk Score
- Service Status
- Suspicious Features
- Leave Site
- Continue Anyway

---

## Layout Principles

### General Layout
Prefer:
- sidebar + topbar dashboard layouts
- card-based content grouping
- grid systems for metrics and analytics
- clear separation between overview and detail sections

### Page Density
The dashboard can contain substantial information, but must remain readable.
Use whitespace intentionally.
Keep strong grouping between modules.

### Spacing
Use comfortable spacing:
- page padding: medium to large
- card padding: medium
- section spacing: consistent
- internal alignment: strict and clean

### Radius
Use soft but modern radius values:
- large cards: rounded-2xl
- normal cards: rounded-xl
- buttons: rounded-xl
- inputs: rounded-xl
- modals/drawers: rounded-2xl

### Shadows
Use soft shadows only.
Prefer subtle elevation.
Avoid heavy, old-fashioned shadows.

---

## Core Components

### Buttons

#### Primary Button
Used for:
- main actions
- submit
- scan
- open report
- save settings

Style:
- blue filled background
- white text
- medium weight
- soft hover transition
- clear active/focus state

#### Secondary Button
Used for:
- less important actions
- cancel
- back
- view more
- export

Style:
- light background
- border visible
- dark text
- calm appearance

#### Danger Button
Used for:
- block
- delete
- force disconnect
- dangerous confirmation

Style:
- red background
- reserved for true danger/destructive action only

### Inputs
Inputs should:
- have visible borders
- have clean focus states
- feel modern and stable
- support placeholder text clearly
- not look cramped

### Search Bar
Dashboard search areas should feel like real admin tooling.
Keep search bars clean and not oversized.

### Cards
Cards are the main structural unit.

All cards should:
- use white or soft surface background
- have subtle border
- soft shadow
- clear header/content separation
- concise titles
- optionally support actions in header

### Status Badge
Create a reusable status badge component.

Supported status examples:
- Safe
- Suspicious
- Malicious
- Unknown
- Online
- Offline
- Connected
- Disconnected
- Running
- Stopped
- Healthy
- Error

Style rules:
- Safe: green tinted background + green text
- Suspicious: orange tinted background + orange text
- Malicious: red tinted background + red text
- Unknown: gray tinted background + muted text
- Online/Connected/Running/Healthy: green or blue depending on context
- Error/Offline/Disconnected: red or gray depending on severity

### Tables
Use clean enterprise tables.

Tables should:
- have visible header row
- have soft row dividers
- support hover states
- align columns clearly
- not look too dense
- support status badge display
- support action buttons in row

### Metric Cards
Metric cards should be reusable and consistent.

Typical metrics:
- total scans
- malicious websites detected
- suspicious websites detected
- safe websites detected
- online plugins
- active services
- detection success rate

Metric cards should include:
- title
- value
- optional icon
- optional trend or delta
- optional short description

### Alert Banner
Use alert banners for:
- service disconnected
- model unavailable
- plugin offline
- high risk system warnings

Keep them noticeable but not visually noisy.

### Tabs
Use tabs for:
- switching analysis sections
- evidence categories
- historical records
- service views

Tabs should look modern and restrained.

### Charts
Charts should feel professional and minimal.

Use charts for:
- detection trends
- risk category distribution
- plugin online trend
- model performance snapshots
- scan volume over time

Rules:
- do not over-decorate charts
- do not use too many colors
- keep legends readable
- use semantic colors where meaningful

---

## Page Rules

### 1. Dashboard Page
This is the first impression page.

It should contain:
- top summary metric cards
- recent detection statistics
- service/model/plugin status cards
- recent scan history table
- risk trend chart or category chart
- quick actions area if useful

Must feel:
- authoritative
- clean
- instantly understandable

A judge should understand the system value within 5 to 10 seconds.

### 2. Detection History Page
This page should focus on:
- historical records
- filtering
- status-based browsing
- quick access to details

Must contain:
- table view
- search/filter controls
- status badges
- time information
- detail action buttons

### 3. Website Analysis Detail Page
This is one of the most important pages.

It should include:
- URL and domain information
- website screenshot or preview area if available
- risk score
- final classification
- SSL/certificate/domain related information if available
- suspicious feature list
- AI explanation or model reasoning summary
- evidence cards / analysis blocks
- timeline or analysis flow if useful

Style:
- structured
- report-like
- technical
- clean section grouping
- emphasis on clarity and evidence

### 4. Service Status / System Monitoring Page
This page should include:
- backend service state
- model service state
- extension connection status
- health checks
- uptime / recent error summaries if available

Style:
- operational
- dashboard-like
- reliable and calm

---

## Risk Presentation Rules

### Risk Levels
Define visual hierarchy for:
- Safe
- Suspicious
- Malicious

#### Safe
Use green badge or icon.
Do not make it flashy.
Should feel verified and calm.

#### Suspicious
Use orange/amber.
Should feel cautionary.
Indicate that manual verification may be needed.

#### Malicious
Use red prominently.
Must be visually obvious.
Should feel serious and immediate.

### Risk Score
Risk score should always be easy to see.
It can appear as:
- large numeric card
- progress bar
- circular progress
- colored score label

The score should visually map to risk level.

---

## Navigation Rules

### Sidebar
If sidebar exists, use it for major areas:
- Dashboard
- Detection History
- Analysis
- Plugin Status
- Services
- Settings

Sidebar should:
- be simple
- have clear active state
- use icons sparingly
- not be too wide

### Top Bar
Top bar may include:
- page title
- breadcrumb
- search
- refresh action
- user/system indicator

Keep it clean and light.

---

## Motion and Interaction

Use subtle motion only.

Allowed:
- hover lift
- soft fade
- slight scale on hover for cards/buttons
- loading skeletons
- gentle status pulse for active scanning or running service

Avoid:
- bounce effects
- exaggerated spring
- spinning decorative elements
- excessive animation chains

Animation must support clarity, not distract from content.

---

## Data Display Rules

### Information Hierarchy
Always show information in this order:
1. Overall result
2. Risk level
3. Key explanation
4. Evidence/details
5. Additional metadata

### Empty States
Empty states should feel clean and helpful.
Examples:
- No detections yet
- No suspicious records found
- No plugin connected

Provide clear next action.

### Loading States
Use skeletons or soft loading placeholders.
Avoid jarring loading flashes.

---

## Icons
Use simple modern outline icons.

Preferred icon meanings:
- shield
- triangle alert
- check circle
- x circle
- server
- plug
- globe
- lock
- search
- chart
- activity
- history
- settings

Do not overload every item with icons.

---

## Responsive Rules
The dashboard should work well on desktop first.
Tablet support is helpful.
Mobile can be simplified if needed, but major cards and tables should remain usable.

Priority:
- desktop presentation quality
- clean spacing
- no broken layouts

---

## Component Consistency
All pages must reuse the same style language.

Unify:
- buttons
- inputs
- badges
- cards
- tables
- section headers
- modals
- charts

Do not redesign these components independently page by page.

---

## UX Quality Standard
The final frontend should feel:
- like a polished security dashboard
- like a complete product instead of a rough prototype
- unified across all pages
- suitable for competition demo and teacher review

The final result should make users trust the system.