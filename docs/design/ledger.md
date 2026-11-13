# Ledger design system (indigo edition)

Visual spec: the approved mockups (Overview, Expenses + detail, New expense, Trip, phone Expenses).
Principles: **numbers first** (Geist Mono, tabular, right-aligned, never clipped) · **rules, not cards**
(1px hairlines, panels on one ruled sheet, 8px radius, no shadows) · **colour carries meaning**
(indigo = company/primary, amber = pocket/owed, muted category colours on glyph chips) · thin lucide icons.

## Tokens (Tailwind)

All colours are CSS variables in `src/app/globals.css` (light + `.dark`) and support `/alpha`.

| Use | Class |
| --- | --- |
| Page / panel / sunk (table heads, tracks) | `bg-background` · `bg-surface` · `bg-sunk` |
| Text: primary / secondary / muted | `text-ink` · `text-ink-2` · `text-ink-3` |
| Rules: outer / inner row divider | `border-rule` · `border-rule-2` |
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
Page padding is `var(--pad)` = `clamp(16px, 2.6vw, 40px)`; the layout already applies it to `<main>`.

Fonts: `font-sans` = Geist, `font-mono` = Geist Mono. `font-heading` / `font-display` are aliases of Geist
(legacy; don't add new uses). No serif anywhere.

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
`IconButton`: `icon`, required `aria-label` (also the tooltip), `variant?` (default ghost), `size?`, `href?`.

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
`Stat`: `label`, `value` (pre-formatted), `sub?`, `icon?`, `tone?: "default" | "accent" | "amber"`, `headline?`.
Figures are nowrap and sized with container units, so they shrink instead of clipping.

```tsx
<PanelGrid min={440}>
  <Panel title="Categories" actions={<Link className={linkClass} href="…">All 13</Link>}>…</Panel>
  <Panel title="Latest entries" flush footer="Showing 1–10 of 309">{rows}</Panel>
</PanelGrid>
```
`Panel`: `title?`, `meta?`, `actions?`, `footer?`, `flush?` (no body padding, for row lists), `grow?`
(relative width in a grid), `wash?`, `className?`, `bodyClassName?`, `id?`. Standalone it has its own border.
`PanelGrid`: `min?` (px before wrapping, default 440), `className?`. One ruled sheet: shared border, 1px rule gaps.

```tsx
<Field label="Amount" icon={Banknote} hint="In the bill's currency" error={errors.amount} aside={<><Sparkles size={12}/>from receipt</>}>
  <input className={cn(inputClass, "num text-right", aiFilled && aiFilledClass)} inputMode="decimal" />
</Field>
```
`Field`: `label`, one child control, `hint?`, `error?`, `icon?`, `aside?`, `optional?`, `htmlFor?`. It injects
`id`, `aria-describedby`, `aria-invalid` into the child. Style helpers (from `Field` or `styles`):
`inputClass`, `selectClass`, `textareaClass`, `aiFilledClass`. `MultiSelect` also accepts `id`.

`Badge` (static): `tone?: "neutral" | "accent" | "amber" | "success" | "danger"`, `icon?`, `dot?`.
`Chip` (44px toggle filter, `aria-pressed`): `pressed?`, `icon?` + button props. `Dot`: `tone?` (7px legend dot).
All three from `@/components/ui/Badge`.

`CategoryGlyph`: `name?` (matched by keyword), `tone?` (force), `size?: "sm" 26 | "md" 28 | "lg" 32 | "xl" 36`.
`CategoryDot` (6px). `categoryTone(name)` → `"sw" | "co" | "tr" | "ed" | "me" | "of" | "mk" | "neutral"`;
`CATEGORY_STYLES[tone]` gives `{ icon, fg, bg, fill }` class strings.

`SplitBar`: `company`, `pocket` (numbers, base currency), `format?` (default `formatBaseCurrency`),
`legend?: "detail" | "inline" | "none"`, `size?: "sm" | "md"`. Accessible as one `role="img"` with percentages.

`RankedBar`: `label`, `amount` (formatted), `ratio` (0–1 bar fill), `share?` (percent), `leading?`
(e.g. `<CategoryGlyph />` or initials), `tone?: "ramp" | "accent" | "muted" | "pocket"`.

`SegmentedControl<T>`: `options: { value; label; icon? }[]`, `value`, `onChange`, required `aria-label`, `fullWidth?`.

Helpers in `@/components/ui/styles`: `buttonClass()`, `iconButtonClass()`, `rowClass` (hairline + hover
tint), `rowSelectedClass` (accent-soft + 3px inset bar), `linkClass`, `panelClass`, `transition`, `focusRing`,
`ICON_STROKE` (1.75). `cn()` lives in `@/components/ui/cn`.

Restyled, same APIs: `Modal` (bottom sheet below `sm`), `EmptyState`, `Skeleton` (+ page skeletons),
`Spinner`/`PageLoader`/`InlineLoader`, `Toast` (sits above the mobile tab bar), `MultiSelect`,
`CommandPalette`, `ThemeToggle`, `ReceiptDropzone` (dashed indigo zone on a tint).

## Shell

`dashboard/layout.tsx` renders the rail (`Sidebar`, 232px, collapsible to 72px), the top bar (`Header`:
section context, ⌘K search, theme, New expense) and on phones the `MobileTabBar` (Overview, Expenses,
Add, Trips, More → drawer). Nav items live in `src/components/layout/nav.ts` (shared with ⌘K). Pages
render straight into `<main>`; **do not** add a max-width wrapper or page padding of your own, and start
each page with `PageHeader`. Section gap: `flex flex-col gap-6` (24px) on the page root.

## Layout rules

- Fluid, never a centered column: wrap with `flex flex-wrap` + `basis-[…] grow` or
  `grid-cols-[repeat(auto-fit,minmax(min(Npx,100%),1fr))]`. Test 390px, 1024px, 1440px, 2000px.
- Breakpoints: shell switches at `lg` (1024px). Inside panels prefer container queries
  (`[container-type:inline-size]` + `@container`-style arbitrary CSS) over viewport breakpoints.
- Ledger tables: a 4-column grid row (date · expense · category/department · amount) that collapses to
  2 columns (title block · amount) when the panel is under ~620px; the date and category move into the
  sub-line. Row height ≥ 56px, hairline `border-rule-2` between rows, `rowClass` for hover.
- Touch targets ≥ 44px (40px minimum for dense secondary controls).

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

## Deprecated (remove as pages migrate; delete once the last user is gone)

- Components: `dashboard/StatCard` (+ test) → `Stat`; `dashboard/InsightsHeader` → `PageHeader` + `StatBand`;
  `dashboard/charts/{TopCategoriesCard,DepartmentSpendCard,PaymentSourceCard,MonthlyTrendCard}` and
  `chartTheme.ts` (cyan/emerald palettes) → `Panel` + `RankedBar` / `SplitBar` / div bars with `bg-bar`,
  `bg-ramp`, `bg-hatch`; `dashboard/ExpenseAnalytics` (check its chart colours). `trips/TripBadges` →
  `Badge`; `expenses/ExpenseCard` → ledger rows.
- CSS classes in `globals.css` (restyled flat, kept only for un-migrated pages): `.btn-primary`,
  `.btn-secondary`, `.btn-danger`, `.btn-ghost` → `Button`; `.input-field` → `inputClass`/`selectClass`;
  `.card`, `.card-hover` → `Panel`; `.tabular-nums` mono override → `.num`.
- Token names (remapped to Ledger values): `foreground`, `muted`, `muted-foreground`, `subtle`,
  `subtle-hover`, `line`, `line-strong`, `surface-elevated`, `surface-muted`, numeric `accent-50…900`
  (now indigo), direct `brand-*` shades, `font-heading`, `font-display`.
- Gone already: `bg-ledger`, `bg-ledger-contrast` (now no-ops; still referenced by `src/app/page.tsx` and
  `InsightsHeader`), `shadow-soft`, `animate-loader-*`, `animate-slide-in-right`, BrandLogo `truncate`.
