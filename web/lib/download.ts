const MARKDOWN_TYPE = "text/markdown;charset=utf-8";

export function downloadTextFile(fileName: string, text: string, type = MARKDOWN_TYPE): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
