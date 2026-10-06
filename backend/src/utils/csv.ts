/**
 * Escapes one CSV field (RFC 4180) and neutralizes spreadsheet formula
 * injection: values starting with = + - @ tab or CR are prefixed with '
 * so Excel/Sheets show them as text instead of executing them.
 */
export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(values: unknown[]): string {
  return `${values.map(csvField).join(',')}\r\n`;
}

/** Makes Excel detect UTF-8 (needed for non-Latin text such as Georgian). */
export const UTF8_BOM = '﻿';
