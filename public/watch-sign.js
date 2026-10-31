// The watch-along sign (/watch-sign, from /setup's 📺 Your TV): the TV link's QR and its watch code on one
// printed page, for the porch or the fridge. A Manager's page: it reads the Household with their session.
import qrcode from '/vendor/qrcode/qrcode.js'
import { formatCode } from '/shared/codes.js'
import { tvQrCodeLine, watchLink } from '/door-view.js'

const $ = (id) => document.getElementById(id)
const res = await fetch('/api/household')
if (res.status === 401) location.href = '/#sign-in'
const house = await res.json()

const qr = qrcode(0, 'M')
qr.addData(watchLink(location.origin, house.tvToken))
qr.make()
$('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true })
// "No camera? Go to <host> and enter K7Q-M4X", worded like the TV's watch QR card.
const code = formatCode(house.watchCode)
const line = tvQrCodeLine(code, location.origin)
$('code-line').replaceChildren(line.slice(0, line.lastIndexOf(code)), Object.assign(document.createElement('b'), { textContent: code }))
$('name').textContent = house.displayName
$('for').hidden = !house.displayName
$('print').addEventListener('click', () => print())
