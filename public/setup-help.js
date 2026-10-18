// The /setup help (spec v2.1 §9): one entry per help topic, keyed by the data-help="<key>" on its section.
// The column (at 900 px and up) and each heading's "?" (on phones) both draw from HELP. Plain text only, set
// as textContent: { title, p: [paragraphs], terms: [[term, text]], more: [[label, href]] }.
// setup-help.test.js checks every data-help key has an entry and every entry is used.
export const HELP = {
  // ---- Tonight
  checklist: {
    title: 'Ready for Halloween',
    p: [
      "Up to three things to do before the night: put it on your TV, count a test kid, and set up your Halloween night. They tick themselves as you do them, and the list goes once they're done. Naming your household and adding a rough Location sit under them, for whenever you like.",
      "Hide it with ✕ whenever you like: it's hidden for every Manager, on every phone, and nothing else depends on it.",
    ],
  },
  door: {
    title: 'On the door & TV',
    p: [
      "Your TV and every helper's phone are on this night: the open night that went live most recently. Nobody picks it.",
      'When another night goes live, the TV and phones move onto it by themselves, and only the night on the TV plays sound.',
    ],
  },
  nothing: {
    title: 'No night on right now',
    p: [
      'No night is open, so the TV and the door phones say “No night on right now”, with a countdown when your next night has a time.',
      'It goes live by itself at that time, or press Go live on it now, and the TV and phones pick it up without a reload. With nothing scheduled, go live on a night from Nights.',
    ],
  },
  also: {
    title: 'Also open',
    p: [
      "Other nights that are still open, like a test from this afternoon. Kids tapped at the door don't go to them: open one with › and use Add missed kids.",
      'A Live one ends by itself at 3 am, and an Ended one becomes Past at noon. Up to 3 nights can be open at once.',
    ],
  },
  waiting: {
    title: 'Waiting to go live',
    p: [
      "This night's time came while 3 nights were Live, so it's waiting.",
      'End or close one of them and it goes live within a minute. A night you end is closed to make room, so it becomes Past.',
    ],
  },
  helpers: {
    title: 'Helpers',
    p: [
      'Count on this device turns this phone into a door phone. The join code is for a helper who can\'t scan: they enter it under "Got a code?" on the homepage and count at your door.',
      'Add a helper shows a QR code a helper scans with their camera, or Share join link sends it. It works on every night, so a phone set up for a test still works on Halloween. Show on the TV puts the same QR on your porch TV for 2 minutes, so a helper can scan it there. It only shows on a TV you paired with its code, never on a TV link.',
    ],
  },

  watch: {
    title: 'Watch',
    p: [
      'Watch on this device opens the TV screen right here, as your porch TV shows it. Send the TV link, or give out the watch code (entered under "Got a code?" on the homepage), so family can watch from anywhere.',
      "Show the watch QR on the TV puts a QR on your TV for 2 minutes, for someone at the porch to scan. Watchers see tonight's count and costumes, never your phones' names, and can't count. Rotate TV link in Household changes the link and the code, and cuts everyone off, your porch TV too.",
    ],
  },

  // ---- Nights
  nights: {
    title: 'Your nights',
    p: [
      'A night is Upcoming until it goes live, Live while you count, and Ended after End the night (or at 3 am by itself). Late kids still count on an Ended night, and Resume brings it back.',
      'At noon after the night it becomes Past and read-only, or straight away with Close now. Up to 3 nights can be Live or Ended at once.',
    ],
  },
  make: {
    title: 'Make a night',
    p: [
      'A night for a test, a street party or the real thing. Copy costumes from another night to keep your buttons.',
      'It opens on its own screen, and stays Upcoming until you press Go live or its Goes live at comes.',
    ],
  },

  // ---- A night's screen: the header's topic follows the night's state
  'night-Upcoming': {
    title: 'An Upcoming night',
    p: [
      'Waiting to start. It goes live by itself at its Goes live at, or when you press Go live, and its golden tickets are drawn then.',
      'If 3 nights are open at its time, it closes the oldest Ended one to make room, or waits while all 3 are Live. Go live by hand asks you to end or close one first.',
    ],
  },
  'night-Live': {
    title: 'A Live night',
    p: [
      'Counting now. Press End the night when the last kids are gone; it ends by itself at 3 am anyway. With golden tickets still hidden, End offers to release them to the next kids instead.',
      'Reset deletes its kids, golden tickets and share link and makes it Upcoming again, keeping its settings and costumes: handy after a test. Above 20 kids you type its name to confirm, and taps a phone was still holding from before are dropped.',
    ],
  },
  'night-Ended': {
    title: 'An Ended night',
    p: [
      'Over, but late kids still count until noon, when it becomes Past. Its summary is ready.',
      "Resume if you ended too soon. Close now makes it Past straight away and frees an open slot, but then it can't be resumed or reset. Reset puts it back to Upcoming with no kids.",
    ],
  },
  'night-Past': {
    title: 'A Past night',
    p: [
      'Read-only: its settings and costumes stay as they were, and its kids, summary, CSV and TV recap are kept. Race against it next year.',
      'Delete removes it and everything in it, for good. If it has kids, you type its name to confirm.',
    ],
  },
  'night-imported': {
    title: 'Imported counts',
    p: ['Counts from an earlier year, brought in so you have a ghost to race. You can race against it or delete it, nothing else.'],
  },
  tools: {
    title: 'Night tools',
    terms: [
      ['🎫 Add a golden ticket', "While it's Live: hides one more winning kid number in the rest of tonight's range."],
      ['➕ Add missed kids', "A count per 15-minute row, added as untagged kids that never celebrate; Remove takes a batch back. It's also how you count into a night the door isn't on."],
      ['⬇ CSV', 'Every kid, for a spreadsheet.'],
      ['🖨 Tally sheet', 'A paper sheet with its costumes, in case a phone dies. Add what you tallied with Add missed kids.'],
      ['✨ Night summary', "Slides of the night, once it's ended. Sharing on makes one public link, with your household's name unless you untick Show our name; turning it off kills the link."],
      ['📺 TV recap', "A Past night's recap cards, on this screen."],
    ],
  },
  settings: {
    title: 'Night settings',
    p: ["A Past night's settings are read-only."],
    terms: [
      ['Race against', "The ghost on the TV: a night that's over, imported counts, or last year's estimate. Saving an estimate under Household sets it on every night racing None."],
      ['Expected kids', 'Your guess for this year. With no ghost, golden tickets are spread over it.'],
      ['Visit window', 'Taps this close together are one crew, for “Biggest crew” on the recap and summary.'],
      ['Goes live at', "Upcoming nights only. The night starts by itself at this time, in your household's time zone. Empty: only when you press Go live."],
      ['Advanced: Clock shift', "Moves this night's clock, so a 2 pm test plays like 5 pm. Leave it at 0 for the real night."],
      ['Advanced: Golden tickets', "How many winning kid numbers are hidden at Go live, between 10% and 80% of the ghost's total (or Expected kids). With neither, none are hidden."],
    ],
  },
  costumes: {
    title: 'Costumes',
    p: [
      'The buttons on the door phones for this night, in this order. Adding one mid-night is fine, and deleting one leaves its kids untagged.',
      'Each night has its own list; Make a night copies one.',
    ],
  },

  // ---- Household
  join: {
    title: 'Helpers and the join code',
    p: [
      'The join code, its QR and its link let a phone count at your door, on every night, test or real. Anyone holding one can add kids, so share them with your helpers only.',
      "Change join code cuts off every other phone that joined: they'll need the new code, QR or link. This phone keeps counting. Show the helper QR on the TV (under Add a helper) puts the QR on your paired porch TV for 2 minutes; a TV link never gets it, so family watching from afar can't count.",
    ],
  },
  tv: {
    title: 'Your TV',
    p: [
      'The TV link only watches: it shows whichever night the door is on and switches by itself. Pair a TV with the code on its screen, or send the link to family far away.',
      'Rotate TV link cuts every screen off, your porch TV included, until it gets the new link.',
    ],
    more: [['TV help: laptops, sound, smart TVs', '/help/tv']],
  },
  estimate: {
    title: 'Last year (estimated)',
    p: [
      'No count from last year? Type a guess. It becomes a ghost shaped like a typical night, labelled “last year (estimated)”.',
      'Saving it sets it as Race against on every night racing None, and nights you make later start on it. Clear it and those nights go back to None.',
    ],
  },
  name: {
    title: 'Household name',
    p: [
      "It's on any summary you share, unless you untick Show our name, and in the words a helper's invite uses. The TV never shows it.",
      "Keep it decent: it's under the House rules.",
    ],
    more: [['House rules', '/privacy#house-rules']],
  },
  location: {
    title: 'Location',
    p: [
      'Optional. Pick roughly where you are: only a square about 5 km across is kept, worked out on your phone, never your address.',
      "“Near you” shows once another house nearby is counting: your TV and phones show how many kids came near you in the last half hour. It's your area, plus the next one when you're close to its edge (all four at a corner).",
    ],
  },
  managers: {
    title: 'Managers',
    p: [
      'Everyone here runs the household equally. Invite someone with a link: it works once, for 7 days, and they sign in with Google or their email. Each email address manages one household.',
      "Remove takes another Manager off, and Leave this household removes only you; the household and its nights stay. The last Manager can't leave: delete the household instead.",
    ],
  },
  account: {
    title: 'Your account',
    p: [
      "You sign in with Google, or with a link we email you: the same email address is the same account. Signing out doesn't stop the door phones or the TV.",
      "Delete my household deletes every night, kid and costume straight away, once you type its name. It can't be undone.",
    ],
  },
}
