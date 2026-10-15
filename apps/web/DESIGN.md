---
name: Vendetta
description: The family ledger. A mafia strategy game kept as a leather-bound account book with live balances.
colors:
  leather: "#24201f"
  leather-raised: "#2f2927"
  leather-edge: "#3d3532"
  gilt: "#c9b98a"
  parchment: "#fffcdb"
  parchment-shade: "#e7e4c3"
  page-edge: "#e0ddca"
  rule-faint: "#c6c1a4"
  rule-khaki: "#a6a18b"
  ink: "#24201f"
  ink-soft: "#4a423e"
  ink-faded: "#6b625a"
  red-ink: "#af0000"
  red-ink-deep: "#6e0000"
  ledger-blue: "#084b8a"
  stamp-red: "rgba(175, 0, 0, 0.82)"
typography:
  display:
    fontFamily: "Bodoni Moda, Bodoni 72, Didot, serif"
    fontSize: "clamp(1.6rem, 6vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Bodoni Moda, Bodoni 72, Didot, serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  wordmark:
    fontFamily: "Bodoni Moda, Bodoni 72, Didot, serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  note:
    fontFamily: "Bodoni Moda, Bodoni 72, Didot, serif"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.4
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 5.5vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "tnum, lnum"
    fontVariation: "wdth 88"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum, lnum"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.08em"
  button:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.04em"
  stamp:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.66rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.14em"
    fontVariation: "wdth 112"
rounded:
  none: "0px"
  hairline: "2px"
  page: "3px"
spacing:
  row: "2.25rem"
  gap: "0.75rem"
  cell: "0.45rem 0.4rem"
  page-phone: "1rem"
  page-desk: "1.75rem 2.25rem"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.hairline}"
    padding: "0.35rem 0.85rem"
    height: "2.25rem"
  button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parchment}"
  button-primary:
    backgroundColor: "{colors.red-ink-deep}"
    textColor: "{colors.parchment}"
    typography: "{typography.button}"
    rounded: "{rounded.hairline}"
    padding: "0.35rem 0.85rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.red-ink}"
    textColor: "{colors.parchment}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ledger-blue}"
    typography: "{typography.body}"
    padding: "0.35rem 0.4rem"
    height: "2.25rem"
  field-input:
    backgroundColor: "{colors.parchment-shade}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.3rem 0.45rem"
    height: "2.25rem"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-red}"
    typography: "{typography.stamp}"
    rounded: "{rounded.page}"
    padding: "0.12rem 0.45rem 0.1rem"
  stamp-ink:
    textColor: "{colors.ink-soft}"
  stamp-blue:
    textColor: "{colors.ledger-blue}"
  thumb-tab:
    backgroundColor: "{colors.leather-raised}"
    textColor: "{colors.parchment-shade}"
    typography: "{typography.label}"
    rounded: "{rounded.page}"
    padding: "0.55rem 0.75rem"
    width: "7.5rem"
  thumb-tab-current:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.ink}"
  plat-lot:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.ink-soft}"
    size: "1.5rem"
  plat-lot-taken:
    backgroundColor: "{colors.parchment-shade}"
    textColor: "{colors.ink}"
  plat-lot-mine:
    backgroundColor: "{colors.red-ink-deep}"
    textColor: "{colors.parchment}"
---

# Design System: Vendetta

## Overview

**Creative North Star: "The Family Ledger"**

Vendetta is kept as the family's account book. A dark leather binding holds one open parchment page at a time. Every building is an account, every room, research, troop batch and mission is a dated entry, and the balance at the top of the page is always live. The interface is ruled paper, not a dashboard: structure comes from ink rules, double rules under totals and a red margin line down the page, never from panels, cards or tinted boxes.

The density is that of a working ledger: figures in tabular columns, right-aligned, one ruled line per entry (2.25rem), labels set small in spaced capitals like printed column heads. Display type is a high-contrast Bodoni, the voice of the book's headings and the clerk's italic notes. Every figure, button and label is Archivo with tabular lining numerals. Two inks do the semantic work: black for entries, red for losses, shortfalls, full stores and hostile marks. Ledger blue is kept for references, links, focus and pending states. The only state marker is the rubber stamp, slightly rotated, and the only authored motion is a confirmed entry being stamped onto the page.

Navigation is a thumb index cut into the book: tabs down the fore edge on desktop, a strip along the bottom on phones, each tab carrying a Bodoni initial. At night the pages dim to lamp-lit vellum and the inks lighten. The binding does not change.

**Key Characteristics:**
- Leather binding (#24201f) around a single parchment page with a soft page shadow; no other surfaces.
- Ruled structure: hairline khaki rules between entries, ink rules under headings, 3px double rules under totals and the balance.
- A double red margin rule down the left edge of every page.
- Bodoni Moda for headings, notes and tab initials; Archivo with tabular lining figures for everything else.
- Red ink means a problem (short, full, hostile, lost); blue ink means a reference or pending; black ink is the default.
- Rubber stamps are the state marker; a stamp-in animation is the only motion.
- Phone first: tables restack into entries under 48rem, the thumb index docks at the bottom under 60rem.

## Colors

Two inks and a khaki ruling on parchment, bound in dark leather; color carries meaning, never decoration.

### Primary
- **Red Ink** (`red-ink`): losses, shortfalls, hostile entries, the current tab's initial, the margin rule (at 55% mix), text selection, and the full-store double rule. A cost the building cannot pay is written in red.
- **Deep Red Ink** (`red-ink-deep`): the fill of the one committing action per form (primary button) and of the player's own lot on the plat; also the figure of a full store.
- **Stamp Red** (`stamp-red`): red ink at 82% for rubber stamps and the stamp toast, so stamps read as pressed, not printed.

### Secondary
- **Ledger Blue** (`ledger-blue`): references and cross-links, quiet buttons, the focus outline and input focus underline, the selected plat lot outline, dashed vacation marks, and "pending" stamps.

### Neutral
- **Leather** (`leather`): the binding, the body background, the phone thumb-index strip, and the theme color.
- **Raised Leather** (`leather-raised`): unselected thumb tabs and the language select on the spine.
- **Leather Edge** (`leather-edge`): borders drawn on leather (select border, top edge of the phone index).
- **Gilt** (`gilt`): gold tooling on the binding: the VENDETTA wordmark and the Bodoni initials on unselected tabs.
- **Parchment** (`parchment`): the page, the current tab (which becomes part of the page), empty plat lots, and text on deep red fills.
- **Parchment Shade** (`parchment-shade`): taken lots, plat hover, the base of input fills (mixed 30% into parchment), and secondary text on leather.
- **Page Edge** (`page-edge`): the 1px edge line under the page in its shadow.
- **Faint Rule** (`rule-faint`): the ruling between entries, balance cells and stacked rows.
- **Khaki Rule** (`rule-khaki`): stronger rules under column heads, the plat grid lines, the dashed dev-tools divider, scrollbars.
- **Ink / Soft Ink / Faded Ink** (`ink`, `ink-soft`, `ink-faded`): entries; secondary labels and input underlines; column heads, notes, metadata, folios and empty states.

**Night reading.** Under `prefers-color-scheme: dark` (unless `data-theme="light"`) and under `data-theme="dark"`, the page tokens are redefined: parchment #2b2522, shade #3a322d, page edge #1b1715, faint rule #4d443d, khaki rule #6b625a, ink #ece6c8, soft ink #d6cfb0, faded ink #ada58d, red ink #ff6b5e, deep red #e0473b, ledger blue #8fb8e8, stamp rgba(255, 107, 94, 0.85). Leather, raised leather, leather edge and gilt are not redefined.

### Named Rules
**The Two Inks Rule.** Black ink is the default; red ink is reserved for something wrong or hostile (short of a resource, a full store, an incoming attack, a lost battle). Never use red to decorate or to mean "important".

**The Blue Reference Rule.** Ledger blue marks what points elsewhere or is not yet settled: links, quiet actions, focus, selection, pending, vacation. It is never a fill.

**The Binding Stays Rule.** Theme changes only re-ink the page. Leather and gilt are constant in both themes.

## Typography

**Display Font:** Bodoni Moda (with Bodoni 72, Didot, serif), optical size axis 6..96
**Body Font:** Archivo (with system-ui, sans-serif), width axis 62..125
**Label/Mono Font:** Archivo; figures use `tabular-nums lining-nums` everywhere (set on `body`)

**Character:** A Didone heading voice from an old printed account book over a sturdy, slightly condensed grotesque for the figures. Bodoni italic is the clerk's handwriting in the margin: notes, folios and empty states.

### Hierarchy
- **Display** (700, clamp(1.6rem, 6vw, 2.6rem), 1.05): the account heading at the top of each page ("Edificio 25:25:100"), balanced, over a 3px double ink rule.
- **Headline** (700, 1.2rem, 1.2): section heads (Saldo, Próximos asientos, Habitaciones), underlined with a 1px ink rule, with an optional right-aligned Archivo aside (0.8rem, faded ink) such as queue counts.
- **Wordmark** (700, 1.35rem, 0.08em, uppercase, gilt): the title on the spine only.
- **Note** (italic 500, 0.95rem, 1.4, max 62ch): explanatory and empty-state lines in faded ink; folios use italic 500 1rem.
- **Figure** (600, clamp(1.35rem, 5.5vw, 2rem), 1.15, width 88%): the live balance amounts.
- **Body** (400, 1rem, 1.45): entries and table cells; entry names at 600, entry sublines at 0.78rem faded ink.
- **Label** (600, 0.7–0.72rem, 0.08em, uppercase): column heads, field labels, balance resource labels. These are printed column heads attached to data, not section kickers.
- **Button** (600, 0.82rem, 0.04em, uppercase): every bordered action.
- **Stamp** (800, 0.66rem, 0.14em, uppercase, width 112%): stamps; the stamp toast scales this to 1rem at 0.16em, width 115%.

### Named Rules
**The Tabular Figures Rule.** Every number is tabular and lining, right-aligned in its column, and never wraps. Costs get one fixed column per resource on desktop so figures align like an account book.

**The Bodoni Is For Words Rule.** Bodoni sets headings, initials, notes and folios. Figures, controls and labels are always Archivo.

## Layout

The binding is a centered grid capped at 72rem: spine on top, the page beneath, the thumb index beside or below. From 60rem the page sits left with a 7.5rem column of fore-edge tabs to its right (sticky at 1rem from the top) and gets 1.75rem / 2.25rem padding; below 60rem the page is inset 0.5rem from the leather with 1rem padding, and the thumb index is a fixed bottom strip of nine equal columns with the safe-area inset, the binding padded 3.4rem to clear it.

Vertical rhythm is the ruled line: an entry row is at least 2.25rem; section heads sit 1.25 rows above their content; the account heading leaves half a row beneath. Gaps between controls are 0.75rem. Two-column layouts (`cols two`, the map's plat plus an 18rem side column) only open at 60rem.

Ledger tables restack under 48rem: the header row hides, each row becomes a two-column grid (name left, figure right), costs drop to a full-width inline list with resource icons, time sits bottom left and actions bottom right. The balance block runs four across from 40rem and two by two below. Wide content (the plat) scrolls inside its own horizontal scroller; the page itself never scrolls sideways.

## Elevation & Depth

The system is flat paper on leather. The single shadow belongs to the page itself, lifting it off the binding; everything on the page is flat and separated by rules. Depth on the page is conveyed by ink weight (faint rule, khaki rule, ink rule, double rule), not by shadow or tint.

### Shadow Vocabulary
- **Page lift** (`box-shadow: 0 1px 0 var(--page-edge), 0 6px 18px -8px rgba(20, 14, 10, 0.55)`): the open page on the binding. Nowhere else.

### Named Rules
**The One Page Rule.** Only the page casts a shadow. Nothing on the page is raised: no cards, no floating panels, no shadowed buttons.

**The Rule Weight Rule.** Hierarchy of separation is faint rule between entries, khaki rule under column heads, 1px ink rule under section heads, 3px double ink rule under totals, the balance and the account heading.

## Shapes

Corners are nearly square. Controls take a 2px hairline radius; the page and tabs take 3px, and tabs are rounded only on their free edge (bottom on phone, right on desktop) so they read as cut from the page. Inputs have no radius and no box: a tinted fill with a single ink underline, like a blank on a form. Stamps are 2px bordered boxes with a 3px radius, rotated -3deg. The plat is a hard grid of square lots separated by 1px khaki lines inside a 2px ink frame. The page carries a double red margin rule (two 1px lines, 3px apart) 0.55rem from its left edge (1.2rem on desktop).

## Components

### Buttons
Printed, bordered and plain; they invert on hover like ink filling a box.
- **Shape:** hairline corners (2px), 1px ink border, min height 2.25rem.
- **Default:** transparent with ink text and border, uppercase button type, 0.35rem / 0.85rem padding. Hover fills with ink and turns the text parchment (0.15s, ease-out).
- **Primary:** deep red fill and border with parchment text; hover lightens to red ink. Used for the one committing action of a form (register, send attack, occupy, publish an offer).
- **Quiet:** borderless ledger-blue text in sentence case; hover underlines. For secondary references and cancels.
- **Disabled:** 45% opacity, not-allowed cursor; a disabled primary drops its fill to a faded-ink outline so it reads like every other disabled action. Busy buttons (`aria-busy`) sit at 70% with a progress cursor.

### Stamps
The only state marker.
- **Style:** 2px border in current color, 3px radius, stamp type, rotated -3deg, never wraps.
- **Variants:** red (full, sanctioned, lost), ink (waiting, accepted, active, won), blue (pending, vacation).
- **Stamp toast:** confirmations are stamped at the bottom center of the viewport (5.5rem up; above the thumb index on phones) in a 3px double stamp-red border over 92% parchment, animated in by scaling from 1.35 and -6deg to 1 and -2deg with a 2px blur clearing (0.42s ease-out). Errors use a plain 2px border, sentence case, 0.95rem. Reduced motion removes the animation.

### Inputs / Fields
- **Style:** a label in label type above a field with a parchment-shade tint (parchment mixed 30% toward shade), no border except a 1px soft-ink underline, no radius, 2.25rem min height, body type with tabular figures. Quantity cells in tables are 5.5rem wide and right-aligned.
- **Focus:** the underline becomes a 2px ledger-blue rule; the outline is suppressed in favor of it.

### Ledger tables
- **Style:** full width, collapsed borders; column heads in label type over a khaki rule; cells 0.45rem / 0.4rem over faint rules; entry names in 600 with a faded 0.78rem subline; totals between a 1px ink rule and a 3px double rule. Locked entries fold into a `details` row with a Bodoni italic summary, the reason in red ink.

### Balance block
Four resource cells (two by two on phones) between an ink rule and a double rule, divided by faint rules. Each has an icon and label, the live figure, a 0.75rem rate and capacity line, and a ruled underline that becomes a 3px double red rule, plus a red "full" stamp, when the store is full.

### Next entries
A list of ruled rows: a fixed 4.75rem time column (600, 0.85rem), the entry with a faded subline and a 2px progress rule (ink on faint rule), and an action. Hostile entries turn the time, text and progress red.

### Navigation (thumb index)
- **Desktop (from 60rem):** a sticky column of 7.5rem tabs on the fore edge, raised leather with parchment-shade label type, right corners rounded 3px, each led by a gilt Bodoni initial (1.05rem).
- **Current:** the tab turns parchment with ink text and a red-ink initial, joining the page.
- **Phone:** a fixed bottom strip of nine equal tabs on leather, initial over a 0.6rem sentence-case label, bottom corners rounded.
- **Spine:** gilt wordmark left; account id and the ES/EN select (raised leather, leather-edge border) right.

### Plat (neighborhood map)
A 17 x 15 grid of square lots (min 1.5rem) with numbered axes in faded 0.58rem type, 1px khaki gaps, 2px ink frame. Empty lots are parchment, taken lots parchment-shade with a three-letter family tag, the player's lot deep red with parchment text, vacation lots carry an inset dashed blue frame, the selected lot a 2px blue inset outline. The grid scrolls in its own container and centers the player's lot.

### Icons
Authored 24-unit stroke icons for the four resources, 1rem, 1.6 stroke, round caps and joins, current color. Labeled when they replace a word (cost column heads).

## Do's and Don'ts

### Do:
- **Do** keep every new screen on the one parchment page inside the leather binding, headed by a Bodoni account heading over a 3px double ink rule.
- **Do** separate content with rules in the established weights (faint, khaki, ink, double) at the 2.25rem ruled line.
- **Do** set all figures in Archivo with tabular lining numerals, right-aligned, one column per resource on desktop.
- **Do** write shortfalls, full stores, losses and hostile entries in red ink, and references, focus and pending in ledger blue.
- **Do** mark state with a stamp (red, ink or blue) and confirm actions with the stamp toast; honor reduced motion.
- **Do** restack ledger tables into entries under 48rem and keep wide grids in their own scroller.
- **Do** give each form at most one deep red primary action; everything else is the bordered default or quiet blue.

### Don't:
- **Don't** add cards, tinted panels, icon tiles or shadows on the page; only the page lifts off the binding.
- **Don't** use red for emphasis, branding or decoration; it always means something is wrong or hostile.
- **Don't** set figures, labels or buttons in Bodoni, or headings in Archivo.
- **Don't** introduce progress bars beyond the 2px ruled progress line, or round corners beyond 3px.
- **Don't** box inputs; a field is a tinted blank with an underline.
- **Don't** recolor the binding or the gilt for night reading; only the page re-inks.
- **Don't** use emoji or glyph characters as icons; draw them in the ledger's stroke style.

## Addendum: seal red

Solid red fields that carry parchment text (the primary action and the player's own lot on the
plat) use `--seal` `#6E0000` with `--seal-ink` `#FFFCDB` in both day and night, so that text keeps
about 10:1 contrast; hover uses `--seal-hover` `#8A0000`. This replaces the hard-coded parchment
on night deep red noted as a defect during documentation.
