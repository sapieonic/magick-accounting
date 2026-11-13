"use client";

import { useState, type ReactNode } from "react";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import RankedBar from "@/components/ui/RankedBar";
import SplitBar from "@/components/ui/SplitBar";
import { linkClass } from "@/components/ui/styles";
import { formatBaseCurrency } from "@/lib/currency";
import Avatar from "@/components/ui/Avatar";

interface UserSpend {
  _id: string;
  name: string;
  photoURL?: string;
  totalSpend?: number;
  companySpend?: number;
  pocketSpend?: number;
}

/** Rows shown before "Show all". */
const TOP = 8;

/** Users with spend, largest first. */
function spendRows(users: UserSpend[]) {
  return users
    .filter((u) => (u.totalSpend ?? 0) > 0)
    .map((u) => ({ user: u, value: u.totalSpend ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Users with a company/pocket breakdown, largest first. */
function sourceRows(users: UserSpend[]) {
  return users
    .map((u) => ({ user: u, company: u.companySpend ?? 0, pocket: u.pocketSpend ?? 0 }))
    .filter((r) => r.company + r.pocket > 0)
    .sort((a, b) => b.company + b.pocket - (a.company + a.pocket));
}

/** A ranked panel list that shows the top rows and expands on demand. */
function TopList<T extends { user: { _id: string } }>({ rows, render, label }: { rows: T[]; render: (row: T) => ReactNode; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, TOP);
  return (
    <>
      <ul aria-label={label} className="flex flex-col gap-3.5">
        {shown.map((row) => (
          <li key={row.user._id}>{render(row)}</li>
        ))}
      </ul>
      {rows.length > TOP && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`${linkClass} mt-4 min-h-10 self-start text-[13px]`}
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

/** "Spend by user" ranked bars and the company-vs-pocket split, per person. */
export default function UserSpendPanels({ users }: { users: UserSpend[] }) {
  const spend = spendRows(users);
  const source = sourceRows(users);
  if (spend.length === 0 && source.length === 0) return null;

  const total = spend.reduce((sum, r) => sum + r.value, 0);
  const max = spend[0]?.value ?? 0;
  const company = source.reduce((sum, r) => sum + r.company, 0);
  const pocket = source.reduce((sum, r) => sum + r.pocket, 0);

  return (
    <PanelGrid min={420}>
      {spend.length > 0 && (
        <Panel title="Spend by user" meta={<span className="num">{formatBaseCurrency(total)}</span>}>
          <TopList
            label="Spend by user"
            rows={spend}
            render={({ user, value }) => (
              <RankedBar
                leading={<Avatar name={user.name} photoURL={user.photoURL} size={24} />}
                label={user.name}
                amount={formatBaseCurrency(value)}
                ratio={max > 0 ? value / max : 0}
                share={total > 0 ? (value / total) * 100 : undefined}
              />
            )}
          />
        </Panel>
      )}

      {source.length > 0 && (
        <Panel title="Company vs pocket" meta="Who paid">
          <SplitBar company={company} pocket={pocket} />
          <div className="mt-4 flex flex-col gap-3 border-t border-rule-2 pt-4">
            <span className="cap text-ink-3">By person</span>
            <TopList
              label="Company versus pocket spend by user"
              rows={source}
              render={({ user, company: c, pocket: p }) => (
                <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                  <Avatar name={user.name} photoURL={user.photoURL} size={24} className="row-span-2" />
                  <span className="ell">{user.name}</span>
                  <span className="flex flex-wrap justify-end gap-x-2 text-[13px]">
                    <span className="num whitespace-nowrap">
                      <span className="sr-only">Company </span>
                      {formatBaseCurrency(c)}
                    </span>
                    <span className="num whitespace-nowrap text-amber">
                      <span className="sr-only">Pocket </span>
                      {formatBaseCurrency(p)}
                    </span>
                  </span>
                  <SplitBar company={c} pocket={p} legend="none" size="sm" className="col-[2/-1]" />
                </div>
              )}
            />
          </div>
        </Panel>
      )}
    </PanelGrid>
  );
}
