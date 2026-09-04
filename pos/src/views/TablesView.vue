<template>
  <div class="tm-page" style="position:relative">
    <!-- Reactive tick for timer updates -->
    <span style="display:none">{{ tick }}</span>
    <!-- Loading -->
    <div v-if="loading" class="loading-overlay"><div class="spinner"></div></div>

    <!-- ═══ TOOLBAR ═══ -->
    <div class="tm-toolbar">
      <div class="tm-toolbar-left">
        <span class="tm-toolbar-title">Floor Plan</span>
        <span class="tm-toolbar-sub">{{ tables.length }} tables &middot; {{ occupancyPercent }}% occupied</span>
      </div>
      <div class="tm-toolbar-actions">
        <button class="btn btn-sm tm-live-btn" :class="{ 'is-live': sseConnected, 'is-off': !sseConnected }" @click="toggleSSE" :title="sseConnected ? 'Live updates active — click to disconnect' : 'Click to enable live updates'">
          <span class="tm-sse-dot" :class="{ active: sseConnected }"></span>
          <span>{{ sseConnected ? 'Live' : 'Offline' }}</span>
        </button>
        <button v-if="authStore?.roleKey === 'manager'" class="btn btn-primary btn-sm" @click="openAddTable">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Table
        </button>
        <button class="btn btn-ghost btn-sm tm-refresh-btn" @click="refreshAll" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>

    <!--
      Orders guests placed themselves, from the code on their table.

      They are not on the kitchen board yet and will not be until somebody here
      taps Accept. That is the whole safeguard: a printed code is a photograph
      anyone can keep, so an order from one is a request rather than an
      instruction. A glance at the table answers it.

      The strip is absent entirely when nothing is waiting — an empty panel on
      a floor plan is noise, and this screen is busy enough.
    -->
    <div v-if="pendingOrders.length" class="tm-pending">
      <div class="tm-pending-head">
        <strong>{{ pendingOrders.length }} order{{ pendingOrders.length === 1 ? '' : 's' }} from guests waiting</strong>
        <span class="tm-pending-hint">The kitchen has not seen these yet</span>
      </div>
      <div class="tm-pending-list">
        <div v-for="o in pendingOrders" :key="o.id" class="tm-pending-card">
          <div class="tm-pending-where">
            <span class="tm-pending-table">
              {{ tableLabel(o.tableNum) }}
              <span class="tm-source-badge" :class="o.source === 'qr' ? 'source-qr' : 'source-staff'">
                {{ o.source === 'qr' ? 'QR' : 'Staff' }}
              </span>
            </span>
            <span class="tm-pending-ago">{{ waitingFor(o.created) }}</span>
          </div>
          <div class="tm-pending-items">{{ summarise(o.items) }}</div>
          <div class="tm-pending-actions">
            <span class="tm-pending-total">{{ o.total }}</span>
            <button class="btn btn-primary btn-sm" :disabled="accepting === o.id" @click="acceptOrder(o)">
              {{ accepting === o.id ? 'Sending…' : 'Accept' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>

    <!-- ═══ ZONE PICKER ═══
       A dropdown, not a row of chips. Six zone chips wrapped to two rows of
       pills on a phone, cost ~100px of vertical space before the floor plan,
       and short labels ("All") kept squaring off inside a fully-rounded
       border — the circle-button bug. A select costs one row, shows every
       zone in the native picker (one tap to open, one to choose), and cannot
       render as a circle because it is a rectangle by construction. -->
    <label class="tm-zonepick">
      <span class="tm-zonepick-label">Zone</span>
      <select v-model="activeSection" class="tm-zonepick-select">
        <option v-for="s in allSections" :key="s" :value="s">{{ s === 'All' ? 'All sections' : s }}</option>
      </select>
    </label>

    <!-- ═══ STATUS STRIP ═══
         Four KPI cards used to occupy the whole first screen, so the floor plan -
         the thing this page exists for - started below the fold. The same four
         numbers now ride in one strip, and each one filters the floor rather than
         just reporting. Tapping "Occupied" is how a waiter finds their tables. -->
    <div class="tm-strip" role="group" aria-label="Filter floor by status">
      <button
        v-for="s in statusSummary"
        :key="s.key"
        class="tm-chip"
        :class="[s.key, { active: statusFilter === s.key }]"
        :aria-pressed="statusFilter === s.key"
        @click="toggleStatusFilter(s.key)"
      >
        <span class="tm-chip-dot"></span>
        <span class="tm-chip-num">{{ s.count }}</span>
        <span class="tm-chip-label">{{ s.label }}</span>
        <span class="tm-chip-sub">{{ s.sub }}</span>
      </button>
    </div>

    <!-- ═══ TABLE CARDS ═══ -->
    <div v-for="section in visibleSections" :key="section" class="tm-section">
      <div class="tm-section-header">
        <h4>{{ section }}</h4>
        <span class="tm-section-count">{{ sectionTables(section).length }} tables</span>
      </div>
      <div class="tm-table-grid">
        <div
          v-for="t in sectionTables(section)"
          :key="t.id"
          class="tm-table-card"
          :class="t.status"
          @click="openDetail(t)"
          tabindex="0"
          role="button"
          @keydown.enter="openDetail(t)"
          :aria-label="`Table ${t.number} - ${t.status}`"
        >
          <!-- Top: Status pill -->
          <div class="tfc-top">
            <span class="tfc-status-pill" :class="t.status">{{ t.status }}</span>
          </div>

          <!-- Center: Table icon + number -->
          <div class="tfc-center">
            <div class="tfc-icon" :class="t.status">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="10" y="16" width="28" height="18" rx="4" stroke="currentColor" stroke-width="2"/>
                <circle cx="10" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="18" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="30" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="38" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="10" cy="38" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="18" cy="38" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="30" cy="38" r="3" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="38" cy="38" r="3" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="tfc-number">T-{{ String(t.number).padStart(2, '0') }}</div>
          </div>

          <!-- Server badge (if occupied) -->
          <div v-if="t.server" class="tfc-server">
            <span class="tfc-server-badge" :style="serverColor(t.server)">{{ serverInitials(t.server) }}</span>
          </div>

          <!-- Bottom: Info based on status -->
          <div class="tfc-bottom">
            <!-- Available -->
            <template v-if="t.status === 'available'">
              <div class="tfc-info-row">
                <span class="tfc-label">{{ t.capacity }} Persons</span>
                <span class="tfc-label">&middot;</span>
                <span class="tfc-label">{{ t.capacity <= 4 ? 'Small' : t.capacity <= 6 ? 'Medium' : 'Large' }}</span>
              </div>
            </template>

            <!-- Occupied -->
            <template v-else-if="t.status === 'occupied'">
              <div class="tfc-info-row" v-if="occupancyTimer(t)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tfc-timer-icon"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                <span class="tfc-timer-text" :class="'urg-' + occupancyUrgency(t)">{{ occupancyTimer(t) }}</span>
              </div>
              <!-- Past the venue's sitting maximum: the sweep releases this
                   table to cleaning within the minute. Shown so the floor can
                   clear it on purpose rather than watch it disappear. -->
              <span v-if="occupancyUrgency(t) === 'overdue'" class="tfc-overdue-badge">Releases soon — past 4h</span>
              <div class="tfc-info-row">
                <span v-if="tableOrderCounts[t.id]" class="tfc-label">{{ tableOrderCounts[t.id] }} Order{{ tableOrderCounts[t.id] > 1 ? 's' : '' }}</span>
                <span v-else class="tfc-label">No order</span>
                <span v-if="tableOrderTotals[t.id]" class="tfc-amount">{{ formatETB(tableOrderTotals[t.id]) }}</span>
              </div>
              <span v-if="tableOpenTab[t.id]" class="tfc-tab-badge">Open Tab</span>
              <!-- Money state of the party's checks — the "is the table paid?"
                   answer, which used to be a question only the cashier could
                   answer. The bill-request chip rides beside it so the floor
                   plan and the cashier's screen tell the same story. -->
              <div class="tfc-info-row" v-if="t.payment || t.bill_requested_at">
                <span v-if="t.payment" class="tfc-pay-badge" :class="'pay-' + t.payment">{{ paymentLabel(t.payment) }}</span>
                <span v-if="t.bill_requested_at" class="tfc-bill-req">Bill Requested</span>
              </div>
            </template>

            <!-- Reserved -->
            <template v-else-if="t.status === 'reserved'">
              <div class="tfc-info-row">
                <span class="tfc-label">{{ t.capacity }} Persons</span>
              </div>
              <div v-if="t.reservedHold" class="tfc-reservation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tfc-timer-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>{{ t.reservedHold.name || 'Reserved' }}</span>
                <span class="tfc-res-time">{{ holdWindowLabel(t.reservedHold) }}</span>
              </div>
            </template>

            <!-- Cleaning -->
            <template v-else-if="t.status === 'cleaning'">
              <div class="tfc-info-row">
                <span class="tfc-label">Needs cleaning</span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!filteredTables.length && !loading" class="tm-empty-section">
      <div class="empty-state-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
      </div>
      <div class="empty-state-text">No tables in {{ activeSection === 'All' ? 'any section' : activeSection }}</div>
      <div class="empty-state-hint">{{ activeSection === 'All' ? 'Tables will appear here once they are added.' : 'Try selecting a different section.' }}</div>
    </div>

    <!-- ═══ TABLE DETAIL PANEL ═══ -->
    <div class="modal-overlay" v-if="detailTable" @click.self="closeDetail">
      <div class="tm-detail-modal" role="dialog" aria-modal="true" :aria-label="`Table ${detailTable.number} details`">
        <!-- Header -->
        <div class="tm-detail-header">
          <div>
            <h3>Table {{ detailTable.number }} &mdash; {{ detailTable.name || ('Table ' + detailTable.number) }}</h3>
            <p class="modal-sub">{{ detailTable.section }} &middot; {{ detailTable.capacity }} seats &middot; {{ detailTable.shape || 'square' }}</p>
          </div>
          <button class="btn-icon tm-detail-close" @click="closeDetail" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- The booking that holds this table, stated before the waiter tries
             to seat anyone. The server refuses the seating either way; showing
             it here is the difference between an explanation and a wall. -->
        <div v-if="detailHold" class="tm-hold-banner" :class="{ 'is-manager': isManager }">
          <div class="tm-hold-banner-main">
            <strong>Reserved &mdash; {{ detailHold.name || 'no name given' }}</strong>
            <span>{{ holdWindowLabel(detailHold) }}<span v-if="detailHold.guests"> &middot; {{ detailHold.guests }} guest{{ detailHold.guests > 1 ? 's' : '' }}</span></span>
            <span class="tm-hold-rule">
              <template v-if="!detailHold.blocksNow">
                The table is still usable until {{ leadMinutes }} minutes before the booking, so a short sitting can be seated now.
              </template>
              <template v-else-if="isManager">
                You can release it for a walk-in. The booking is cancelled and recorded against your name.
              </template>
              <template v-else>
                It cannot be seated until a manager releases it. It frees itself {{ graceMinutes }} minutes after the booked time if nobody arrives.
              </template>
            </span>
          </div>
          <button v-if="isManager" class="btn btn-warning btn-sm" :disabled="releasing" @click="releaseHold">
            {{ releasing ? 'Releasing…' : 'Release Table' }}
          </button>
        </div>

        <!-- Quick status buttons -->
        <div class="tm-quick-status">
          <button v-for="s in statuses" :key="s" class="tm-qs-btn" :class="[detailTable.status === s ? 'active' : '', 'qs-' + s]" @click="quickStatus(s)">{{ s }}</button>
        </div>

        <!-- Detail form -->
        <div class="tm-detail-grid">
          <div class="form-group">
            <label>Assigned Server</label>
            <!-- Assignment is a manager's decision, enforced server-side as
                 well: only a manager may WRITE a new name onto a table. The
                 dropdown lists the active head-waiters so the name stored on
                 the table is exactly the staff member's display name - the
                 same string their own login is filtered by. -->
            <select v-if="isManager" v-model="detailTable.server" class="select">
              <option value="">— Unassigned —</option>
              <option v-for="s in assignableServers" :key="s.id" :value="s.fullName">{{ s.fullName }}</option>
              <option v-if="customServerValue" :value="customServerValue">{{ customServerValue }} (kept)</option>
            </select>
            <template v-else>
              <input :value="detailTable.server || '—'" disabled />
              <small class="tm-field-hint">Only a manager can change the assignment</small>
            </template>
          </div>
          <div class="form-group">
            <label>Guest Count</label>
            <input v-model.number="detailTable.guests" type="number" min="0" placeholder="0" />
          </div>
          <div class="form-group">
            <label>Table Notes</label>
            <input v-model="detailTable.notes" placeholder="Special requests, preferences..." />
          </div>
        </div>

        <!-- Active orders for this table -->
        <div class="tm-orders-section" v-if="detailTable.status === 'occupied'">
          <h4>
            Active Orders
            <span v-if="detailTable.payment" class="tm-detail-pay" :class="'pay-' + detailTable.payment">{{ paymentLabel(detailTable.payment) }}</span>
            <span v-if="detailTable.bill_requested_at" class="tm-detail-pay bill-requested">Bill requested{{ detailTable.bill_requested_by ? ` by ${detailTable.bill_requested_by}` : '' }}</span>
          </h4>
          <div v-if="detailOrders.length" class="tm-orders-list">
            <div v-for="o in detailOrders" :key="o.id" class="tm-order-card">
              <div class="tm-order-header">
                <span class="tm-order-id">#{{ shortId(o.id) }}</span>
                <span class="badge" :class="'badge-' + o.status.replace(' ', '-')">{{ o.status }}</span>
                <span class="tm-order-total">{{ formatETB(o.total) }}</span>
              </div>
              <div class="tm-order-items">
                <span v-for="(line, li) in getOrderLines(o)" :key="li" class="tm-order-line">
                  {{ line.qty }}x {{ line.name }}<span v-if="line.modifiers && line.modifiers.length"> ({{ line.modifiers.map(m => m.name || m).join(', ') }})</span>
                </span>
                <span v-if="!getOrderLines(o).length" class="tm-order-line">{{ formatOrderItems(o.items) }}</span>
              </div>
              <div class="tm-order-footer">
                <span class="tm-order-time">{{ formatTime(o.created) }}</span>
                <span v-if="o.customer && o.customer !== 'Walk-in'" class="tm-order-customer">{{ o.customer }}</span>
              </div>
            </div>
          </div>
          <div v-else class="tm-no-orders">No active orders for this table</div>
        </div>

        <!-- Occupancy info -->
        <div v-if="detailTable.status === 'occupied' && detailTable.seated_at" class="tm-occupancy-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Seated {{ occupancyTimer(detailTable) }} ago</span>
          <span v-if="occupancyUrgency(detailTable) === 'overdue'" class="tm-overdue-note">— past the 4h maximum, releases to cleaning automatically</span>
        </div>

        <!-- Actions -->
        <div class="modal-actions tm-detail-actions">
          <!-- An occupied table used to offer only "Go to Checkout", so a seated
               party could never be given a second round: the waiter had to leave
               the floor plan and rebuild the table context by hand. Ordering is
               now always available, and reads "Add Round" once people are seated,
               which is what the action actually means at that point. -->
          <button class="btn btn-primary btn-sm" @click="newOrderForTable">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {{ detailTable.status === 'occupied' ? 'Add Round' : 'New Order' }}
          </button>
          <!-- "Go to Checkout" was rendered for every signed-in user on an
               occupied table, but the floor cannot settle bills — that is the
               cashier's job (see ROLE_PERMISSIONS, where 'checkout' is not
               granted to head-waiter). Without this guard the button rendered
               for waiters and either silently bounced them off the route guard
               or, worse, hit PUT /api/orders/:id with a paymentBreakdown the
               server accepted because the head-waiter has `orders` write. -->
          <!-- Ask for the bill: the waiter's "table X wants the check" write.
               It stamps the table, rides the SSE channel to the cashier's
               screen within seconds, and clears when the bill is settled or
               the waiter retracts it. -->
          <button
            v-if="detailTable.status === 'occupied' && canRequestBill"
            class="btn btn-sm"
            :class="detailTable.bill_requested_at ? 'btn-warning' : 'btn-outline'"
            :disabled="billRequesting"
            @click="detailTable.bill_requested_at ? cancelBillRequest() : requestBill()"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M4 4h16v13H7l-3 3z"/><line x1="9" y1="9" x2="15" y2="9"/></svg>
            {{ billRequesting ? '…' : (detailTable.bill_requested_at ? 'Cancel Bill Request' : 'Ask for the Bill') }}
          </button>
          <button v-if="detailTable.status === 'occupied' && authStore?.hasPermission('checkout')" class="btn btn-outline btn-sm" @click="goToCheckout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Go to Checkout
          </button>
          <button v-if="authStore?.roleKey === 'manager'" class="btn btn-outline btn-sm" @click="generateQrForTable(detailTable)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            QR Code
          </button>
          <div class="tm-actions-spacer"></div>
          <button class="btn btn-secondary" @click="closeDetail">Close</button>
          <button class="btn btn-primary" @click="saveDetail">Save Changes</button>
          <button v-if="authStore?.roleKey === 'manager'" class="btn btn-danger btn-sm tm-delete-separated" @click="deleteTable">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ QR CODE MODAL ═══ -->
    <div class="modal-overlay" v-if="qrModalData" @click.self="qrModalData = null">
      <div class="modal" style="max-width:380px;text-align:center">
        <h3>Table {{ qrModalData.table.number }} QR Code</h3>
        <p class="modal-sub">Guests scan this code to view the menu and order</p>
        <div style="padding:16px;background:#fff;border-radius:8px;margin:16px 0;display:inline-block">
          <img :src="qrImageUrl" alt="QR Code" style="width:180px;height:180px;display:block" />
        </div>
        <div style="font-size:.78rem;color:var(--text-muted);word-break:break-all;margin-bottom:16px">
          {{ qrModalData.url }}
        </div>
        <div class="modal-actions" style="justify-content:center">
          <button class="btn btn-secondary" @click="qrModalData = null">Close</button>
          <button class="btn btn-primary" @click="printQrCard">Print QR Card</button>
        </div>
      </div>
    </div>

    <!-- ═══ ADD TABLE MODAL ═══ -->
    <div class="modal-overlay" v-if="showAddModal" @click.self="showAddModal = false">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Add new table">
        <h3>Add New Table</h3>
        <p class="modal-sub">Configure a new table for the floor plan</p>
        <div class="form-row">
          <div class="form-group">
            <label>Table Number</label>
            <input v-model.number="newTable.number" type="number" min="1" placeholder="e.g. 16" />
          </div>
          <div class="form-group">
            <label>Table Name</label>
            <input v-model="newTable.name" placeholder="e.g. Patio 4" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Capacity (seats)</label>
            <input v-model.number="newTable.capacity" type="number" min="1" placeholder="4" />
          </div>
          <div class="form-group">
            <label>Section</label>
            <select v-model="newTable.section" class="select">
              <option v-for="s in sections" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Shape</label>
          <div class="tm-shape-picker">
            <button v-for="sh in ['round', 'square', 'long']" :key="sh" class="tm-shape-opt" :class="{ active: newTable.shape === sh }" @click="newTable.shape = sh" type="button">
              <svg v-if="sh === 'round'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>
              <svg v-else-if="sh === 'long'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="10" rx="3"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
              <span>{{ sh }}</span>
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showAddModal = false">Cancel</button>
          <button class="btn btn-primary" @click="addTable">Add Table</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted , inject} from 'vue'
import { useRouter } from 'vue-router'
import { apiGet, apiPut, apiPost, apiDelete } from '../api'
import { useSSE } from '../composables/useSSE'
import { useAudioAlerts } from '../composables/useAudioAlerts'
import { useAuthStore } from '../stores/auth'
import { useOrderStore } from '../stores/order'
import { formatOrderItems } from '../lib/formatters'
import { occupancyUrgency } from '../lib/tableUrgency'
import { isResumableCheck, latestResumableCheck } from '../lib/openChecks'
import { mergeSections } from '../lib/sections'

const router = useRouter()

const toast = inject('toast')
const confirmDelete = inject('confirm')
const authStore = useAuthStore()
const orderStore = useOrderStore()
// Two independent SSE channels:
//   1. `tables` — the floor plan (existing): every table row, pushed when
//      status/assignment changes.
//   2. `kitchen` — every active order (new): used to detect when a dish
//      assigned to one of THIS waiter's tables has just become ready, so the
//      waiter hears a chime without watching the kitchen board.
// `useSSE()` returns a self-contained instance (its own EventSource and
// listener map), so a second call here does not collide with the first.
const { connected: sseConnected, connect: sseConnect, disconnect: sseDisconnect, on: sseOn } = useSSE()
const { connected: kitchenSseConnected, connect: kitchenSseConnect, disconnect: kitchenSseDisconnect, on: kitchenSseOn } = useSSE()
const { playNewOrder, playOrderReady } = useAudioAlerts()

const tables = ref([])
const orders = ref([])
const loading = ref(true)
// The floor's zones. Ships with the defaults so the page renders instantly
// and works offline; the server's list (settings key tables.sections, edited
// by the manager in the backoffice) replaces this the moment it arrives, and
// any zone that exists only on tables is unioned in so a table can never
// fall out of the picker because the setting moved on.
const DEFAULT_SECTIONS = ['Patio', 'Main Hall', 'Window', 'VIP Room', 'Bar']
const sections = ref([...DEFAULT_SECTIONS])
const allSections = computed(() => ['All', ...sections.value])
const activeSection = ref('All')
const statusFilter = ref('')
const detailTable = ref(null)
const detailOrders = ref([])
const showAddModal = ref(false)
const statuses = ['available', 'occupied', 'reserved', 'cleaning']
let timerInterval = null
const tick = ref(0) // Reactive trigger for timer updates

const newTable = ref({ number: '', name: '', capacity: 4, section: 'Main Hall', shape: 'square' })
const releasing = ref(false)
// Mirrors GRACE_MIN in the worker. Only ever displayed - the rule itself is
// enforced server-side, so a stale copy here misinforms but cannot let anyone
// seat a table they should not.
const graceMinutes = 15
// Mirrors SEATING_LEAD_MIN. Display only; the server decides what blocks.
const leadMinutes = 60

const isManager = computed(() => authStore?.roleKey === 'manager')

// ─── Server assignment (manager-only) ───
// Roster of who can be assigned. Head-waiters are the floor staff; the list
// comes from the staff roster so the stored name always matches the name the
// waiter logs in with — a typo here would leave the waiter staring at an
// empty floor plan, because GET /tables scopes their list by this name.
const staffServers = ref([])
const assignableServers = computed(() =>
  staffServers.value
    .filter((s) => String(s.role || '').toLowerCase() === 'head-waiter' && String(s.status || 'active').toLowerCase() === 'active')
    .map((s) => ({ id: s.id, fullName: `${String(s.firstName || '').trim()} ${String(s.lastName || '').trim()}`.trim() }))
    .filter((s) => s.fullName)
)
// A name already on the table that the roster does not know about (typed
// before this dropdown existed) stays visible and selectable instead of
// silently jumping to "Unassigned" on open.
const customServerValue = computed(() => {
  const cur = String(detailTable.value?.server || '').trim()
  if (!cur) return ''
  return assignableServers.value.some((s) => s.fullName.toLowerCase() === cur.toLowerCase()) ? '' : cur
})
async function loadStaffServers() {
  if (!isManager.value || staffServers.value.length) return
  try {
    staffServers.value = (await apiGet('staff')) || []
  } catch {
    staffServers.value = []
  }
}

const qrModalData = ref(null)
const qrImageUrl = computed(() => {
  if (!qrModalData.value || !qrModalData.value.url) return ''
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModalData.value.url)}`
})

async function generateQrForTable(table) {
  if (!table) return
  try {
    const res = await apiPost(`tables/${table.id}/qr`)
    if (res && res.ok) {
      qrModalData.value = res
      toast(`QR Code generated for Table ${table.number}`, 'success')
    } else {
      toast(res?.error || 'Could not generate QR code', 'error')
    }
  } catch (e) {
    toast(e.message || 'QR generation failed', 'error')
  }
}

function printQrCard() {
  if (!qrModalData.value) return
  const w = window.open('', '_blank', 'width=420,height=560')
  if (!w) {
    toast('Allow pop-ups to print QR card', 'error')
    return
  }
  w.document.write(`<!doctype html><html><head><title>Table ${qrModalData.value.table.number} QR</title>
  <style>body{font-family:sans-serif;text-align:center;padding:20px} .card{border:2px solid #000;border-radius:12px;padding:24px;display:inline-block}</style></head>
  <body><div class="card">
    <h2>FU FUT COFFEE</h2>
    <h3>Table ${qrModalData.value.table.number}</h3>
    <img src="${qrImageUrl.value}" width="180" height="180" style="margin:12px 0"/>
    <p>Scan to view menu & order from your table</p>
  </div></body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 200)
}

/** The live hold for the table open in the panel, read from the tables feed. */
const detailHold = computed(() => {
  if (!detailTable.value) return null
  const row = tables.value.find(t => t.id === detailTable.value.id)
  return (row && row.reservedHold) || null
})

/**
 * "holding until 19:30" or "from 18:00" — whichever the waiter needs to know.
 * Before the sitting starts, the useful fact is when the guests are due; once
 * it has started, it is when the table frees up.
 */
function holdWindowLabel(hold) {
  if (!hold) return ''
  const start = new Date(hold.startAt)
  const end = new Date(hold.endAt)
  const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  return Date.now() < start.getTime() ? `from ${fmt(start)}` : `until ${fmt(end)}`
}

async function releaseHold() {
  const hold = detailHold.value
  if (!hold || releasing.value) return
  if (!await confirmDelete(`Release Table ${detailTable.value.number} and cancel ${hold.name || 'this booking'}?`)) return
  releasing.value = true
  try {
    await apiPost(`reservations/${hold.id}/release`, {})
    toast('Table released')
    await loadTables()
  } catch (e) {
    toast(e.message || 'Could not release the table', 'error')
  } finally {
    releasing.value = false
  }
}

// ─── Computed ───

const filteredTables = computed(() => {
  let t = tables.value
  if (activeSection.value !== 'All') t = t.filter(x => x.section === activeSection.value)
  if (statusFilter.value) t = t.filter(x => x.status === statusFilter.value)
  return t
})

/**
 * The status strip doubles as the floor filter. Tapping the same chip twice
 * clears it, so getting back to the whole floor never needs a separate "All"
 * control competing for space with the four that matter.
 */
function toggleStatusFilter(key) {
  statusFilter.value = statusFilter.value === key ? '' : key
}

const statusSummary = computed(() => [
  { key: 'available', label: 'Free', count: availableCount.value, sub: `${availableSeats.value} seats` },
  { key: 'occupied', label: 'Seated', count: occupiedCount.value, sub: `${occupiedGuests.value} guests` },
  { key: 'reserved', label: 'Reserved', count: reservedCount.value, sub: 'today' },
  { key: 'cleaning', label: 'Cleaning', count: cleaningCount.value, sub: 'to reset' }
])

/**
 * Stable colour per server name. Hashing the name rather than assigning from a
 * rota means the mapping survives reloads and needs no storage, and a fixed
 * saturation/lightness keeps every badge legible against white text in both
 * themes instead of occasionally landing on yellow.
 */
function serverColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return { background: `hsl(${h} 55% 34%)` }
}

function serverInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

const visibleSections = computed(() => {
  if (activeSection.value !== 'All') return [activeSection.value]
  // Hide sections that have zero tables after the current filter
  return sections.value.filter(s => filteredTables.value.some(t => t.section === s))
})

function sectionTables(section) {
  return filteredTables.value.filter(t => t.section === section)
}

const availableCount = computed(() => tables.value.filter(t => t.status === 'available').length)
const occupiedCount = computed(() => tables.value.filter(t => t.status === 'occupied').length)
const reservedCount = computed(() => tables.value.filter(t => t.status === 'reserved').length)
const cleaningCount = computed(() => tables.value.filter(t => t.status === 'cleaning').length)
const occupancyPercent = computed(() => {
  if (!tables.value.length) return 0
  return Math.round((occupiedCount.value / tables.value.length) * 100)
})
const availableSeats = computed(() => tables.value.filter(t => t.status === 'available').reduce((s, t) => s + (t.capacity || 0), 0))
const occupiedGuests = computed(() => tables.value.filter(t => t.status === 'occupied').reduce((s, t) => s + (t.guests || 0), 0))

// ─── Table order data (computed from all orders) ───

const tableOrderCounts = computed(() => {
  const map = {}
  const active = orders.value.filter(o => !['completed', 'cancelled', 'fulfilled'].includes(o.status))
  for (const o of active) {
    const tn = o.table_number || o.tableNum || ''
    if (!tn) continue
    const tbl = tables.value.find(t => String(t.number) === String(tn))
    if (!tbl) continue
    map[tbl.id] = (map[tbl.id] || 0) + 1
  }
  return map
})

const tableOrderTotals = computed(() => {
  const map = {}
  const active = orders.value.filter(o => !['completed', 'cancelled', 'fulfilled'].includes(o.status))
  for (const o of active) {
    const tn = o.table_number || o.tableNum || ''
    if (!tn) continue
    const tbl = tables.value.find(t => String(t.number) === String(tn))
    if (!tbl) continue
    map[tbl.id] = (map[tbl.id] || 0) + (o.total || 0)
  }
  return map
})

/**
 * Map of table ID → open (unpaid, non-cancelled) order, so the floor plan
 * can badge tables that have a running tab the waiter hasn't settled yet.
 */
const tableOpenTab = computed(() => {
  const map = {}
  const open = orders.value.filter(isResumableCheck)
  for (const o of open) {
    const tn = o.table_number || o.tableNum || ''
    if (!tn) continue
    const tbl = tables.value.find(t => String(t.number) === String(tn))
    if (!tbl) continue
    // Keep the latest open order per table
    if (!map[tbl.id] || new Date(o.created) > new Date(map[tbl.id].created)) {
      map[tbl.id] = o
    }
  }
  return map
})

// ─── Timer ───

function occupancyTimer(t) {
  if (!t.seated_at) return ''
  const seated = new Date(t.seated_at).getTime()
  const now = Date.now()
  const diff = Math.max(0, Math.floor((now - seated) / 1000))
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return 'just now'
}

// ─── Helpers ───

function formatETB(n) {
  return (n || 0).toLocaleString() + ' ETB'
}

function shortId(id) {
  return id ? id.slice(-5).toUpperCase() : '?'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getOrderLines(o) {
  if (o.order_items && Array.isArray(o.order_items) && o.order_items.length) return o.order_items
  if (o.orderItems && Array.isArray(o.orderItems) && o.orderItems.length) return o.orderItems
  if (typeof o.items === 'string' && (o.items.trim().startsWith('[') || o.items.trim().startsWith('{'))) {
    try {
      const parsed = JSON.parse(o.items.trim())
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map(i => {
        if (typeof i === 'string') return { qty: 1, name: i, modifiers: [] }
        return {
          qty: i.qty || i.quantity || 1,
          name: i.name || i.title || 'Item',
          modifiers: Array.isArray(i.modifiers) ? i.modifiers.map(m => ({ name: typeof m === 'string' ? m : m.name })) : []
        }
      })
    } catch {}
  }
  return []
}

// ─── Orders guests placed themselves ───
//
// Held back from the kitchen until somebody on the floor accepts them. See the
// strip in the template, and the SQL in the API's kitchen board query.

const pendingOrders = ref([])
const accepting = ref(null)

async function loadPending() {
  try {
    pendingOrders.value = (await apiGet('orders/pending')) || []
  } catch (e) {
    // A waiter cannot act on this failing, and the floor plan itself is the
    // important thing on this screen — so it stays quiet and tries again on the
    // next refresh.
    pendingOrders.value = []
  }
}

async function acceptOrder(order) {
  if (accepting.value) return
  accepting.value = order.id
  try {
    await apiPost(`orders/${order.id}/accept`, {})
    // Drop it immediately rather than waiting for the reload: the waiter has
    // just tapped it and needs to see that it went.
    pendingOrders.value = pendingOrders.value.filter(o => o.id !== order.id)
    playNewOrder()
    toast(`Sent to the kitchen — ${tableLabel(order.tableNum)}`, 'success')
    await loadOrders()
  } catch (e) {
    toast(e.message || 'Could not accept that order', 'error')
  } finally {
    accepting.value = null
  }
}

/** "T4" is how the system names it; a waiter reads "Table 4". */
function tableLabel(id) {
  if (!id) return 'No table'
  const m = String(id).match(/^T?(\d+)$/i)
  return m ? `Table ${m[1]}` : String(id)
}

/** How long the guest has been waiting for somebody to look. */
function waitingFor(created) {
  if (!created) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(created.replace(' ', 'T') + 'Z').getTime()) / 60000))
  if (!Number.isFinite(mins)) return ''
  return mins < 1 ? 'just now' : `${mins} min`
}

/** The order's lines, short enough to read at a glance. */
function summarise(items) {
  let list = items
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { return list }
  }
  if (!Array.isArray(list)) return ''
  return list.map(i => `${i.qty || 1}x ${i.name}`).join(', ')
}

// ─── Data loading ───

async function loadTables() {
  try { tables.value = await apiGet('tables') } catch (e) { console.error('Failed to load tables', e) }
}

/**
 * The zone list, from the same source the manager edits.
 *
 * Server order wins; zones found on tables but missing from the list are
 * appended (case-insensitive), because a table whose zone vanished from the
 * picker would be unfilterable and unassignable. A failed read — the till is
 * offline, the request timed out — is not an error: the last known list (or
 * the defaults) keeps the floor working.
 */
async function loadSections() {
  try {
    const res = await apiGet('tables/sections')
    const merged = mergeSections(res?.sections, tables.value)
    if (merged.length) sections.value = merged
  } catch (e) {
    console.warn('Zone list unavailable — keeping the last known zones', e?.message || e)
  }
}

/**
 * Orders the floor plan still cares about: kitchen-flow tickets whatever their
 * payment state, plus served-but-unpaid tabs. A fulfilled ticket that HAS been
 * paid is history and stays off the board. Filtering 'fulfilled' outright —
 * what this used to do — is what hid unpaid tabs from "Add Round", the
 * open-tab badge and the table dialog the moment the chef marked food served.
 */
function floorRelevant(o) {
  const status = String(o.status || '').toLowerCase()
  if (status === 'completed' || status === 'cancelled') return false
  const terminal = status === 'fulfilled' || status === 'served'
  return !(terminal && String(o.payment_status || '').toLowerCase() === 'paid')
}

async function loadOrders() {
  try {
    const all = await apiGet('orders') || []
    orders.value = all.filter(floorRelevant)
  } catch (e) { console.error('Failed to load orders', e) }
}

async function refreshAll() {
  await Promise.all([loadTables(), loadOrders(), loadPending()])
  toast('Refreshed', 'info')
}

// ─── SSE ───

function toggleSSE() {
  if (sseConnected.value) {
    sseDisconnect()
  } else {
    sseConnect('tables')
  }
}

// Previous `ready` status per order id, used to detect a transition INTO ready.
// Without this, every SSE tick that finds a ready order would re-chime — the
// waiter would hear it every 10s until the order is served, which is worse
// than no notification at all. We snapshot BEFORE applying the new payload,
// compare, then replace.
const prevOrderStatuses = ref(new Map())

/**
 * The set of table ids the signed-in waiter is responsible for right now.
 *
 * `tables.value` is already scoped to the signed-in waiter by GET /api/tables
 * (the server filters by `tables.server` matching the staff display name for
 * the head-waiter role — see fufut-api/src/handlers/tables.js). For other roles
 * (manager, cashier) `tables.value` is the full floor plan — they hear chimes
 * for every ready table, which is the right thing for them too: a manager wants
 * to know if any table's food is sitting at the pass.
 */
function myTableIds() {
  return new Set(tables.value.map((t) => String(t.id)))
}

function onKitchenSnapshot(payload) {
  if (!payload || !Array.isArray(payload.orders)) return
  const next = payload.orders
  const myTables = myTableIds()
  if (!myTables.size) {
    // No tables loaded yet (or none assigned to this waiter) — still keep the
    // previous-status map fresh so the first real snapshot doesn't fire a
    // chime for an order that was already ready before we connected.
    prevOrderStatuses.value = new Map(next.map((o) => [o.id, o.status]))
    return
  }
  const prev = prevOrderStatuses.value
  const newlyReady = []
  for (const o of next) {
    // An order belongs to one of the waiter's tables when its table_id (or
    // legacy table_number) matches one of the table ids they can see. Both
    // fields are normalised to strings on the server, so this is a string
    // comparison.
    const tid = String(o.table_id || o.table_number || o.tableNum || '')
    if (!tid || !myTables.has(tid)) continue
    const was = prev.get(o.id)
    const now = o.status
    if (now === 'ready' && was !== 'ready') {
      newlyReady.push(o)
    }
  }
  // Replace the snapshot for the next tick.
  prevOrderStatuses.value = new Map(next.map((o) => [o.id, o.status]))
  // Sound + toast per newly-ready order. Cap at 3 so a chef hitting "Mark all
  // ready" on a 10-top board does not chime ten times in one tick.
  for (const o of newlyReady.slice(0, 3)) {
    playOrderReady()
    const tid = o.table_id || o.table_number || o.tableNum || ''
    toast(`Table ${tid} — order ready, pick up from the pass`, 'success')
  }
}

function setupSSE() {
  sseConnect('tables')
  sseOn('table_update', () => loadTables())
  // The `tables` channel only emits `table_update` — these two registrations
  // are dead code today, but kept for back-compat with any future server-side
  // push on the same channel.
  sseOn('new_order', () => loadOrders())
  sseOn('order_update', () => loadOrders())

  // Second channel: the kitchen. The server pushes a snapshot of every active
  // order every 10s (handlers/sse.js). We diff against the previous snapshot
  // and chime when one of OUR tables' orders transitioned INTO ready.
  kitchenSseConnect('kitchen')
  // The server emits `new_order` for every snapshot, not just new tickets —
  // the event name is historical. We treat it as "snapshot arrived".
  kitchenSseOn('new_order', onKitchenSnapshot)
}

// ─── Detail panel ───

async function openDetail(t) {
  detailTable.value = { ...t }
  loadStaffServers()
  // Load orders for this specific table
  const tn = String(t.number)
  try {
    // Open checks only: the list is what the table owes. Served-but-unpaid
    // counts — that is the normal state of a table between the kitchen
    // finishing and the guest leaving, and hiding it made "No active orders"
    // render over a tab of hundreds of birr.
    detailOrders.value = (await apiGet(`orders?table_number=${tn}`) || []).filter(isResumableCheck)
  } catch {
    detailOrders.value = []
  }
}

function closeDetail() {
  detailTable.value = null
  detailOrders.value = []
}

function quickStatus(status) {
  if (!detailTable.value) return
  const prev = detailTable.value.status
  detailTable.value.status = status
  // Auto-set/clear seated_at
  if (status === 'occupied' && prev !== 'occupied') {
    detailTable.value.seated_at = new Date().toISOString()
    // Tells the server this is a party arriving, not an edit to the one already
    // there, so it refuses if somebody claimed the table in the meantime.
    detailTable.value.newSeating = true
  } else if (status !== 'occupied') {
    detailTable.value.seated_at = ''
    detailTable.value.newSeating = false
    if (status === 'available') {
      // Guests clear with the party; the section owner (`server`) stays —
      // the waiter's Orders scoping matches on that name. Reassignment is
      // the dropdown's job, not a side effect of freeing the table.
      detailTable.value.guests = 0
    }
  }
}

async function saveDetail() {
  if (!detailTable.value) return
  try {
    await apiPut('tables/' + detailTable.value.id, detailTable.value)
    toast('Table updated')
    closeDetail()
    await loadTables()
  } catch (e) {
    // The server refuses seating a held table with an explanation; showing the
    // generic "Failed to update" instead would leave the waiter guessing why a
    // table they can see is empty will not accept a party.
    toast(e.message || 'Failed to update', 'error')
    await loadTables()
  }
}

async function deleteTable() {
  if (!detailTable.value) return
  if (!await confirmDelete(`Delete Table ${detailTable.value.number}? This cannot be undone.`)) return
  try {
    await apiDelete('tables', detailTable.value.id)
    toast('Table deleted')
    closeDetail()
    await loadTables()
  } catch { toast('Failed to delete', 'error') }
}

// ─── Bill request: the floor's "bring the check" write ───
//
// Who may raise one mirrors the server gate exactly (head-waiter, manager —
// the roles holding `tables` write). The cashier is the recipient, not the
// asker; their screen clears the request by settling the bill.
const billRequesting = ref(false)
const canRequestBill = computed(() => ['head-waiter', 'manager'].includes(authStore?.roleKey))

function paymentLabel(state) {
  return { paid: 'Paid', partial: 'Partly Paid', unpaid: 'Unpaid' }[state] || state
}

async function requestBill() {
  if (!detailTable.value || billRequesting.value) return
  billRequesting.value = true
  try {
    const res = await apiPost(`tables/${detailTable.value.id}/request-bill`, {})
    detailTable.value.bill_requested_at = res?.requestedAt || new Date().toISOString()
    const t = tables.value.find((x) => x.id === detailTable.value.id)
    if (t) t.bill_requested_at = detailTable.value.bill_requested_at
    toast(res?.alreadyRequested ? 'Bill already requested' : `Bill requested for table ${detailTable.value.number}`)
  } catch (e) {
    toast(e?.message || 'Could not request the bill', 'error')
  } finally {
    billRequesting.value = false
  }
}

async function cancelBillRequest() {
  if (!detailTable.value || billRequesting.value) return
  billRequesting.value = true
  try {
    await apiPost(`tables/${detailTable.value.id}/cancel-bill-request`, {})
    detailTable.value.bill_requested_at = ''
    const t = tables.value.find((x) => x.id === detailTable.value.id)
    if (t) t.bill_requested_at = ''
    toast('Bill request cancelled')
  } catch (e) {
    toast(e?.message || 'Could not cancel the request', 'error')
  } finally {
    billRequesting.value = false
  }
}

// ─── New Order / Checkout for table ───

async function newOrderForTable() {
  if (!detailTable.value) return
  const tableNum = detailTable.value.number
  const t = detailTable.value
  closeDetail()

  // Check if this table has an open (unpaid) order to resume. Served-but-
  // unpaid counts: "Add Round" after the kitchen has finished is how dessert
  // and after-dinner coffee are sold — see lib/openChecks.js for why the old
  // 'fulfilled' exclusion leaked the first check at the till.
  const latest = t.status === 'occupied' ? latestResumableCheck(orders.value, tableNum) : null

  if (latest) {
    // Resume the existing open tab
    orderStore.isAddRound = true
    orderStore.activeOpenOrderId = latest.id
    orderStore.tableNum = String(tableNum)
    orderStore.orderType = 'dine-in'
  } else {
    // Fresh order
    orderStore.isAddRound = false
    orderStore.activeOpenOrderId = null
  }

  router.push('/app/menu-view?table=' + tableNum)
}

function goToCheckout() {
  const t = detailTable.value
  closeDetail()
  // If this table has an open tab, wire it into the checkout so it
  // settles via PUT instead of creating a duplicate order via POST.
  // Served-but-unpaid tabs count — that is the normal state of a table
  // between the kitchen finishing and the guest leaving.
  if (t) {
    const latest = latestResumableCheck(orders.value, t.number)
    if (latest) {
      orderStore.activeOpenOrderId = latest.id
      orderStore.tableNum = String(t.number)
      orderStore.orderType = 'dine-in'
    }
  }
  router.push('/app/checkout')
}

// ─── Add table ───

function openAddTable() {
  const maxNum = tables.value.reduce((m, t) => Math.max(m, t.number || 0), 0)
  // Default to the first zone the manager arranged — not a hardcoded room
  // that may not exist on a floor they have reshaped.
  const defaultZone = sections.value[0] || 'Main Hall'
  newTable.value = { number: maxNum + 1, name: '', capacity: 4, section: defaultZone, shape: 'square' }
  showAddModal.value = true
}

async function addTable() {
  if (!newTable.value.number) { toast('Table number is required', 'error'); return }
  try {
    await apiPost('tables', {
      ...newTable.value,
      status: 'available',
      server: '', guests: 0, seated_at: '', notes: ''
    })
    toast('Table added')
    showAddModal.value = false
    await loadTables()
  } catch { toast('Failed to add table', 'error') }
}

// ─── Lifecycle ───

let pendingInterval = null

onMounted(async () => {
  await Promise.all([loadTables(), loadOrders(), loadPending()])
  // Zones read after the tables land so the first merge already unions any
  // legacy section values sitting on rows.
  await loadSections()
  loading.value = false
  setupSSE()
  timerInterval = setInterval(() => {
    // Trigger reactive update for occupancy timers without full re-render
    tick.value++
  }, 10000)
  // A guest sitting at a table has no way to chase anybody, so the floor has
  // to notice on its own. Half a minute is often enough to feel prompt without
  // making the screen busy.
  pendingInterval = setInterval(loadPending, 30000)
})

onUnmounted(() => {
  sseDisconnect()
  kitchenSseDisconnect()
  if (timerInterval) clearInterval(timerInterval)
  if (pendingInterval) clearInterval(pendingInterval)
})
</script>

<style scoped>
/* Assignment is read-only for everyone but the manager; the hint says why
   so the disabled field reads as a rule, not as a bug. */
.tm-field-hint {
  display: block;
  margin-top: 6px;
  font-size: .72rem;
  color: var(--neutral-500, #6b7280);
}
/* Orders waiting for a waiter. Deliberately loud — a guest is sitting there
   wondering whether anybody saw it. */
.tm-pending {
  margin: 10px 0 14px;
  border: 1px solid var(--warning, #b45309);
  border-radius: 10px;
  background: color-mix(in srgb, var(--warning, #b45309) 8%, transparent);
  padding: 10px 12px;
}
.tm-pending-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.tm-pending-hint { font-size: .78rem; opacity: .75; }
.tm-pending-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
.tm-pending-card {
  background: var(--surface, #fff);
  border: 1px solid var(--border, rgba(0,0,0,.12));
  border-radius: 8px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 6px;
}
.tm-pending-where { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tm-pending-table { font-weight: 700; display: flex; align-items: center; gap: 6px; }
.tm-pending-ago { font-size: .75rem; opacity: .7; }
.tm-source-badge {
  display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 999px;
  font-size: .65rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  line-height: 1.4;
}
.tm-source-badge.source-qr { background: var(--teal-100, #ccfbf1); color: var(--primary, #0F7B78); }
.tm-source-badge.source-staff { background: var(--neutral-100, #f5f5f4); color: var(--text-muted); }
.tm-pending-items { font-size: .85rem; line-height: 1.35; }
.tm-pending-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tm-pending-total { font-weight: 600; }
@media (max-width: 640px) {
  .tm-pending-list { grid-template-columns: 1fr; }
}
/* Toolbar — removes duplicate title from topbar */
.tm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.tm-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.tm-toolbar-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-heading);
}
.tm-toolbar-sub {
  font-size: .78rem;
  color: var(--text-muted);
  font-weight: 400;
}

/* ═══ STATUS STRIP ═══
   Replaces the four-card KPI grid. Same numbers, roughly a fifth of the height,
   and each chip filters the floor. Chips stay 44px tall: the type around them
   shrank with the 80% root, fingers did not. */
.tm-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.tm-chip {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 44px;
  padding: 8px 12px 8px 22px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease);
}
.tm-chip:hover { border-color: var(--border-strong); }
.tm-chip.active { border-color: var(--primary); background: var(--teal-50); }
.tm-chip-dot {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.tm-chip.available .tm-chip-dot { background: var(--success); }
.tm-chip.occupied  .tm-chip-dot { background: var(--info); }
.tm-chip.reserved  .tm-chip-dot { background: var(--warning); }
.tm-chip.cleaning  .tm-chip-dot { background: var(--neutral-400); }
.tm-chip-num {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-heading);
  font-family: var(--font-mono);
  line-height: 1;
}
.tm-chip-label { font-size: .82rem; font-weight: 600; color: var(--text-body); }
.tm-chip-sub { font-size: .78rem; color: var(--text-muted); margin-left: auto; }

/* ═══ RESERVATION HOLD ═══ */
.tm-hold {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 5px;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--gold-50, #FFFBEB);
  border: 1px solid var(--warning);
  color: var(--warning-text);
}
/* A booking later today is information, not an obstruction, so it is muted
   rather than carrying the same warning colour as a table that genuinely
   cannot be seated right now. */
.tm-hold.is-upcoming {
  background: transparent;
  border-color: var(--border);
  color: var(--text-muted);
}
.tm-hold svg { width: 12px; height: 12px; flex-shrink: 0; margin-top: 1px; }
.tm-hold-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.tm-hold-text strong {
  font-size: .78rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tm-hold-when { font-size: .78rem; font-family: var(--font-mono); }

.tm-hold-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0 28px 4px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--gold-50, #FFFBEB);
  border: 1.5px solid var(--warning);
}
.tm-hold-banner-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 200px; }
.tm-hold-banner-main strong { font-size: .88rem; color: var(--text-heading); }
.tm-hold-banner-main span { font-size: .82rem; color: var(--text-body); }
/* The rule is spelled out rather than implied by a disabled control: a waiter
   needs to know both why they cannot seat it and when it frees itself. */
.tm-hold-rule { color: var(--warning-text) !important; font-weight: 500; }

/* ═══ TILE VITALS ═══ */
.tm-vitals {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
}
/* Spend sits opposite the timer in mono, so the two numbers a waiter compares
   across a room line up column-wise instead of reflowing with name length. */
.tm-spend {
  font-family: var(--font-mono);
  font-size: .88rem;
  font-weight: 700;
  color: var(--text-heading);
  white-space: nowrap;
}
.tm-guests, .tm-ordercount { font-size: .78rem; color: var(--text-muted); }
.tm-noorder { font-size: .78rem; color: var(--warning-text); font-weight: 600; }

/* Initials badge. 22px is below the 44px touch minimum on purpose - it is a
   label, not a control; the whole tile is the tap target. */
.tm-server-badge {
  margin-left: auto;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 999px;
  color: #fff;
  font-size: .78rem;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
  letter-spacing: .02em;
  flex-shrink: 0;
}

/* Open-tab badge on the floor plan tile. */
.tm-tab-badge {
  display: inline-block;
  padding: 2px 7px;
  border-radius: var(--radius-sm, 4px);
  background: var(--warning, #f59e0b);
  color: #fff;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .02em;
  line-height: 1.3;
  margin-left: auto;
  flex-shrink: 0;
  white-space: nowrap;
}
:global([data-theme="dark"]) .tm-tab-badge {
  background: #b45309;
}

/* The money state of the party's checks, on the tile and in the detail
   panel. Paid is calm (the party can leave), unpaid is the ordinary state of
   a sitting table, partial is "some money is down". */
.tfc-pay-badge, .tm-detail-pay {
  display: inline-block;
  padding: 2px 7px;
  border-radius: var(--radius-sm, 4px);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .02em;
  line-height: 1.3;
  white-space: nowrap;
  flex-shrink: 0;
}
.tfc-pay-badge.pay-unpaid { background: rgba(245, 158, 11, .16); color: #b45309; }
.tfc-pay-badge.pay-partial { background: rgba(59, 130, 246, .16); color: #1d4ed8; }
.tfc-pay-badge.pay-paid { background: rgba(16, 185, 129, .16); color: #047857; }
:global([data-theme="dark"]) .tfc-pay-badge.pay-unpaid { background: rgba(245, 158, 11, .22); color: #fbbf24; }
:global([data-theme="dark"]) .tfc-pay-badge.pay-partial { background: rgba(59, 130, 246, .22); color: #93c5fd; }
:global([data-theme="dark"]) .tfc-pay-badge.pay-paid { background: rgba(16, 185, 129, .22); color: #34d399; }
.tm-detail-pay { margin-left: 10px; }
.tm-detail-pay.pay-unpaid { background: rgba(245, 158, 11, .16); color: #b45309; }
.tm-detail-pay.pay-partial { background: rgba(59, 130, 246, .16); color: #1d4ed8; }
.tm-detail-pay.pay-paid { background: rgba(16, 185, 129, .16); color: #047857; }
.tm-detail-pay.bill-requested { background: rgba(239, 68, 68, .14); color: #b91c1c; }

/* The "Bill Requested" chip on the tile — the cashier's screen and the floor
   plan must agree that somebody asked for the check. */
.tfc-bill-req {
  display: inline-block;
  padding: 2px 7px;
  border-radius: var(--radius-sm, 4px);
  background: #dc2626;
  color: #fff;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .02em;
  line-height: 1.3;
  animation: bill-req-pulse 1.6s ease-in-out infinite;
  flex-shrink: 0;
  white-space: nowrap;
}
@keyframes bill-req-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .55; }
}
:global([data-theme="dark"]) .tfc-bill-req { background: #b91c1c; }
@media (prefers-reduced-motion: reduce) {
  .tfc-bill-req { animation: none; }
}

/* Four chips across stop being readable well before the phone breakpoint - the
   sub-label collides with the count around 700px - so they go 2-up there and the
   sub-label drops entirely on phones rather than wrapping to a third line. */
@media (max-width: 700px) {
  .tm-strip { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 420px) {
  .tm-chip-sub { display: none; }
}

/* KPI icon wraps */
.kpi-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.kpi-icon-wrap.teal-bg { background: var(--teal-50); color: var(--primary); }
.kpi-icon-wrap.blue-bg { background: var(--blue-50); color: var(--info); }
.kpi-icon-wrap.gold-bg { background: var(--gold-50); color: var(--warning); }
.kpi-icon-wrap.neutral-bg { background: var(--neutral-50); color: var(--neutral-500); }

/* Empty section state */
.tm-empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 20px;
  text-align: center;
}
.tm-empty-section .empty-state-icon {
  background: var(--neutral-50);
}
.empty-state-text {
  font-size: .9rem;
  font-weight: 600;
  color: var(--text-heading);
  margin-top: 12px;
}
.empty-state-hint {
  font-size: .8rem;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Detail modal close button */
.tm-detail-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--neutral-50);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast) var(--ease);
  flex-shrink: 0;
}
.tm-detail-close:hover {
  background: var(--neutral-100);
  border-color: var(--border-strong);
}

/* Detail modal actions */
.tm-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tm-actions-spacer {
  flex: 1;
}
.tm-delete-separated {
  margin-left: 8px;
}

/* ═══ ZONE PICKER ═══
   Replaced the zone chip row (see the template comment for why). The select
   is styled as a plain rectangle on purpose: --radius-sm, not 999px, so no
   label length can ever turn it into a circle. The chevron is a data-URI so
   appearance:none cannot leave it native and inconsistent across browsers. */
.tm-zonepick {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.tm-zonepick-label {
  font-size: .78rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .06em;
  flex-shrink: 0;
}
.tm-zonepick-select {
  appearance: none;
  -webkit-appearance: none;
  flex: 0 1 260px;
  min-width: 200px;
  max-width: 100%;
  min-height: 44px;
  padding: 8px 36px 8px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  background:
    url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat right 14px center,
    var(--surface);
  color: var(--text-heading);
  font-size: .88rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color .15s;
}
.tm-zonepick-select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.tm-zonepick-select:hover { border-color: var(--border-strong); }
:global([data-theme="dark"]) .tm-zonepick-select {
  background:
    url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat right 14px center,
    var(--surface);
}

/* Refresh icon button */
.tm-refresh-btn {
  padding: 6px 8px;
}

/* Neutral KPI bar */
.kpi-bar.neutral {
  background: linear-gradient(90deg, var(--neutral-400), var(--neutral-300));
}

/* Dark mode KPI icon wraps */
:global([data-theme="dark"]) .kpi-icon-wrap.teal-bg { background: rgba(15,123,120,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.blue-bg { background: rgba(37,99,235,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.gold-bg { background: rgba(181,101,29,.15); }
:global([data-theme="dark"]) .kpi-icon-wrap.neutral-bg { background: rgba(154,149,137,.15); }
:global([data-theme="dark"]) .tm-detail-close { background: var(--neutral-50); border-color: var(--border); }
</style>
