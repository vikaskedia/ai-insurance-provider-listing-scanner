<template>
  <div class="app-layout dark">
    <!-- Header Bar -->
    <header class="app-header">
      <div class="header-inner">
        <div class="header-left">
          <h1 class="header-title">📋 Provider Scan Report</h1>
          <span class="header-meta">{{ headerSubtitle }}</span>
        </div>
        <div class="stat-pills">
          <div class="pill pill-total"><strong>{{ stats.total }}</strong> Total</div>
          <div class="pill pill-found"><strong>{{ stats.found }}</strong> Found</div>
          <div class="pill pill-notfound"><strong>{{ stats.notFound }}</strong> Missing</div>
          <div class="pill pill-error"><strong>{{ stats.errors }}</strong> Errors</div>
        </div>
      </div>
    </header>

    <!-- Toolbar: Filters + Actions -->
    <div class="toolbar">
      <div class="toolbar-inner">
        <div class="filter-group">
          <el-select v-model="filters.insurance" placeholder="Insurance" clearable filterable size="small" style="width:170px" @change="applyFilters">
            <el-option v-for="item in filterOptions.insurances" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.provider" placeholder="Provider" clearable filterable size="small" style="width:170px" @change="applyFilters">
            <el-option v-for="item in filterOptions.providers" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.location" placeholder="Location" clearable filterable size="small" style="width:150px" @change="applyFilters">
            <el-option v-for="item in filterOptions.locations" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="filters.status" placeholder="Status" clearable size="small" style="width:120px" @change="applyFilters">
            <el-option label="Found" value="found" />
            <el-option label="Not Found" value="not_found" />
            <el-option label="Blocked" value="blocked" />
            <el-option label="Error" value="error" />
          </el-select>
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            size="small"
            range-separator="–"
            start-placeholder="From"
            end-placeholder="To"
            style="width: 220px"
            value-format="YYYY-MM-DD"
            @change="applyFilters"
          />
          <el-button size="small" text @click="clearFilters" v-if="hasActiveFilters">✕ Clear</el-button>
        </div>
        <div class="toolbar-right">
          <span class="result-count">{{ filteredResults.length }}/{{ allResults.length }} results</span>
          <el-button :icon="Refresh" size="small" circle :loading="loading" @click="loadData" />
        </div>
      </div>
    </div>

    <!-- Content -->
    <main class="app-main">
      <!-- Loading -->
      <div v-if="loading" class="center-state">
        <el-icon :size="28" class="is-loading" color="#3b82f6"><Loading /></el-icon>
        <span>Loading results…</span>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="center-state">
        <span style="font-size:32px">⚠️</span>
        <strong>Failed to load results</strong>
        <span class="muted">{{ error }}</span>
        <el-button type="primary" size="small" @click="loadData">Retry</el-button>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredResults.length === 0" class="center-state">
        <span style="font-size:32px">📭</span>
        <strong>No results found</strong>
        <span class="muted">Adjust filters or run a scan first.</span>
      </div>

      <!-- Data Table -->
      <div v-else class="table-wrap">
        <el-table
          :data="paginatedResults"
          size="small"
          stripe
          style="width: 100%"
          :default-sort="{ prop: 'scanned_at', order: 'descending' }"
          @sort-change="handleSort"
          :header-cell-style="{ background: 'rgba(255,255,255,0.02)', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px' }"
          :cell-style="{ padding: '6px 4px' }"
        >
          <!-- # -->
          <el-table-column type="index" width="40" label="#" />

          <!-- Insurance -->
          <el-table-column prop="insurance_name" label="Insurance" sortable="custom" min-width="160">
            <template #default="{ row }">
              <span class="cell-primary">{{ row.insurance_name || row.insurance_id }}</span>
            </template>
          </el-table-column>

          <!-- Provider -->
          <el-table-column prop="provider_name" label="Provider" sortable="custom" min-width="180">
            <template #default="{ row }">
              <div class="cell-stack">
                <span class="cell-primary">{{ row.provider_name }}</span>
                <span v-if="row.provider_type" class="cell-sub">{{ row.provider_type }}</span>
              </div>
            </template>
          </el-table-column>

          <!-- Location -->
          <el-table-column prop="location_name" label="Location" sortable="custom" min-width="130" />

          <!-- Status -->
          <el-table-column prop="status" label="Status" sortable="custom" width="110" align="center">
            <template #default="{ row }">
              <span :class="['status-dot', `dot-${row.status}`]">{{ formatStatus(row.status) }}</span>
            </template>
          </el-table-column>

          <!-- Screenshot -->
          <el-table-column label="Screenshot" width="160" align="center">
            <template #default="{ row }">
              <template v-if="row.status === 'found' && row.screenshot_url">
                <el-button-group size="small">
                  <el-button type="primary" plain @click="downloadScreenshot(row)">
                    <el-icon :size="13"><View /></el-icon>&nbsp;View
                  </el-button>
                  <!-- <el-button type="success" plain @click="downloadScreenshot(row)">
                    <el-icon :size="13"><Download /></el-icon>
                  </el-button> -->
                </el-button-group>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <!-- AI Review -->
          <el-table-column label="AI Review" width="120" align="center">
            <template #default="{ row }">
              <template v-if="row.ai_reviewed && row.ai_suggestion">
                <span :class="['ai-status-chip', aiChipClass(row.ai_suggestion)]">
                  {{ aiStatusIcon(row.ai_suggestion) }} {{ aiStatusLabel(row.ai_suggestion) }}
                </span>
              </template>
              <span v-else-if="row.status === 'found'" class="ai-badge pending">⏳ Pending</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <!-- AI Suggestion -->
          <el-table-column label="AI Suggestion" min-width="300">
            <template #default="{ row }">
              <template v-if="row.ai_suggestion">
                <el-popover placement="left" :width="440" trigger="click">
                  <template #reference>
                    <div class="ai-suggestion-preview">
                      <span class="ai-suggestion-summary">{{ aiSummaryLine(row.ai_suggestion) }}</span>
                      <span class="ai-read-more">read more →</span>
                    </div>
                  </template>
                  <div class="ai-popover-card">
                    <div class="ai-popover-header">
                      <span :class="['ai-status-chip', aiChipClass(row.ai_suggestion)]">
                        {{ aiStatusIcon(row.ai_suggestion) }} {{ aiStatusLabel(row.ai_suggestion) }}
                      </span>
                      <span class="ai-popover-provider">{{ row.provider_name }}</span>
                    </div>
                    <div class="ai-popover-body" v-html="formatSuggestion(row.ai_suggestion)"></div>
                  </div>
                </el-popover>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>


          <!-- Date -->
          <el-table-column prop="scanned_at" label="Scanned" sortable="custom" width="130" align="right">
            <template #default="{ row }">
              <span class="cell-sub">{{ formatDate(row.scanned_at) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="pageSize"
            :total="filteredResults.length"
            layout="prev, pager, next, total"
            background
            small
          />
        </div>
      </div>
    </main>

    <!-- Screenshot Dialog -->
    <el-dialog v-model="modal.visible" :title="modal.provider" width="75%" top="4vh" destroy-on-close align-center>
      <p class="muted" style="margin-bottom:8px">📍 {{ modal.location }} · {{ modal.insurance }}</p>
      <img :src="modal.url" :alt="modal.provider" class="preview-img" />
      <template #footer>
        <el-button @click="modal.visible = false">Close</el-button>
        <el-button type="primary" :icon="Download" @click="downloadScreenshot(modal.row)">Download</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { fetchScanResults } from './supabase.js'
import { View, Download, Refresh, Loading } from '@element-plus/icons-vue'

const allResults = ref([])
const filteredResults = ref([])
const currentPage = ref(1)
const pageSize = 20
const loading = ref(true)
const error = ref(null)
const filters = reactive({ insurance: '', provider: '', location: '', status: '', dateRange: null })
const modal = reactive({ visible: false, provider: '', location: '', insurance: '', url: '', row: null })

const stats = computed(() => {
  const d = filteredResults.value
  return {
    total: d.length,
    found: d.filter(r => r.status === 'found').length,
    notFound: d.filter(r => r.status === 'not_found').length,
    errors: d.filter(r => r.status === 'error' || r.status === 'blocked').length,
  }
})

const filterOptions = computed(() => ({
  insurances: [...new Set(allResults.value.map(r => r.insurance_name).filter(Boolean))].sort(),
  providers: [...new Set(allResults.value.map(r => r.provider_name).filter(Boolean))].sort(),
  locations: [...new Set(allResults.value.map(r => r.location_name).filter(Boolean))].sort(),
}))

const hasActiveFilters = computed(() => filters.insurance || filters.provider || filters.location || filters.status || filters.dateRange)

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredResults.value.slice(start, start + pageSize)
})

const headerSubtitle = computed(() => {
  if (loading.value) return 'Loading…'
  if (!allResults.value.length) return 'No results'
  const d = new Date(allResults.value[0]?.scanned_at)
  return `Last: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${allResults.value.length} results`
})

async function loadData() {
  loading.value = true; error.value = null
  try { allResults.value = await fetchScanResults(); applyFilters() }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}

function applyFilters() {
  filteredResults.value = allResults.value.filter(r => {
    if (filters.insurance && r.insurance_name !== filters.insurance) return false
    if (filters.provider && r.provider_name !== filters.provider) return false
    if (filters.location && r.location_name !== filters.location) return false
    if (filters.status && r.status !== filters.status) return false
    if (filters.dateRange && filters.dateRange.length === 2) {
      const scanned = r.scanned_at ? r.scanned_at.substring(0, 10) : ''
      if (scanned < filters.dateRange[0] || scanned > filters.dateRange[1]) return false
    }
    return true
  })
  currentPage.value = 1
}

function clearFilters() { Object.assign(filters, { insurance: '', provider: '', location: '', status: '', dateRange: null }); applyFilters() }

function handleSort({ prop, order }) {
  if (!prop || !order) { applyFilters(); return }
  const dir = order === 'ascending' ? 1 : -1
  filteredResults.value.sort((a, b) => {
    const va = (a[prop] || '').toString().toLowerCase()
    const vb = (b[prop] || '').toString().toLowerCase()
    return va < vb ? -dir : va > vb ? dir : 0
  })
}

const statusMap = { found: 'Found', not_found: 'Not Found', blocked: 'Blocked', error: 'Error' }
function formatStatus(s) { return statusMap[s] || s || '?' }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }

// ─── AI Suggestion Helpers ───────────────────────
function aiStatusIcon(text) {
  if (text.includes('✅')) return '✅'
  if (text.includes('⚠️')) return '⚠️'
  if (text.includes('❌')) return '❌'
  return '🤖'
}

function aiStatusLabel(text) {
  if (text.includes('✅')) return 'Good'
  if (text.includes('⚠️')) return 'Attention'
  if (text.includes('❌')) return 'Issues'
  return 'Reviewed'
}

function aiChipClass(text) {
  if (text.includes('✅')) return 'chip-good'
  if (text.includes('⚠️')) return 'chip-warn'
  if (text.includes('❌')) return 'chip-bad'
  return 'chip-default'
}

function aiSummaryLine(text) {
  // Extract the **Summary**: line content
  const match = text.match(/\*\*Summary\*\*:\s*(.+)/i)
  if (match) return match[1].trim().substring(0, 120)
  // Fallback: second non-empty line or first 120 chars
  const lines = text.split('\n').filter(l => l.trim())
  return (lines[1] || lines[0] || text).replace(/\*\*/g, '').trim().substring(0, 120)
}

function formatSuggestion(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

function openScreenshot(row) {
  Object.assign(modal, { visible: true, provider: row.provider_name, location: row.location_name, insurance: row.insurance_name, url: row.screenshot_url, row })
}

function downloadScreenshot(row) {
  if (!row?.screenshot_url) return
  const a = document.createElement('a'); a.href = row.screenshot_url; a.download = `${row.provider_name}_${row.location_name}.png`; a.target = '_blank'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

onMounted(loadData)
</script>
