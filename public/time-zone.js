// The browser's time zone into every form's timeZone field, on the server's own pages (the invite page, Check your
// email): a new Household takes it, and the sign-in email says when in it (spec v2.1 §11).
for (const input of document.querySelectorAll('input[name="timeZone"]')) input.value = Intl.DateTimeFormat().resolvedOptions().timeZone
