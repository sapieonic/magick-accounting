# Ledger design system (indigo edition)

Visual spec: the approved mockups (Overview, Expenses + detail, New expense, Trip, phone Expenses).
Principles: **numbers first** (Geist Mono, tabular, right-aligned, never clipped) · **rules, not cards**
(1px hairlines, panels on one ruled sheet, 8px radius, no shadows) · **colour carries meaning**
(indigo = company/primary, amber = pocket/owed, muted category colours on glyph chips) · thin lucide icons.

## Tokens (Tailwind)

Colours are CSS variables in `src/app/globals.css` (light + `.dark`). Most are RGB channels and support
`/alpha` (`bg-accent/10`). Two exceptions: `tint` / `tint-2` are fixed-alpha accent tints (no `/alpha`),
and the `rail-*` shades (`rail-hover`, `rail-active`, `rail-line`, `rail-ink`, `rail-muted`, `rail-icon`,
`rail-mark`) are fixed hex: the rail is dark in both themes, so they don't change with `.dark`.

| Use | Class |
| --- | --- |
| Page / panel / sunk (table heads, tracks) | `bg-background` · `bg-surface` · `bg-sunk` |
| Text: primary / secondary / muted | `text-ink` · `text-ink-2` · `text-ink-3` |
| Rules: outer / inner row divider | `border-rule` · `border-rule-2` (panels, hairlines: decorative) |
| Form control boundary | `border-control-line` (≥ 3:1 on surface in both themes, WCAG 1.4.11; inputs, selects, chips, checkboxes) |
| Backdrop behind dialogs, the ⌘K palette and the drawer | `bg-overlay/45` (always /45; `--overlay` is near-black in light, black in dark) |
| Accent (indigo) | `bg-accent text-accent-ink` · `hover:bg-accent-hover` · `bg-accent-soft` · `border-accent-line` · `bg-accent-2` |
| Row hover / tints | `hover:bg-hover` · `bg-tint` (5%) · `bg-tint-2` (10%) |
| Pocket / owed (amber) | `text-amber` · `bg-pocket` (fill) · `bg-amber-soft` |
| Status | `text-success bg-success-soft` · `text-danger bg-danger-soft` |
| Chart bars | `bg-bar` (muted) · `bg-ramp` (indigo gradient) · `bg-hatch` (month to date) |
| Category | `text-cat-{sw,co,tr,ed,me,of,mk}` + `bg-cat-*-soft` (prefer `CategoryGlyph`) |
| Radius | `rounded-control` (6px: buttons, inputs) · `rounded-panel` (8px: panels) |
| Motion | `duration-140` for hover/press colour changes |
| Shadow | none, except `shadow-elevated` (menus, dialogs) and `shadow-fab` (mobile Add) |

Utilities: `.num` (Geist Mono, tabular, -0.02em: every amount, count, date in a table) ·
`.figure` (Geist sans, tabular, nowrap: big headline totals) · `.cap` (11px uppercase caption,
.07em, 500: labels, column heads, eyebrows) · `.ell` (single-line ellipsis) · `bg-wash` / `bg-wash-r`
(faint radial indigo from the top-left / top-right corner, behind headline totals and detail heads).
Page padding is `var(--pad)` = `clamp(16px, 2.6vw, 40px)`; the layout already applies it on a wrapper inside `<main>` (not on the scroller itself, so `sticky` offsets mean what they say).
`var(--tabbar-h)` is the height of the fixed mobile tab bar (safe area included; `0px` from `lg`): build bottom
offsets on it (the page's bottom padding, `FormFooter`, toasts) rather than repeating the number.

Focus: every `:focus-visible` gets a 2px solid accent outline, offset 2px (global rule; `focusRing` from `styles`
restates it for custom controls). Form controls (`inputClass`, `selectClass`, `textareaClass`) drop the outline
for an opaque 2px accent ring just outside the border, so focus shows on an invalid (danger) or auto-filled
control too. Never replace either with a translucent glow.

Fonts: `font-sans` = Geist, `font-mono` = Geist Mono. No serif anywhere.

## Primitives (`src/components/ui`)

```tsx
import Button, { IconButton } from "@/components/ui/Button";
<Button icon={Plus} href="/dashboard/expenses/new">New expense</Button>   // next/link when href
<Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
<Button variant="danger" loading={deleting}>Delete</Button>
<IconButton icon={Pencil} aria-label="Edit expense" href={`/dashboard/expenses/${id}/edit`} />
```
`Button` props: `variant?: "primary" | "secondary" | "ghost" | "danger"`, `size?: "sm" (40px) | "md" (44px)`,
`icon?` / `iconRight?: LucideIcon`, `loading?`, `fullWidth?`, `href?` + native button/anchor props.
`IconButton`: `icon`, required `aria-label` (also the tooltip), `variant?` (default ghost; `"ghost-danger"` for
delete icons in rows), `size?`, `loading?` (spinner in place of the icon, disabled), `href?`.

```tsx
<PageHeader title="Expenses" meta="Everyone · all time" actions={<Button …/>} />
<PageHeader title={trip.name} breadcrumb={[{ label: "Trips", href: "/dashboard/trips" }, { label: trip.name }]} />
```
`PageHeader`: `title`, `eyebrow?`, `breadcrumb?: { label; href? }[]`, `meta?`, `actions?`. Renders the page's only `<h1>`.

```tsx
<StatBand>
  <Stat headline label="Total spend" value={formatBaseCurrency(total)} sub="309 expenses · 7 departments" />
  <Stat label="Paid from pocket" icon={Wallet} tone="amber" value={formatBaseCurrency(pocket)} sub="18.8% of spend" />
</StatBand>
```
`Stat`: `label`, `value` (pre-formatted), `sub?`, `icon?`, `tone?: "default" | "amber"` (amber colours the figure
and icon; default has an indigo icon), `headline?`. Stats are top-aligned, so one without `sub` lines up with its
neighbours. Figures are nowrap and sized with container units, so they shrink instead of clipping. `BandCell` (`label`,
children) is a band cell for content that isn't one figure: a `SplitBar`, a budget meter.

```tsx
<PanelGrid min={440}>
  <Panel title="Categories" actions={<Link className={linkClass} href="…">All 13</Link>}>…</Panel>
  <Panel title="Latest entries" flush footer="Showing 1–10 of 309">{rows}</Panel>
</PanelGrid>
```
`Panel`: `title?`, `description?` (one quiet line under the title: sentences go here), `meta?` (a short note
right of the title: a count, a unit, a status), `actions?`, `footer?`, `flush?`
(no body padding, for row lists), `grow?` (relative width in a grid), `wash?`, `className?`, `bodyClassName?`, `id?`.
Standalone it has its own border. Rows inside a flush panel use `panelPadX` (from `styles`) for the same side padding.
`PanelGrid`: `min?` (px before wrapping, default 440), `className?`. One ruled sheet: shared border, 1px rule gaps.

```tsx
<Field label="Amount" icon={Banknote} hint="In the bill's currency" error={errors.amount} aside={<><Sparkles size={12}/>from receipt</>}>
  <input className={cn(inputClass, "num text-right", aiFilled && aiFilledClass)} inputMode="decimal" />
</Field>
```
`Field`: `label`, one child control, `hint?`, `error?`, `icon?`, `aside?`, `optional?`, `htmlFor?`. It injects
`id`, `aria-describedby`, `aria-invalid` into the child. With `htmlFor` (a compound child, e.g. chips + input)
it leaves the child alone; point the inner control at `${htmlFor}-hint` / `${htmlFor}-error` yourself.
Style helpers (from `Field` or `styles`): `inputClass`, `selectClass`, `textareaClass` (all `w-full`),
`compactSelectClass` (a narrow select beside another control, e.g. the currency before an amount: tighter
padding, no `w-full`, so set its width yourself), `aiFilledClass` (a tint only: the border stays `control-line`
and the Field's `aside` says where the value came from).
`MultiSelect` (`options`, `selected`, `onChange`, `placeholder`, `icon?`, `loading?`, `id?`): the trigger is named
by its `Field` label (or `ariaLabel` when there is none); `listLabel?` names the popup listbox, e.g.
"Departments" (falls back to `ariaLabel`, then `placeholder`). Its options show a `Checkbox`.
`SearchInput` (`value`, `onValueChange`, input props, `className` for the wrapper): magnifier inside, Clear button once there is text; wrap it in a `Field` or give it an `aria-label`.

```tsx
<form className={cn(panelClass, "flex flex-col")}>
  <div className="flex flex-col divide-y divide-rule-2">
    <FormSection title="Details" description="…"><FieldGrid>{fields}</FieldGrid></FormSection>
    <SectionRow><FormSection title="From">…</FormSection><FormSection title="Bill to">…</FormSection></SectionRow>
  </div>
  <FormFooter className="justify-end"><Button type="submit">Save</Button></FormFooter>
</form>
```
From `@/components/ui/FormSection`: `FormSection` (`title?`, `description?`, `actions?`, `flush?`; a ruled group
of fields, stacked with 16px gaps), `FieldGrid` (`min?` px, default 200: auto-fit columns of fields; use it for
every side-by-side field row), `SectionRow` (`min?`: sections side by side, split by a rule), `FormFooter`
(the sticky action strip at the foot of a form sheet, at `bottom: var(--tabbar-h)`, so just above the mobile
tab bar and at the edge from `lg`; while mounted it publishes its measured height, which grows when it wraps,
as `--form-footer-h` on `<html>` for fixed layers such as toasts).

`Checkbox` (`checked`, `partial?` for a "select all" dash, `className?`): the visual 16px box only
(`border-control-line`; checked = accent fill + tick), `aria-hidden`. Use it wherever a checkbox shows: inside a
row that is itself the control (a listbox option), or beside an `sr-only` native `<input type="checkbox">` in a
`<label>` row, which carries the state and focus (show focus on the row with `has-[:focus-visible]:`). Don't
style a native checkbox with `accent-*` instead.

`Badge` (static): `tone?: "neutral" | "accent" | "amber" | "success" | "danger"`, `icon?`, `dot?`.
`Chip` (44px toggle filter, `aria-pressed`): `pressed?`, `icon?` + button props; with `role="radio"` (inside a
`radiogroup`) it reports `aria-checked` instead. `RemovableChip` (`onRemove`, `removeLabel?`, children): a picked
value or active filter; the whole chip removes it. `Dot`: `tone?` (7px legend dot). All from `@/components/ui/Badge`.

`Avatar`: `name?`, `photoURL?`, `size?: 24 | 28 | 32 | 36 | 56` (default 32), `tone?: "accent" | "amber" | "rail"`,
`title?`. Decorative: print the name beside it. `initials(name)` → first + last initial, `"?"` when empty.

`DetailList`: `items: { label; icon?; value }[]`, `layout?: "justified" | "columns"`: ruled caption/value rows
for detail panels. `justified` (default) right-aligns the value; `columns` puts values in a left-aligned column
after a 7rem caption column (longer values, e.g. the profile's account details).

`CategoryGlyph`: `name?` (matched by whole-word keyword, so "Facebook ads" is marketing, not a book),
`tone?` (force), `size?: "sm" 26 | "md" 28 | "lg" 32 | "xl" 36`.
`CategoryDot` (6px). `categoryTone(name)` → `"sw" | "co" | "tr" | "ed" | "me" | "of" | "mk" | "neutral"`;
`CATEGORY_STYLES[tone]` gives `{ icon, fg, bg, fill }` class strings.

`SplitBar`: `company`, `pocket` (numbers, base currency), `format?` (default `formatBaseCurrency`),
`legend?: "detail" | "inline" | "none"`, `size?: "sm" | "md"`. Accessible as one `role="img"` with percentages;
negative or non-finite amounts count as 0 in the bar and percentages.

`RankedBar`: `label`, `amount` (formatted), `ratio` (0–1 bar fill; clamped, NaN = empty), `share?` (percent),
`leading?` (e.g. `<CategoryGlyph />` or initials), `tone?: "ramp" | "accent" | "muted" | "pocket"`. The label
truncates; the share and amount never do.

`SegmentedControl<T>`: `options: { value; label; icon? }[]`, `value`, `onChange`, required `aria-label`, `fullWidth?`,
`size?: "sm" (40px) | "md"`, `compact?` (tighter segments, icons only from `sm` up), `disabled?`.

```tsx
<ConfirmDialog isOpen={open} onClose={close} onConfirm={remove} title="Delete trip" icon={Trash2}
  confirmLabel="Delete trip" busyLabel="Deleting..." busy={deleting}>Expenses are kept.</ConfirmDialog>
<form onSubmit={save}>{fields}<DialogActions onCancel={close} confirmLabel="Create trip" busy={saving} /></form>
```
`ConfirmDialog` (from `@/components/ui/ConfirmDialog`): destructive confirmation; can't be dismissed while `busy`.
`Modal` (and the palette and the phone nav drawer) move focus in, trap Tab, close on Escape only when they are
the topmost layer, and return focus to the opener (`useDialogLayer` in `@/hooks/useDialogLayer`; reuse it for
any new overlay). Keys go only to the topmost layer; an open layer locks `#main`'s scrolling (ref-counted);
if the opener is gone on close, focus falls back to the layer below, then `#main`. A popup such as MultiSelect's
menu opens with `{ popup: true, returnFocus }`: no focus trap or scroll lock, Tab closes it and continues from
its trigger. The phone drawer closes itself once the viewport reaches `lg`. `DialogActions`: Cancel + confirm in the sticky `ModalFooter`; submits its form unless `onConfirm` is given;
`variant?`, `icon?`, `disabled?`, `busyLabel?`, children (e.g. a selection summary) go before the buttons.
Every dialog with actions ends with one of these (or `ModalFooter` from `Modal` for anything else).

Helpers in `@/components/ui/styles`: `buttonClass()`, `iconButtonClass()`, `rowClass` (hairline + hover
tint), `rowSelectedClass` (accent-soft + 3px inset bar), `linkClass` (accent text; dims when `disabled`),
`textButtonClass` (a link-styled `<button>`, or a link that acts like one: 40px tall, 13px, icon gap; a ghost
`Button`'s ink text can't be recoloured), `inlineLinkClass` (a small standalone link with a 24px minimum target,
WCAG 2.5.8; links inside a sentence can stay `linkClass`), `panelClass`, `panelPadX` (and `panelPadL`,
its left side only, for rows with trailing icon buttons), `transition`,
`focusRing`, `ICON_STROKE` (1.75). `cn()` lives in `@/components/ui/cn` (plain clsx: no tailwind-merge, so a
`className` can't override a class the primitive already sets; add a prop or variant instead).
`useMediaQuery(query)` lives in `@/hooks/useMediaQuery`.

Also in `ui`: `Modal` (bottom sheet below `sm`; `maxWidth?`), `EmptyState`, `Skeleton` (+ page skeletons),
`Spinner` (`decorative` when visible text says what is loading; `tone?: "accent" | "current"`, `current` inside
buttons) / `InlineLoader` (one status, named by its label),
`Toast` (`toast(message, type?, { action?, durationMs? })` from `useToast`; at the bottom: full width with 16px
gutters on phones, bottom-right and at most 24rem wide from `sm`; it sits 12px above the mobile tab bar and any
mounted `FormFooter` (`--tabbar-h` + `--form-footer-h`), and from `lg` at least 112px up so it clears a list's
"Load more" strip; on phones, pages without a `FormFooter` end with extra room for the same reason: it never
covers Save, a total, Load more or page-header actions). `#main` has scroll padding for the tab bar and a
mounted `FormFooter`, so a focused field never scrolls under them,
`MultiSelect`, `CommandPalette`,
`ThemeToggle`, `ReceiptDropzone` (dashed indigo zone on a tint).

## Shell

`dashboard/layout.tsx` renders the rail (`Sidebar`, 232px, collapsible to 72px), the top bar (`Header`:
section context, ⌘K search, theme, New expense) and on phones the `MobileTabBar` (Overview, Expenses,
Add, Trips, More → drawer; More is highlighted on pages only the drawer links to). Nav items live in
`src/components/layout/nav.ts` (shared with ⌘K). Pages
render straight into `<main>`; **do not** add a max-width wrapper or page padding of your own, and start
each page with `PageHeader`. Section gap: `flex flex-col gap-6` (24px) on the page root, plus
`animate-fade-in` (every page root fades in the same way; reduced motion turns it off).

## Layout rules

- Fluid, never a centered column: wrap with `flex flex-wrap` + `basis-[…] grow` or
  `grid-cols-[repeat(auto-fit,minmax(min(Npx,100%),1fr))]`. Test 390px, 1024px, 1440px, 2000px.
- Breakpoints: shell switches at `lg` (1024px). Inside panels prefer container queries over viewport
  breakpoints: `[container-type:inline-size]` on the wrapper, then `[@container(min-width:620px)]:grid-cols-…`
  on its children (no space or `_` after `@container`, so every query reads the same).
- Ledger tables: a 4-column grid row (date · expense · category/department · amount) that collapses to
  2 columns (title block · amount) when the panel is under ~620px; the date and category move into the
  sub-line. Row height ≥ 56px, hairline `border-rule-2` between rows, `rowClass` for hover.
  Rows pad with `ledgerPad()` (`panelPadX`; nested in a trip band, that plus 22px). Row hover actions sit over the
  amount cell, which hides while they show, so they never cover the title or category.
- Touch targets ≥ 44px (40px minimum for dense secondary controls).
- Copy is sentence case everywhere: buttons, dialog titles, labels ("Add department", "Update rate").

## Amounts

Always `formatCurrency(amount, code)` / `formatBaseCurrency(amount)` from `@/lib/currency`, inside `.num`
(or `Stat`/`RankedBar`/`SplitBar`, which do it). Right-align amount columns, `whitespace-nowrap`, never
truncate a number (truncate the label instead). Foreign amounts: original first, INR equivalent below in
`text-xs text-ink-3`. Pocket money is `text-amber`; company is ink or indigo.

## Icons

lucide-react only, `strokeWidth` 1.5–1.75 (`ICON_STROKE`), 16–20px (13–15px inside captions/chips),
`aria-hidden="true"` when next to text, `IconButton` with `aria-label` when alone. One icon per meaning:
use the nav icons from `nav.ts` for sections and `CategoryGlyph` for categories.

## Do / don't

- Do: rules between sections, `bg-wash` once per view behind the headline, `aria-current` / `aria-pressed`
  for state, `Panel` titles as `h2`, empty states via `EmptyState`.
- Don't: gradient banners, coloured icon tiles on every card, shadows on panels, `rounded-xl/2xl`,
  serif or extra font families, `max-w-6xl mx-auto` wrappers, raw hex colours, tailwind palette colours
  (`emerald-500`, `blue-400`…) for meaning, per-page re-implementations of buttons/inputs.

## Page shells

`not-found` and `global-error` share `StatusPage` (`@/components/layout/StatusPage`). The theme boot script and
storage key live in `@/lib/theme` (a plain module, so a server layout gets the string); `global-error` renders the
script in its own `<head>` because it replaces the root layout. Month-key helpers (`monthFromKey`, `monthProgress`)
are in `@/lib/month`.
