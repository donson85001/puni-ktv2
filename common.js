function respond_(e, obj) {
  const cb = e.parameter.callback;
  if (cb) {
    return ContentService
      .createTextOutput(`${cb}(${JSON.stringify(obj)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
