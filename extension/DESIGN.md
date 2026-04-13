# DESIGN.md

## Product Context
This extension is the browser-side interface of a phishing website detection and active defense system.

It includes:
- popup page
- options/settings page
- warning/intercept page

Its role is different from the web dashboard:
- faster interaction
- compact information display
- immediate risk communication
- strong clarity under small screen constraints

The extension UI must feel:
- trustworthy
- sharp
- modern
- security-focused
- lightweight but serious

Avoid:
- cluttered popup layout
- too many controls at once
- noisy colors
- playful visual language
- dense unreadable text
- weak danger communication

---

## Design Goal
The extension should look like a real browser security product.

It should feel similar to:
- browser security assistant
- intelligent anti-phishing extension
- safe browsing protection tool

The UI must be:
- compact
- clear
- fast to understand
- consistent across popup, options, and warning pages

---

## Visual Style

### Overall Style
Use a clean modern security-tool style.

For popup:
- compact
- highly readable
- focused on current page status

For options:
- slightly more spacious
- card-based settings organization

For warning page:
- strong danger hierarchy
- emotionally controlled
- serious but not chaotic

---

## Color System

### Core Colors
Primary:
- #2563EB

Primary Hover:
- #1D4ED8

Background:
- #F8FAFC

Surface:
- #FFFFFF

Border:
- #E2E8F0

Text Primary:
- #0F172A

Text Secondary:
- #475569

Text Muted:
- #64748B

### Status Colors
Safe:
- #16A34A

Warning:
- #F59E0B

Danger:
- #DC2626

Danger Dark:
- #991B1B

### Usage Rules
- Use blue for actions and trusted product identity
- Use green for safe results and healthy connections
- Use orange for suspicious sites
- Use red only for malicious sites or severe warnings
- Keep most backgrounds neutral and clean

Do not make the popup fully red unless the page is actually malicious.
Do not turn the entire extension into a warning color palette by default.

---

## Typography

### Font Style
Use modern sans-serif fonts.
The font should be highly readable at small sizes.

### Hierarchy
- Main result label: strong and prominent
- Risk score: visually important
- URL/domain text: compact and readable
- Secondary explanation: muted and short
- Button labels: short and direct

### Tone
Text must be:
- concise
- direct
- product-like
- easy to understand

Avoid:
- long paragraphs
- overly academic language
- vague warning text
- too much explanatory prose in the popup

---

## Layout Rules

### Popup Layout
The popup is small and should prioritize:
1. current website status
2. risk score
3. short explanation
4. primary action
5. quick access to more detail

Popup should not feel crowded.
Every section must have a clear purpose.

### Options Layout
Use grouped settings cards.
Separate settings by topic.

Suggested groups:
- backend connection
- scanning behavior
- warning behavior
- whitelist / blacklist
- advanced settings

### Warning Page Layout
This page must immediately communicate danger.
Visual priority:
1. danger icon and title
2. risk explanation
3. risk score / detected reasons
4. leave site button
5. continue anyway button

The page should feel serious, not dramatic.

---

## Shape and Spacing

### Radius
Use soft modern radius:
- cards: rounded-2xl
- buttons: rounded-xl
- inputs: rounded-xl
- warning panel: rounded-2xl

### Spacing
- popup: compact but breathable
- options: moderate spacing
- warning page: strong section spacing for clarity

### Shadows
Use soft shadow only.
Prefer modern light elevation.

---

## Core Components

### Status Badge
Use a reusable status badge.

Supported statuses:
- Safe
- Suspicious
- Malicious
- Unknown
- Connected
- Disconnected
- Enabled
- Disabled
- Running
- Error

Style:
- Safe: green tinted background + green text
- Suspicious: amber/orange tinted background + orange text
- Malicious: red tinted background + red text
- Unknown: gray tinted background + muted text
- Connected/Enabled/Running: green or blue depending on meaning
- Error/Disconnected: red or slate depending on severity

### Buttons

#### Primary Button
Used for:
- Scan Now
- Save Settings
- View Full Report
- Leave Site

Style:
- filled primary color
- strong contrast
- visually clear
- medium-bold text

#### Secondary Button
Used for:
- Cancel
- Back
- Open Dashboard
- Restore Defaults
- Continue Anyway on warning page

Style:
- light background
- clear border
- calmer appearance

#### Danger Priority Rule
On the warning/intercept page:
- the "Leave Site" action must be visually strongest
- "Continue Anyway" must exist, but be visually weaker

### Inputs
Inputs should:
- be clean and compact
- have visible border
- have clear focus state
- feel modern and not bulky

### Cards
Cards are used in popup and options page.
They should:
- have white or light surface background
- subtle border
- soft shadow
- clear internal spacing
- concise titles

### Alert Panel
Used for:
- connection problems
- model unavailable
- suspicious results
- malicious result summary

Should be noticeable without breaking layout balance.

---

## Page-Specific Rules

### 1. Popup Page
This is the most important extension UI.

It should contain:
- current site status
- domain or URL display
- risk score
- short analysis summary
- scan button
- view report button
- backend/model connection status

The popup should answer these questions immediately:
- Is this site safe?
- How risky is it?
- What should I do next?

Style requirements:
- compact
- obvious hierarchy
- one main action at a time
- visually polished
- no wasted space

#### Popup State Rules

##### Safe State
Show:
- green badge or icon
- calm wording
- optional short reassurance text

Do not over-celebrate.
It should feel quietly trustworthy.

##### Suspicious State
Show:
- orange warning state
- short reason summary
- clear recommendation to verify carefully

Should feel cautionary.

##### Malicious State
Show:
- strong red emphasis
- clear danger title
- short risk reason
- obvious next action

Must feel serious and immediate.

### 2. Options / Settings Page
This page should include:
- backend server address
- model service status
- auto scan toggle
- warning page toggle
- whitelist input/list
- blacklist input/list
- save settings action
- restore default settings action

Style:
- structured form layout
- grouped by topic
- simple and reliable

Do not make settings feel overly technical unless necessary.

### 3. Warning / Intercept Page
This page appears when the site is malicious or high risk.

It must include:
- large danger icon
- bold warning title
- short and clear risk explanation
- risk score
- detected reasons / evidence summary
- Leave Site primary action
- Continue Anyway secondary action
- optional View Detailed Report entry

Rules:
- danger information must dominate the page
- "Leave Site" must be safest and strongest
- "Continue Anyway" must be weaker, smaller, or outlined
- the content must be emotionally controlled
- do not overuse huge blocks of red
- focus on clarity and trust

---

## Risk Communication Rules

### Classification Language
Use clear labels:
- Safe
- Suspicious
- Malicious
- Unknown

Avoid vague labels like:
- maybe unsafe
- strange
- odd
- questionable state

### Explanation Style
Popup and warning explanations should be short and scannable.

Good patterns:
- Suspicious login page detected
- Domain characteristics indicate phishing risk
- Page structure resembles common phishing patterns
- Certificate or domain signals require caution

Avoid long technical paragraphs in the popup.

### Risk Score
The score should be visible and easy to understand.
It may be displayed as:
- numeric score
- color-coded progress bar
- circular score component

The score must align visually with the current status.

---

## Motion Rules
Use subtle animation only.

Allowed:
- fade in
- soft hover transition
- slight lift on buttons/cards
- gentle pulse during active scan

Avoid:
- bouncing
- rotating effects
- excessive animation
- distracting transitions

The extension should feel fast and stable.

---

## Icons
Use simple outline icons.

Recommended icons:
- shield
- warning triangle
- check circle
- x circle
- globe
- plug
- settings
- search
- lock
- activity

Do not use too many icons in a small popup.

---

## Responsive and Size Constraints

### Popup Constraints
Respect browser popup constraints.
The popup should remain usable in a small window.
Avoid long scroll-heavy designs unless necessary.

### Options Page
Can be wider and more spacious than popup.
Still keep the layout clean and structured.

### Warning Page
Can use a centered layout with strong visual hierarchy.
Must remain readable without visual overload.

---

## Reusability Rules
Create and reuse shared components for:
- status badge
- risk score card
- action button
- section card
- setting item
- alert panel

Do not style the popup, options page, and warning page as unrelated products.
They must clearly belong to the same extension.

---

## UX Quality Standard
The final extension UI should feel:
- like a real browser security product
- concise and trustworthy
- visually consistent
- ready for demo and judging
- far more polished than a basic student prototype

Users should understand the status and action path immediately.