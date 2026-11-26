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
`var(--toast-room)` (88px) is the extra space a page without a `FormFooter` keeps at its end so a toast never covers
its last control; `var(--panel-pad-x)` is a panel's side padding (behind `panelPadX`, `panelPadL`, `ledgerPad`).

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
and icon; default has an indigo icon), `headline?`, `action?` (a `textButtonClass` link or button under `sub` that acts
on the figure, e.g. "Review" on "Awaiting approval"). Stats are top-aligned, so one without `sub` lines up with its
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
`MultiSelect` (`options`, `selected`, `onChange`, `placeholder`, `icon?`, `loading?`, `id?`): a select-only
combobox. Focus stays on the trigger (`role="combobox"`, `aria-activedescendant`), so it must be named by its
`Field` label (or `ariaLabel` when there is none), not its text; `listLabel?` names the popup listbox, e.g.
"Departments" (falls back to `ariaLabel`, then `placeholder`). Arrow keys/Home/End move, Enter/Space toggle,
Escape closes, Tab leaves (the menu closes on blur); "Clear selection" sits above the first option. Its options
show a `Checkbox`.
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
as `--form-footer-h` on `<html>` for fixed layers such as toasts; `role?` + `aria-label?` name a strip that
isn't a form's, as `BulkBar` does).

`Checkbox` (`checked`, `partial?` for a "select all" dash, `className?`): the visual 16px box only
(`border-control-line`; checked = accent fill + tick), `aria-hidden`. Use it wherever a checkbox shows: inside a
row that is itself the control (a listbox option), or beside an `sr-only` native `<input type="checkbox">` in a
`<label>` row, which carries the state and focus (show focus on the row with `has-[:focus-visible]:`). Don't
style a native checkbox with `accent-*` instead.

`Badge` (static): `tone?: "neutral" | "accent" | "amber" | "success" | "danger"`, `icon?`, `dot?`.
`Chip` (44px toggle filter, `aria-pressed`): `pressed?`, `icon?` + button props; with `role="radio"` (inside a
`radiogroup`) it reports `aria-checked` instead. `RemovableChip` (`onRemove`, `removeLabel?`, children): a picked
value or active filter; the whole chip removes it. `Dot`: `tone?` (7px legend dot). All from `@/components/ui/Badge`.

`Notice` (`@/components/ui/Notice`): `tone?: "neutral" | "danger" | "success"`, `icon?`, `title` (one line: what
the state is), `children?` (why, and what to do next), `actions?`, `className?`. A ruled `rounded-panel border` box on
`bg-sunk` / `bg-danger-soft` / `bg-success-soft`, no shadow, always icon + words. It is a `role="group"` named by its
title, **not** a live region: it describes the state a page or detail opened in, holds buttons, and is re-mounted as a
reviewer moves between expenses (J/K), so announcing it would only repeat what is on screen. Announce something that
just happened with a toast. The root carries `data-notice` and `data-tone` (tests find notices by `[data-notice]` or
`getByRole("group", { name: title })`).

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
any new overlay). Keys go only to the topmost layer; a control that handles Escape itself calls
`preventDefault()` and the layer then ignores it. While anything `aria-modal="true"` is mounted, `globals.css`
locks `#main`'s scrolling (`#main` always reserves its scrollbar gutter, so nothing shifts). If the opener is
gone or hidden on close, focus falls back to the layer below, then `#main`. The phone drawer closes itself once the viewport reaches `lg`. `DialogActions`: Cancel + confirm in the sticky `ModalFooter`; submits its form unless `onConfirm` is given;
`variant?`, `icon?`, `disabled?`, `busyLabel?`, children (e.g. a selection summary) go before the buttons.
Every dialog with actions ends with one of these (or `ModalFooter` from `Modal` for anything else).

Helpers in `@/components/ui/styles`: `buttonClass()`, `iconButtonClass()`, `rowClass` (hairline + hover
tint), `rowSelectedClass` (accent-soft + 3px inset bar), `linkClass` (accent text; dims when `disabled`),
`textButtonClass` (a link-styled `<button>`, or a link that acts like one: 40px tall, 13px, icon gap; a ghost
`Button`'s ink text can't be recoloured), `inlineLinkClass` (a small standalone link with a 24px minimum target,
WCAG 2.5.8; links inside a sentence can stay `linkClass`), `target24` (that 24px target alone, for links with
their own colour), `panelClass`, `panelPadX` (and `panelPadL`, its left side only, for rows with trailing icon
buttons), `ledgerPad(nested?)` (ledger row padding), `transition`,
`focusRing`, `peerFocusRing` (the same ring on a visual box after an sr-only `peer` input), `ICON_STROKE` (1.75). `cn()` lives in `@/components/ui/cn` (plain clsx: no tailwind-merge, so a
`className` can't override a class the primitive already sets; add a prop or variant instead).
`useMediaQuery(query)` lives in `@/hooks/useMediaQuery`.

Also in `ui`: `Modal` (bottom sheet below `sm`; `maxWidth?`), `EmptyState` (`headingRef?` makes its heading
focusable, to move focus there when a list empties), `Skeleton` (+ page skeletons),
`Spinner` (`decorative` when visible text says what is loading; `tone?: "accent" | "current"`, `current` inside
buttons) / `InlineLoader` (one status, named by its label),
`Toast` (`toast(message, type?, { action?, durationMs? })` from `useToast` returns the toast's id, and `dismiss(id)`
closes it early, e.g. an Undo that no longer applies; at the bottom: full width with 16px
gutters on phones, bottom-right and at most 24rem wide from `sm`; it sits 12px above the mobile tab bar and any
mounted `FormFooter` (`--tabbar-h` + `--form-footer-h`), at every width; pages without a `FormFooter` end with
`--toast-room` to spare, so it never covers Save, a total, "Load more" or page-header actions). `#main` has scroll padding for the tab bar and a
mounted `FormFooter`, so a focused field never scrolls under them,
`MultiSelect`, `CommandPalette`,
`ThemeToggle`, `ReceiptDropzone` (dashed indigo zone on a tint).

## Shell

`dashboard/layout.tsx` renders the rail (`Sidebar`, 232px, collapsible to 72px), the top bar (`Header`:
section context, ⌘K search, theme, New expense) and on phones the `MobileTabBar` (Overview, Expenses,
Add, Trips, More → drawer; More is highlighted on pages only the drawer links to). Nav items live in
`src/components/layout/nav.ts` (shared with ⌘K). For admins the Approvals link carries the awaiting-approval count
(`ApprovalCountContext`, provided by the layout; read on mount, route change and window focus, never polled): a
`bg-rail-mark` pill on the wide rail ("99+" past 99), a dot on the icon-only rail (count in the tooltip), and a dot on
the phone's More. The number is always in the accessible name, worded by `approvalCountLabel` ("Approvals, 4 awaiting
approval", "More, 4 awaiting approval"); the pill and dots are `aria-hidden`. Link to the queue with `APPROVALS_HREF`
from `nav.ts`. Pages
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
  Rows pad with `ledgerPad()` (`panelPadX`; nested in a trip band, that plus 22px). Row hover actions share the
  amount's grid cell (`[grid-area:1/1]`), so the cell is as wide as the wider of the two and the amount hides while
  they show: they never cover the title or category.
- Touch targets ≥ 44px (40px minimum for dense secondary controls).
- Copy is sentence case everywhere: buttons, dialog titles, labels ("Add department", "Update rate").

## Expense approvals

Vocabulary (labels from `APPROVAL_LABEL` in `@/lib/approval`; never colour alone, always icon + words):

| State | Badge | Where |
| --- | --- | --- |
| Awaiting approval | neutral + `Clock3` (not amber: amber means pocket/owed) | rows, detail |
| Rejected | danger + `CircleX` | rows, detail |
| Approved | success + `CircleCheck` | detail only; rows carry a badge only when *not* approved |

`ApprovalBadge` (`@/components/expenses/ApprovalBadge`: `status?`, `showApproved?` default false, `className?`) renders
these; a missing status is legacy, so approved. Explainers say what happens next in plain words: pending (submitter)
"An admin will review this. It isn't included in company totals until it's approved."; pending (admin) "Submitted by
{name} {6 days ago}. Not in totals yet."; pending (an admin's own) "Another admin needs to review this — you can't
approve your own expense." with no buttons; pending after a reopen adds "{Admin} moved it back to review: “{note}”";
rejected "{Reviewer} rejected this on {date}." + the reason as a quote + "What next: …". Approved shows in the detail's
`DetailList` as an "Approval" row: the Approved badge (`showApproved`) then "by {name} on {date}", "automatically, added
by an admin", or nothing (legacy). Approval dates are always "12 Nov 2026" (`approvalDate`).
Totals count approved spend only, so anything else is shown as not counted: a pending row's amount is `text-ink-3`, a
rejected one also `line-through`, each with sr-only `NOT_IN_TOTALS_SR[status]` from `@/lib/approval` ("(awaiting
approval, not in totals)" / "(rejected, not in totals)").

Who may review: admins (`canReviewExpense(viewer, expense)`), never their own expense. Their own pending expense shows
the notice above instead of Approve / Reject…; in the queue it has no checkbox (`RowSelection.unavailable`), says
"yours — another admin reviews it" in the sub-line, gets no phone strip, and A / R / X on it explain why in a toast.

`ExpenseRow` (`@/components/expenses/ledger/ExpenseRow`): the approval badge sits first in the sub-line. `variant="review"`
(the review queue) adds "submitted {relative}" to the sub-line, drops the badge (every row there is pending), and with
`selection?: { checked, onToggle, label, keyShortcut?, unavailable? }` a leading checkbox column: an sr-only native
checkbox named "Select {title}, {amount}" in a 44px `<label>` with the `Checkbox` visual, `relative z-10` above the row's
title-button layer, so ticking never opens the row (`unavailable` leaves the cell empty, so the columns still line up).
`LedgerHead`'s `select?` slot takes a `SelectAllCheckbox` (`selected`, `total`, `onToggle`; partial = indeterminate) and
then stays visible at every width. Rows carry `data-expense-row={id}` and their title button `data-row-title`, for moving
focus to a row.

`ExpenseDetail` takes `review?: ExpenseReviewActions` (`onApprove?`, `onReject?`, `onReopen?`, `onResubmit?`,
`viewerId?`, `viewerRole?`, `inFlight?`, `shortcuts?`; build it with `useApprovalActions().handlers` and pass it through
rows and clusters as is). Its approval block comes first: a `Notice` while pending (admins get Approve + Reject…, and the
submitter's latest resubmission note) or rejected (its submitter gets "Edit & resubmit" + "Resubmit as is…"), else the
"Approval" row in the `DetailList`. With two or more entries the approval history folds under "Approval history (n)":
"{Action} · {name} · {date}" per entry, a person's note as a quote, and the server's edit marker (`isSystemNote`) as a
plain event ("Asha edited it after it was approved."), never as somebody's words.

**Move back to review.** An admin who isn't the submitter gets a secondary "Move back to review…" (`RotateCcw`) in the
detail's action row on an approved (or legacy) or rejected expense with no linked assets and no review of it under way.
It opens `ReopenDialog` (optional note for the history; "It will stop counting in totals until it's approved again." /
for a rejection, that it is withdrawn and needn't be resubmitted). Confirmed there, so it is sent at once (no undo
window); the page gets the server's pending expense through `onUpdated`. Refusals come back in words: already awaiting
approval, assets registered against it, changed meanwhile (re-read), or the admin's own.

**Delete.** Who may delete is `canDeleteExpense(viewer, expense)` from `@/lib/approval`: approved spend (legacy
included) is in the books, so only the master admin deletes it; a pending or rejected expense can be deleted by its
submitter and by any admin. Pages pass `onDelete` wherever deleting fits, and `ExpenseRow` / `ExpenseDetail` decide per
expense with `deleteOffer` (`@/components/expenses/review-status`; the viewer comes from `review.viewerId` /
`viewerRole`): the danger Delete button and the row's hover icon only where it is allowed. Where it isn't, never a
disabled button: the detail's action row ends with a full-width muted line (`text-xs text-ink-3`, `Lock` icon) reading
`APPROVED_DELETE_MESSAGE`, "Approved expenses are part of the books, so only the master admin can delete them." (the
hover actions just leave the icon out; the detail explains). While an approve/reject is in its undo window neither
shows: the row then carries the status it is heading for, so deletability is only decided on the stored row (the
pages' delete handlers check it again on the loaded version). A delete has an undo window (`usePendingDeletes`); one
the server refuses puts the row and the totals back, toasts the server's reason (`deleteRefusal`: approved meanwhile,
assets registered, changed, gone) or "Failed to delete expense", and after a reason re-reads the expense
(`useApprovalActions().refresh` on Expenses; the trip page reloads the trip), so the row shows what the server has.

**Edit page** (`/dashboard/expenses/[id]/edit`, `EditApprovalNotice` and `LinkedAssetsLockNotice` in
`@/components/expenses/form/ApprovalFormParts`). Above the form: rejected (by whom, the reason quoted, what next),
awaiting approval, or, for a submitter's approved expense, "This expense is approved" / "Saving changes sends it back
for approval (moving it to a trip doesn't)." Every field but the trip and travel type is reviewed, title and
description included (`accountingFieldsChanged`, compared trimmed like the server): while one differs from the saved
version the submit button reads "Save & resubmit" and the footer note says it goes back to an admin. When assets are
registered against the expense, a user's reviewed fields (title and description too) and receipt are disabled and a
`Package` notice replaces the approved one: "Assets are registered against this expense" / "So only an admin can change
its details. You can still move it to a trip."

`@/components/approvals`: `RejectDialog` (`isOpen`, `expenses`, `onClose`, `onConfirm(reason)`: a required reason of
3–500 characters with a counter, and quick-reason `Chip`s that toggle their phrase in the text), `ResubmitDialog`
(optional note for the reviewer), `ReopenDialog` (above), `ApproveDialog` (confirms a bulk approve with its total; a
single approve has no dialog, it has Undo), `BulkBar` (`summary`, actions, `label?` default "Selection": the sticky
selection strip, a `FormFooter` with `role="region"`, above the tab bar), `ShortcutsDialog`, and `approval-format`
(`personName(ref, fallback?)`, `expensePersonName(ref, expense)`, `approvalDate`, relative times, `historyLine`, the
latest resubmission). Use these rather than formatting names or dates again.

`useApprovalActions` (`@/hooks/useApprovalActions`) approves and rejects like a delete: the page hides or re-labels the
expenses in `inFlight` at once, a toast offers Undo, and the request goes after `UNDO_WINDOW_MS` (or on `flush` /
unmount; built on the generic `usePendingCommits`, which `usePendingDeletes` also wraps). When the request goes out its
Undo toast closes (`onSent`); an Undo that still lands says "Too late to undo — it's already approved. You can move it
back to review from its details." Conflicts come back in words ("This expense changed after you opened it — review the
latest version.", "Already approved by another admin.", "Approved 9 of 10. 1 changed and needs another look."; a
request that never got through: "… 3 couldn't be sent. Check your connection and try again."), the expense is re-read
and handed to `onUpdated`, and the nav count refreshes. Members: `inFlight`, `approve`, `openReject`, `openResubmit`,
`resubmit` (no dialog; the edit page posts its unchanged resubmit to the approval route itself), `flush`, `refresh`
(re-reads one expense into `onUpdated` / `onRemoved`, e.g. after a refused delete), `handlers`, `dialogs` (render once on the page). Options:
`onUpdated`, `onRemoved`, `onScheduled`, `onReturned` (a single review that didn't go through, the expense pending
again), `onMovedToReview` (after "Move back to review" or "Resubmit as is" succeeds, for moving focus once its button is
gone), `shortcuts`. The review queue hides expenses in `inFlight`; Expenses and the trip page show them with the status
they're heading for and move the totals with them (Undo just drops them from `inFlight`), and on `onUpdated` replace the
row and move the band for the status change, including approved/rejected → pending after a reopen (the trip page then
reloads its summary, so "Who paid" is the server's figure). An expense that no longer matches the Status filter leaves
the list.

Review queue (`/dashboard/approvals`): the Expenses layout (flat ledger + resizable detail panel with the receipt
large). Approving moves the selection to the next expense and focus to its title (to the empty state's heading when
none are left; while the next page loads, to its first row once it arrives). If that review then doesn't go through and
the reviewer is still on the expense the queue moved them to, the expense opens again (focus follows only if it was in
the list); otherwise they're left where they are. The header's count and total are the server's figures with the
loaded rows counted as they are now, so re-reads and removals keep them right. A page emptied by reviews fetches the
next one by itself once per cursor; if that fails it shows "Couldn't load the next expenses" with Retry (no retry loop).
Keyboard, ignored while typing or with a dialog open: ↓/↑ (only from the list or with nothing focused, and only when
there are rows; elsewhere they scroll as usual) and Esc always; the single-key shortcuts J/K, X, A, R and ? can be
switched off under "Keyboard shortcuts" (WCAG 2.1.4; remembered per browser in localStorage, and then nothing advertises
them in `aria-keyshortcuts`). The shortcuts button is a ghost `Button` from `lg`, an `IconButton` below. Below `lg`,
"Select" shows the checkboxes; without the side panel (below 1280px) a sticky strip carries Approve / Reject… for the
open expense.

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

`not-found` and `global-error` share `StatusPage` (`@/components/layout/StatusPage`: `eyebrow`, `tone`, `title`, `top?`, children). The theme boot script and
storage key live in `@/lib/theme` (a plain module, so a server layout gets the string); `global-error` renders the
script in its own `<head>` because it replaces the root layout. Month-key helpers (`monthFromKey`, `monthProgress`)
are in `@/lib/month`.
