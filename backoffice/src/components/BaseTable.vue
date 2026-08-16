<template>
  <div class="table-wrap" :class="{ 'table-stack': stackOnMobile }">
    <div class="table-scroll" :class="{ 'table-sticky-first': stickyFirst }">
      <table>
        <caption v-if="caption" class="sr-only">{{ caption }}</caption>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" scope="col" :style="c.width ? `width:${c.width}` : undefined">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in pageRows" :key="rowKey(row, i)">
            <td v-for="c in columns" :key="c.key" :data-label="c.label" :class="c.class">
              <!--
                A per-column slot, so a view keeps full control of a cell —
                badges, buttons, links — while handing over the parts that were
                copied twenty times: the scroll container, the sticky column,
                the empty state and the pager.
              -->
              <slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]" :index="i">
                {{ format(row, c) }}
              </slot>
            </td>
          </tr>

          <tr v-if="!rows.length">
            <td :colspan="columns.length" class="table-empty">
              <div class="table-empty-title">{{ emptyTitle }}</div>
              <div v-if="emptyHint" class="table-empty-hint">{{ emptyHint }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Only when it would do something. A pager under a four-row table is
         furniture. -->
    <div v-if="paginated && rows.length > pageSize" class="pagination">
      <button class="btn btn-sm btn-secondary" :disabled="page === 1" @click="page--">Previous</button>
      <span>{{ rangeLabel }} of {{ rows.length }}</span>
      <button class="btn btn-sm btn-secondary" :disabled="page >= pageCount" @click="page++">Next</button>
    </div>
    <div v-else-if="footerNote" class="pagination"><span>{{ footerNote }}</span></div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { formatValue } from '../lib/formatters'

/**
 * The shared table shell.
 *
 * ── What this owns, and what it deliberately does not ──────────────────────
 *
 * It owns the parts that were copied into twenty views and drifted: the scroll
 * container, the sticky first column, the empty state, the pager, and header
 * scopes for screen readers.
 *
 * It does **not** own cell contents. Every column can be overridden with a
 * `cell-<key>` slot, so a badge stays a badge and a button stays a button. A
 * table component that also decided how a cell renders would need a
 * configuration language for every case the views already express in plain
 * template, and each view would end up fighting it.
 *
 * That boundary is what makes the migration safe to do incrementally: a view
 * either uses this shell or it does not, and nothing in between changes.
 */
const props = defineProps({
  /** [{ key, label, width?, class?, format? }] */
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  /** Stable row identity; falls back to the index when a row has no id. */
  rowId: { type: [String, Function], default: 'id' },
  caption: { type: String, default: '' },
  emptyTitle: { type: String, default: 'Nothing to show' },
  emptyHint: { type: String, default: '' },
  /** Freeze the first column. For tables wide enough to lose row context. */
  stickyFirst: { type: Boolean, default: false },
  /**
   * Below the mobile breakpoint, render each row as a stacked card with every
   * cell labelled from the `data-label` this component already emits. Opt-in
   * because a two- or three-column table still reads better as a table on a
   * phone; it earns its keep once a row is too wide to fit without scrolling
   * sideways through it.
   */
  stackOnMobile: { type: Boolean, default: false },
  paginated: { type: Boolean, default: false },
  pageSize: { type: Number, default: 50 },
  footerNote: { type: String, default: '' },
})

const page = ref(1)

const pageCount = computed(() => Math.max(1, Math.ceil(props.rows.length / props.pageSize)))

const pageRows = computed(() => {
  if (!props.paginated) return props.rows
  return props.rows.slice((page.value - 1) * props.pageSize, page.value * props.pageSize)
})

const rangeLabel = computed(() => {
  const first = (page.value - 1) * props.pageSize + 1
  return `${first}–${Math.min(page.value * props.pageSize, props.rows.length)}`
})

// Filtering to fewer pages while on a later one would otherwise leave the user
// staring at an empty table with no visible cause.
watch(() => props.rows, () => { if (page.value > pageCount.value) page.value = 1 })

function rowKey(row, i) {
  if (typeof props.rowId === 'function') return props.rowId(row)
  return row?.[props.rowId] ?? i
}

function format(row, c) {
  const v = row?.[c.key]
  if (typeof c.format === 'function') return c.format(v, row)
  return formatValue(v)
}
</script>

<style scoped>
/* Visible to a screen reader, not on screen. Tables had no caption at all, so
   a non-sighted user reached a grid of numbers with nothing naming it. */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
