/**
 * Prevent accidental text selection during drag operations (document-level).
 * Pair every call with {@link restoreDocumentTextSelection}.
 */
export function suspendDocumentTextSelection(): void {
  document.body.style.userSelect = "none";
}

export function restoreDocumentTextSelection(): void {
  document.body.style.userSelect = "";
}
