/**
 * export-formats — pure descriptor model for the /reports/export format cards.
 *
 * The export page replaces a flat list with selectable format cards (CSV / JSON
 * / ICS / PDF). Each card shows a one-line "what's inside" plus a rough file-
 * size estimate derived from how many records the export carries. This module
 * holds the static descriptors, the per-format size heuristic, and a humanised
 * byte formatter so the page stays a thin render and the estimate math is
 * unit-tested.
 *
 * No React, no Date.now(), no I/O — the size estimate is a deterministic
 * function of the record counts the caller passes in.
 */

export type ExportFormat = 'csv' | 'json' | 'ics' | 'pdf';

export interface ExportCounts {
  /** Dose events in the export window. */
  doses: number;
  /** Medications on file. */
  medications: number;
  /** Schedule entries. */
  schedules: number;
}

export interface ExportFormatDescriptor {
  format: ExportFormat;
  label: string;
  /** File extension, no dot. */
  extension: string;
  /** One-line "what's inside". */
  summary: string;
  /** Where it's typically opened. */
  bestFor: string;
  endpoint: string;
  /** Approximate bytes per primary record, for the size heuristic. */
  bytesPerRecord: number;
  /** Fixed overhead bytes (headers, boilerplate, document chrome). */
  baseBytes: number;
  /** Which records dominate the file size. */
  weighs: 'doses' | 'all';
}

export const EXPORT_FORMATS: ExportFormatDescriptor[] = [
  {
    format: 'csv',
    label: 'CSV',
    extension: 'csv',
    summary: 'One row per dose event, ready for a spreadsheet.',
    bestFor: 'Excel, Google Sheets, Numbers',
    endpoint: '/reports/export/csv',
    bytesPerRecord: 64,
    baseBytes: 256,
    weighs: 'doses',
  },
  {
    format: 'json',
    label: 'JSON',
    extension: 'json',
    summary: 'Full structured data: medications, schedules, and doses.',
    bestFor: 'Developers and backups',
    endpoint: '/reports/export/json',
    bytesPerRecord: 220,
    baseBytes: 512,
    weighs: 'all',
  },
  {
    format: 'ics',
    label: 'Calendar',
    extension: 'ics',
    summary: 'Each dose as a calendar event you can subscribe to.',
    bestFor: 'Apple Calendar, Google Calendar, Outlook',
    endpoint: '/reports/export/ics',
    bytesPerRecord: 180,
    baseBytes: 320,
    weighs: 'doses',
  },
  {
    format: 'pdf',
    label: 'PDF report',
    extension: 'pdf',
    summary: 'A printable adherence summary for your clinician.',
    bestFor: 'Printing and sharing at a visit',
    endpoint: '/reports/export/pdf',
    bytesPerRecord: 40,
    baseBytes: 24_000,
    weighs: 'all',
  },
];

/** Look up a descriptor by format key (undefined when unknown). */
export function getExportFormat(format: string): ExportFormatDescriptor | undefined {
  return EXPORT_FORMATS.find((f) => f.format === format);
}

/** The record count that drives a descriptor's size estimate. */
export function primaryRecordCount(desc: ExportFormatDescriptor, counts: ExportCounts): number {
  const doses = Math.max(0, counts.doses | 0);
  if (desc.weighs === 'doses') return doses;
  return doses + Math.max(0, counts.medications | 0) + Math.max(0, counts.schedules | 0);
}

/**
 * Estimated file size in bytes for a format given the record counts. Always at
 * least the base overhead so an empty export still reads as a real (small) file.
 */
export function estimateBytes(desc: ExportFormatDescriptor, counts: ExportCounts): number {
  const records = primaryRecordCount(desc, counts);
  return desc.baseBytes + records * desc.bytesPerRecord;
}

/** Humanise a byte count: "256 B", "4.1 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, Math.round(bytes));
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export interface ExportCard extends ExportFormatDescriptor {
  estimatedBytes: number;
  estimatedSize: string;
}

/**
 * Build the renderable cards: every descriptor decorated with its estimated
 * size for the current export window. Order matches EXPORT_FORMATS.
 */
export function buildExportCards(counts: ExportCounts): ExportCard[] {
  return EXPORT_FORMATS.map((desc) => {
    const estimatedBytes = estimateBytes(desc, counts);
    return { ...desc, estimatedBytes, estimatedSize: formatBytes(estimatedBytes) };
  });
}
