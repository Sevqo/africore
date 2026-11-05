export function safeCSV(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(v ?? '')
              .replace(/^[=+@\-\t\r]/, "'")
              .replace(/"/g, '""') +
            '"',
        )
        .join(','),
    )
    .join('\r\n');
}
