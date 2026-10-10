# ☰ door menu: volume, mutes, Add a helper

Type: build (AFK)
Status: ready-for-agent
Blocked by: 25

## What to build

The ☰ sheet over the phone counting screen, **open to any phone with the join key**. See [spec §5](../spec.md#5-phone--door-menu) and [§10 Controls](../spec.md#10-sound). This ticket builds the sheet and its first controls. The soundboard, Release remaining and End the night slot into it in later tickets.

- **TV volume** slider and three mutes: **Ambience**, **Kid bloops**, **Everything**. These are runtime controls sent to the TV over the existing write + SSE path. When ambience is muted, an inaudible keep-alive replaces it. The TV shows a small 🔇 in the top bar when any mute is on. Decide whether settings persist per event or globally ([§16](../spec.md#16-builders-latitude)).
- **"Add a helper":** a QR code with the **LAN URL plus the join key**, using a vendored QR library. It is **never shown on the TV**. A LAN phone that scans it joins without typing anything.
- A link to **Setup**.
- Where the ☰ button sits on the counting screen is the builder's choice.

## Acceptance criteria

- [ ] Any joined phone can open ☰; a phone without the key can't change anything
- [ ] The volume slider changes the TV level live
- [ ] Each mute silences its group, and 🔇 shows on the TV while any mute is on
- [ ] With ambience muted, the TV's audio path stays awake (the next bloop plays in full after a long gap)
- [ ] Scanning the QR code on a non-Tailscale phone opens the LAN URL already joined
- [ ] The QR code never renders on `/tv`
