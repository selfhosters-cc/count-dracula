import { describe, expect, test } from 'bun:test'
import { toCsv } from './export.js'

const local = (hh, mm, ss = 0) => new Date(2026, 9, 31, hh, mm, ss).getTime()

const night = {
  name: 'Halloween 2026',
  clockShiftMs: 0,
  kids: [
    { number: 1, tappedAt: local(17, 42, 10), receivedAt: local(17, 42, 11), tag: null, source: 'tap', deletedAt: null, phoneName: 'Dad', late: false },
    { number: 2, tappedAt: local(17, 50), receivedAt: local(17, 50, 1), tag: 'Witch', source: 'tap', deletedAt: local(17, 51), phoneName: 'Mom', late: false },
    { number: 2, tappedAt: local(18, 5), receivedAt: local(18, 20), tag: null, source: 'backfill', deletedAt: null, phoneName: 'Add missed kids', late: true },
    { number: 3, tappedAt: local(18, 40), receivedAt: local(18, 40, 2), tag: 'Bluey, the dog', source: 'tap', deletedAt: null, phoneName: 'Dad', late: false },
  ],
}

describe('export CSV', () => {
  test('one row per kid with readable local timestamps; deleted and backfilled kids marked', () => {
    const lines = toCsv(night).split('\n')

    expect(lines[0]).toBe('event,Halloween 2026')
    expect(lines[1]).toBe('number,tapped_at,received_at,tag,source,deleted,phone,late')
    expect(lines[2]).toBe('1,2026-10-31 17:42:10,2026-10-31 17:42:11,,tap,,Dad,')
    expect(lines[3]).toBe('2,2026-10-31 17:50:00,2026-10-31 17:50:01,Witch,tap,2026-10-31 17:51:00,Mom,')
    expect(lines[4]).toBe('2,2026-10-31 18:05:00,2026-10-31 18:20:00,,backfill,,Add missed kids,late')
    expect(lines[5]).toBe('3,2026-10-31 18:40:00,2026-10-31 18:40:02,"Bluey, the dog",tap,,Dad,')
  })

  test('ends with a half-hour summary of the non-deleted kids', () => {
    const csv = toCsv(night)
    const summary = csv.trimEnd().split('\n\n')[1].split('\n')

    expect(summary).toEqual(['half_hour_start,half_hour_end,kids', '17:42,18:00,1', '18:00,18:30,1', '18:30,19:00,1'])
  })
})
