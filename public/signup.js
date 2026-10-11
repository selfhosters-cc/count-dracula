// The sign-up page: the browser's time zone rides along, and becomes the new Household's (v2 spec §6).
for (const input of document.querySelectorAll('input[name="timeZone"]')) {
  input.value = Intl.DateTimeFormat().resolvedOptions().timeZone
}
