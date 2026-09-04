import { describe, it, expect } from 'vitest'
import { mergeSections } from '../../src/lib/sections'

/**
 * The zone pickers render a list the manager owns now.
 *
 * Three ways this must never break the floor:
 *   - server order wins (the manager arranged it),
 *   - a zone that exists only on tables stays selectable — a table whose
 *     zone vanished from the picker is unfilterable and unassignable,
 *   - garbage from the server changes nothing (offline till keeps its list).
 */
describe('mergeSections', () => {
  it('keeps the server order untouched', () => {
    expect(mergeSections(['Bar', 'Patio'], [])).toEqual(['Bar', 'Patio'])
  })

  it('appends zones that exist only on tables, case-insensitively', () => {
    const rows = [
      { section: 'Terrace' },
      { section: 'Patio' },      // already in the list
      { section: '  Bar  ' },    // whitespace match
      { section: 'patio ' },     // case-insensitive match
    ]
    expect(mergeSections(['Patio', 'Bar'], rows)).toEqual(['Patio', 'Bar', 'Terrace'])
  })

  it('trims and drops empty server entries', () => {
    expect(mergeSections(['  Patio  ', '', null, undefined, 42], [])).toEqual(['Patio', '42'])
  })

  it('returns [] for garbage input — the caller keeps its last known list', () => {
    expect(mergeSections(undefined, [])).toEqual([])
    expect(mergeSections('not a list', [])).toEqual([])
    expect(mergeSections({ sections: ['Patio'] }, [])).toEqual([])
  })

  it('ignores tables with no section', () => {
    expect(mergeSections(['Patio'], [{ section: '' }, {}, { section: null }])).toEqual(['Patio'])
  })

  it('handles a non-array rows argument', () => {
    expect(mergeSections(['Patio'], undefined)).toEqual(['Patio'])
  })
})
