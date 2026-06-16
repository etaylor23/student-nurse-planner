/** Trigger a browser download of a text blob. */
export function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8;") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of a CSV string. */
export function downloadCsv(filename: string, csv: string) {
  downloadText(filename, csv, "text/csv;charset=utf-8;");
}
