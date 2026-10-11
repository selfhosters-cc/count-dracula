# Blocklist

`en.txt` is the English list from **List of Dirty, Naughty, Obscene, and Otherwise Bad Words** (LDNOOBW),
https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words, file `en` at commit
`5faf2ba42d7b1c0977169ec3611df25a3c08eb13` (2020-07-13), copied unchanged on 2026-10-11.

Licence: Creative Commons Attribution 4.0 International (`LICENSE`), © Shutterstock and the LDNOOBW contributors.

`server/blocklist.js` reads it; it's matched on whole, normalised words (v2 spec §15). To update, replace the file
and this note.
