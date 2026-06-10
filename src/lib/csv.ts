// Minimal CSV builder for client-side exports. Values containing commas,
// quotes, or newlines are quoted per RFC 4180.
export function escapeCsvValue(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel detects UTF-8 (rupee sign, accented vendor names, etc.).
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
