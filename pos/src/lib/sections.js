/**
 * Merge the server's zone list with the zones actually on tables.
 *
 * Pure so the floor plan's zone picker can be tested without a component
 * mount: given what the server serves (`tables/sections`) and what the rows
 * say, decide what the pickers show.
 *
 * Rules:
 *   - server order wins — the manager arranged it, the pickers honour it;
 *   - a zone that exists only on tables (legacy free text typed before zones
 *     were data) is appended, case-insensitively de-duplicated, because a
 *     table whose zone vanished from the picker would be unfilterable and
 *     unassignable;
 *   - an empty or unusable server list changes nothing — the caller keeps its
 *     last known list or its defaults (offline till).
 *
 * @param {unknown} serverList  what GET /api/tables/sections served (or garbage)
 * @param {Array<{section?: string}>} rows  the tables currently loaded
 * @returns {string[]} merged zone names, or [] when there is nothing usable
 */
export function mergeSections(serverList, rows) {
  const fromServer = Array.isArray(serverList)
    ? serverList.map((s) => String(s ?? '').trim()).filter(Boolean)
    : []
  const merged = [...fromServer]
  const have = new Set(fromServer.map((s) => s.toLowerCase()))
  for (const row of Array.isArray(rows) ? rows : []) {
    const s = String(row?.section ?? '').trim()
    if (s && !have.has(s.toLowerCase())) {
      have.add(s.toLowerCase())
      merged.push(s)
    }
  }
  return merged
}
