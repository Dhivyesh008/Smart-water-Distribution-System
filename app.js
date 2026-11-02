/**
 * WaterGrid - Frontend Application Controller
 * Connects directly to Java Backend REST APIs
 */

let isPerformingAction = false;
let currentRequestFilter = 'all';
let lastKnownState = null;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatLitres(value) {
    return Number(value || 0).toLocaleString() + ' L';
}

function showNotice(type, message) {
    const container = document.getElementById('noticeContainer');
    container.innerHTML = `
        <div class="notice notice-${escapeHtml(type)}" role="status">
            <span class="notice-icon" aria-hidden="true">${type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'i')}</span>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
        if (container.innerHTML.includes(escapeHtml(message))) {
            container.style.display = 'none';
        }
    }, 6000);
}

// ---------------------------------------------------------
// API Operations
// ---------------------------------------------------------

async function fetchNetworkState() {
    try {
        if (window.supabaseService) {
            return await window.supabaseService.data.fetchNetworkState();
        }
        const res = await fetch('/api/network/state');
        if (res.status === 401) {
            window.location.href = 'login.html';
            return null;
        }
        if (!res.ok) throw new Error('Failed to fetch state');
        return await res.json();
    } catch (err) {
        console.error('Network state fetch error:', err);
        return null;
    }
}

async function fetchForecastData() {
    try {
        if (window.supabaseService) {
            return await window.supabaseService.data.fetchForecastData();
        }
        const res = await fetch('/api/forecast');
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error('Forecast fetch error:', err);
        return null;
    }
}

// ---------------------------------------------------------
// Render Engine Helpers & Multi-Page Safety
// ---------------------------------------------------------

function setSafeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setSafeHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

let lastRenderedState = null;
let currentHistorySearch = '';
let currentHistoryFilter = 'all';

function setupHistoryControls() {
    const searchInput = document.getElementById('historySearchInput');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', (e) => {
            currentHistorySearch = (e.target.value || '').trim().toLowerCase();
            if (lastRenderedState) renderDashboard(lastRenderedState);
        });
    }

    const filterSelect = document.getElementById('historyResultFilter');
    if (filterSelect && !filterSelect.dataset.bound) {
        filterSelect.dataset.bound = 'true';
        filterSelect.addEventListener('change', (e) => {
            currentHistoryFilter = e.target.value || 'all';
            if (lastRenderedState) renderDashboard(lastRenderedState);
        });
    }

    const refreshBtn = document.getElementById('historyRefreshBtn');
    if (refreshBtn && !refreshBtn.dataset.bound) {
        refreshBtn.dataset.bound = 'true';
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '🔄 Syncing...';
            try {
                if (window.supabaseService) {
                    const freshHistory = await window.supabaseService.data.fetchAllocationHistory(100);
                    if (lastRenderedState) {
                        lastRenderedState.allocationHistory = freshHistory;
                        renderDashboard(lastRenderedState);
                    } else {
                        await refreshAll();
                    }
                    showNotice('success', `✓ Successfully loaded ${freshHistory.length} allocation record(s) from Supabase table public.allocation_history.`);
                } else {
                    await refreshAll();
                }
            } catch (err) {
                showNotice('error', 'Failed to refresh Supabase records.');
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '🔄 Refresh from Supabase';
            }
        });
    }
}

function renderDashboard(state) {
    if (!state) return;
    lastRenderedState = state;

    // 1. Overview Metrics (rendered independently per page)
    if (document.getElementById('metricRemainingSupply')) {
        setSafeHtml('metricRemainingSupply', `${Number(state.totalSupply).toLocaleString()} <small>L</small>`);
        setSafeText('metricReservoirsCount', `Across ${state.reservoirs.length} reservoirs`);
    }

    if (document.getElementById('metricDailyDemand')) {
        setSafeHtml('metricDailyDemand', `${Number(state.totalDailyDemand).toLocaleString()} <small>L</small>`);
        setSafeText('metricAreasCount', `Across ${state.areas.length} demand areas`);
    }

    if (document.getElementById('metricPipelinesCount')) {
        setSafeHtml('metricPipelinesCount', `${state.totalPipelinesCount} <small>total</small>`);
        const pipelineFoot = document.getElementById('metricPipelinesFoot');
        if (pipelineFoot) {
            if (state.failedPipelinesCount > 0) {
                pipelineFoot.innerHTML = `<span class="inline-dot dot-failed"></span>${state.failedPipelinesCount} failed pipeline(s)`;
            } else {
                pipelineFoot.innerHTML = `<span class="inline-dot"></span>All pipelines operational`;
            }
        }
    }

    if (document.getElementById('metricConnectedAreas')) {
        setSafeHtml('metricConnectedAreas', `${state.connectedAreasCount} <small>/ ${state.totalAreasCount}</small>`);
        const connectedFoot = document.getElementById('metricConnectedFoot');
        if (connectedFoot) {
            const disconnectedCount = state.totalAreasCount - state.connectedAreasCount;
            if (disconnectedCount > 0) {
                connectedFoot.innerHTML = `<span class="inline-dot dot-failed"></span>${disconnectedCount} area(s) disconnected`;
            } else {
                connectedFoot.innerHTML = `<span class="inline-dot"></span>All areas reachable`;
            }
        }
    }

    // 2. Reservoirs Panel
    setSafeText('reservoirsHeaderCount', `${state.reservoirs.length} reservoirs`);
    setSafeText('dayCounterSpan', state.dayCounter || 1);

    const resListContainer = document.getElementById('reservoirListContainer');
    if (resListContainer) {
        resListContainer.innerHTML = state.reservoirs.map((r, idx) => {
            const fillClass = idx % 2 === 0 ? 'fill-blue' : 'fill-teal';
            return `
                <div class="reservoir-row">
                    <div class="reservoir-symbol">${escapeHtml(r.id)}</div>
                    <div class="reservoir-info">
                        <div class="row-title">
                            ${escapeHtml(r.name)}
                            <span class="capacity">${formatLitres(r.dailySupply)}</span>
                        </div>
                        <div class="progress-track">
                            <span class="progress-fill ${fillClass}" style="width: ${Math.min(100, Math.max(0, r.percentage))}%"></span>
                        </div>
                        <div class="progress-label">
                            <span>Remaining supply</span>
                            <strong>${formatLitres(r.remainingSupply)}</strong>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Supply vs Demand Panel
    if (document.getElementById('comparisonSupply')) {
        setSafeHtml('comparisonSupply', `${Number(state.totalSupply).toLocaleString()} <small>L</small>`);
        setSafeHtml('comparisonDemand', `${Number(state.totalDailyDemand).toLocaleString()} <small>L</small>`);

        const supplyPct = state.totalDailyDemand > 0
            ? Math.min(100, (state.totalSupply / state.totalDailyDemand) * 100)
            : 0;
        const fillBar = document.getElementById('supplyVsDemandFill');
        if (fillBar) fillBar.style.width = `${supplyPct}%`;
        setSafeText('supplyVsDemandPct', `${supplyPct.toFixed(1)}% of demand`);

        const callout = document.getElementById('supplyCallout');
        if (callout) {
            if (state.totalSupply >= state.totalDailyDemand) {
                callout.textContent = 'Supply is sufficient for the total daily demand.';
            } else {
                callout.textContent = 'Supply is lower than the total daily demand.';
            }
        }
    }

    // 4. Demand Areas Table & Dropdown
    setSafeText('areasHeaderCount', state.areas.length);
    const areasTbody = document.getElementById('areasTableBody');
    if (areasTbody) {
        areasTbody.innerHTML = state.areas.map(a => {
            const typeLabel = a.type === 'critical_institution' ? 'Critical institution' : 'Residential';
            const priorityClass = String(a.priority || '').toLowerCase();
            const unmet = Math.max(0, a.unmetWater);
            return `
                <tr>
                    <td>
                        <span class="id-badge">${escapeHtml(a.id)}</span>
                        <span class="primary-cell">${escapeHtml(a.name)}</span>
                    </td>
                    <td>${escapeHtml(typeLabel)}</td>
                    <td><span class="priority ${escapeHtml(priorityClass)}">${escapeHtml(a.priority)}</span></td>
                    <td>${formatLitres(a.dailyDemand)}</td>
                    <td>${formatLitres(a.allocatedWater)}</td>
                    <td>${formatLitres(unmet)}</td>
                    <td>
                        <span class="status-pill ${a.connected ? 'connected' : 'disconnected'}">
                            ${a.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Update Area select dropdown if present
    const areaSelect = document.getElementById('area_id');
    if (areaSelect) {
        const currentVal = areaSelect.value;
        if (areaSelect.children.length <= 1) {
            areaSelect.innerHTML = '<option value="">Select an area</option>' +
                state.areas.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.id)} - ${escapeHtml(a.name)}</option>`).join('');
            if (currentVal) areaSelect.value = currentVal;
        }
    }

    lastKnownState = state;

    // 5. Citizen & Community Requests Approval Desk (Admin Review)
    const allReqs = state.allRequests || [];
    const pendingReviewReqs = allReqs.filter(r => r.status === 'pending');
    const approvedReqs = allReqs.filter(r => r.status === 'approved' || r.status === 'allocated');
    const rejectedReqs = allReqs.filter(r => r.status === 'rejected');

    setSafeText('pendingAdminReviewCount', `${pendingReviewReqs.length} awaiting decision`);
    setSafeText('countAll', allReqs.length);
    setSafeText('countPending', pendingReviewReqs.length);
    setSafeText('countApproved', approvedReqs.length);
    setSafeText('countRejected', rejectedReqs.length);

    const adminReviewContainer = document.getElementById('adminCitizenRequestsContainer');
    if (adminReviewContainer) {
        let filteredReqs = allReqs;
        if (currentRequestFilter === 'pending') {
            filteredReqs = pendingReviewReqs;
        } else if (currentRequestFilter === 'approved') {
            filteredReqs = allReqs.filter(r => r.status === 'approved' || r.status === 'allocated');
        } else if (currentRequestFilter === 'rejected') {
            filteredReqs = rejectedReqs;
        }

        if (filteredReqs.length === 0) {
            adminReviewContainer.innerHTML = `
                <div class="empty-state compact-empty">
                    <span class="empty-icon">✓</span><strong>No requests in this category</strong><span>${currentRequestFilter === 'pending' ? 'All citizen water requests have been reviewed!' : 'No matching requests found.'}</span>
                </div>
            `;
        } else {
            adminReviewContainer.innerHTML = `
                <div class="citizen-review-grid">
                    ${filteredReqs.map(r => {
                        let statusBadgeHtml = '<span class="status-pill disconnected" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">⏳ Pending Review</span>';
                        if (r.status === 'approved') {
                            statusBadgeHtml = '<span class="status-pill connected" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;">✓ Approved</span>';
                        } else if (r.status === 'rejected') {
                            statusBadgeHtml = '<span class="status-pill disconnected" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca;">✕ Rejected</span>';
                        } else if (r.status === 'allocated') {
                            statusBadgeHtml = '<span class="status-pill connected" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">⚡ Allocated</span>';
                        }

                        return `
                            <div class="citizen-review-card">
                                <div>
                                    <div class="review-card-top">
                                        <div>
                                            <span class="id-badge">${escapeHtml(r.id)}</span>
                                            <strong style="margin-left: 6px; font-size: 14px; color: var(--navy);">${escapeHtml(r.areaName || r.areaId)}</strong>
                                        </div>
                                        <div>${statusBadgeHtml}</div>
                                    </div>
                                    <div class="review-requester-info">
                                        <span>👤 ${escapeHtml(r.requestedBy || 'Public Citizen')}</span>
                                        <span>${escapeHtml(r.createdAt || '')}</span>
                                    </div>
                                    <div style="font-size: 16px; font-weight: 800; color: #2585d7; margin-bottom: 8px;">
                                        ${formatLitres(r.requestedLitres)}
                                        <small style="font-size: 11px; font-weight: 600; color: var(--muted); margin-left: 4px;">(${escapeHtml(r.priority || 'Normal')} Priority)</small>
                                    </div>
                                    <div class="review-reason-box">
                                        <strong>Reason:</strong> ${escapeHtml(r.reason || 'General Supply Request')}
                                    </div>
                                    ${r.decisionNotes ? `
                                        <div style="font-size: 11px; color: ${r.status === 'rejected' ? '#dc2626' : '#16a34a'}; margin-bottom: 8px; font-weight: 600;">
                                            Note: ${escapeHtml(r.decisionNotes)}
                                        </div>
                                    ` : ''}
                                </div>
                                ${r.status === 'pending' ? `
                                    <div class="review-actions-row">
                                        <button type="button" class="action-btn-sm button-danger" onclick="window.handleRejectRequest('${escapeHtml(r.id)}')">
                                            ✕ Reject
                                        </button>
                                        <button type="button" class="action-btn-sm button-success" onclick="window.handleAcceptRequest('${escapeHtml(r.id)}')">
                                            ✓ Accept Request
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
    }

    // Approved Allocation Queue (Requests ready to be fulfilled)
    setSafeText('pendingRequestsCount', `${state.pendingRequests.length} queued`);
    const reqListContainer = document.getElementById('pendingRequestsListContainer');
    if (reqListContainer) {
        if (state.pendingRequests.length === 0) {
            reqListContainer.innerHTML = `
                <div class="empty-state compact-empty">
                    <span class="empty-icon">⇢</span><strong>No approved requests in queue</strong><span>Accept incoming citizen requests above to queue them for distribution.</span>
                </div>
            `;
        } else {
            reqListContainer.innerHTML = `
                <div class="request-list">
                    ${state.pendingRequests.map(r => `
                        <div class="request-item">
                            <span class="id-badge">${escapeHtml(r.areaId)}</span>
                            <span class="request-name">
                                ${escapeHtml(r.areaName)}
                                <small>${escapeHtml(r.priority)} priority • ${escapeHtml(r.requestedBy || 'Approved Request')}</small>
                            </span>
                            <strong>${formatLitres(r.requestedLitres)}</strong>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    const allocateBtn = document.getElementById('allocateWaterBtn');
    if (allocateBtn) {
        const hasPending = (state.pendingRequests || []).length > 0;
        const hasUnmetAreas = (state.areas || []).some(a => a.unmetWater > 0 && a.connected);
        const hasReservoirWater = (state.reservoirs || []).some(r => r.remainingSupply > 0);

        if (hasPending) {
            allocateBtn.disabled = !hasReservoirWater;
            allocateBtn.innerHTML = `⚡ Allocate Water (${state.pendingRequests.length} request(s) queued)`;
        } else if (hasUnmetAreas && hasReservoirWater) {
            allocateBtn.disabled = false;
            allocateBtn.innerHTML = `⚡ Allocate Daily Water to Connected Areas`;
        } else if (!hasReservoirWater) {
            allocateBtn.disabled = true;
            allocateBtn.innerHTML = `⚠ Reservoirs Depleted (Reset Day to Refill)`;
        } else {
            allocateBtn.disabled = true;
            allocateBtn.innerHTML = `✓ Daily Water Demand Fully Met`;
        }
    }

    // 6. Maintenance Queue
    setSafeText('maintenanceQueueCount', `${state.maintenanceQueue.length} open`);
    const maintContainer = document.getElementById('maintenanceListContainer');
    if (maintContainer) {
        if (state.maintenanceQueue.length === 0) {
            maintContainer.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">⚒</span><strong>All clear</strong><span>No pipeline maintenance requests. All network routes operational.</span>
                </div>
            `;
        } else {
            maintContainer.innerHTML = `
                <div class="maintenance-list">
                    ${state.maintenanceQueue.map(m => `
                        <div class="maintenance-item">
                            <span class="id-badge">${escapeHtml(m.pipelineId)}</span>
                            <div class="request-name" style="flex: 1;">
                                <strong style="display: block; font-size: 13px; color: var(--text);">${escapeHtml(m.issue || 'Pipeline breakdown reported')}</strong>
                                <small style="display: block; color: var(--muted); font-size: 11.5px; margin-top: 2px;">
                                    Grid Route: <strong>${escapeHtml(m.from || '')}</strong> ➔ <strong>${escapeHtml(m.to || '')}</strong>
                                </small>
                            </div>
                            <span class="status-pill disconnected">Open Ticket</span>
                            <button
                                type="button"
                                class="mini-button mini-button-success"
                                style="margin-left: 8px; font-weight: 700; white-space: nowrap;"
                                onclick="togglePipeline('${escapeHtml(m.pipelineId)}', false)"
                                title="Repair pipeline ${escapeHtml(m.pipelineId)} and resolve ticket"
                            >
                                ✓ Repair & Restore
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    // 7. Pipelines Grid
    setSafeText('pipelinesHeaderCount', state.totalPipelinesCount);
    const pipelineGrid = document.getElementById('pipelineGridContainer');
    if (pipelineGrid) {
        pipelineGrid.innerHTML = state.pipelines.map(p => {
            const isWorking = p.isWorking;
            return `
                <div class="pipeline-item">
                    <span class="pipeline-id">${escapeHtml(p.id)}</span>
                    <span>${escapeHtml(p.from)} <i>↔</i> ${escapeHtml(p.to)}</span>
                    <b class="${isWorking ? 'pipe-working' : 'pipe-failed'}">
                        ${isWorking ? 'Working' : 'Broken / Cut'}
                    </b>
                    <button
                        type="button"
                        class="mini-button ${isWorking ? 'mini-button-danger' : 'mini-button-success'}"
                        onclick="togglePipeline('${escapeHtml(p.id)}', ${isWorking})"
                    >
                        ${isWorking ? '⚡ Cut' : '✓ Repair'}
                    </button>
                </div>
            `;
        }).join('');
    }

    // 8. History Table (Live Supabase Cloud Audit Trail)
    const historyContainer = document.getElementById('historyTableContainer');
    if (historyContainer) {
        setupHistoryControls();

        const allHistory = state.allocationHistory || [];
        const totalCount = allHistory.length;

        setSafeText('historyCountBadge', `${totalCount} Supabase record${totalCount === 1 ? '' : 's'}`);

        let displayHistory = allHistory;
        if (currentHistoryFilter !== 'all') {
            displayHistory = displayHistory.filter(h => h.result === currentHistoryFilter);
        }
        if (currentHistorySearch) {
            displayHistory = displayHistory.filter(h => {
                const q = currentHistorySearch;
                return (h.areaId && h.areaId.toLowerCase().includes(q)) ||
                       (h.areaName && h.areaName.toLowerCase().includes(q)) ||
                       (h.reservoirName && h.reservoirName.toLowerCase().includes(q)) ||
                       (h.result && h.result.toLowerCase().includes(q)) ||
                       String(h.id).includes(q);
            });
        }

        if (totalCount === 0) {
            historyContainer.innerHTML = `
                <div class="history-empty">
                    <span class="empty-icon">📜</span>
                    <strong>No allocations recorded in Supabase table yet</strong>
                    <span>Click "Allocate pending water" on the Requests or Overview page to process distribution and log audit records in public.allocation_history.</span>
                </div>
            `;
        } else if (displayHistory.length === 0) {
            historyContainer.innerHTML = `
                <div class="history-empty">
                    <span class="empty-icon">🔍</span>
                    <strong>No matching allocation records found</strong>
                    <span>No records match your search query "${escapeHtml(currentHistorySearch)}" or selected filter.</span>
                </div>
            `;
        } else {
            const resultLabels = {
                'allocated': '✓ Allocated',
                'demand_met': '✓ Demand Met',
                'disconnected': '✕ Disconnected',
                'no_supply': '⚠ No Supply'
            };
            historyContainer.innerHTML = `
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 70px;">LOG #</th>
                                <th>DATE & TIME</th>
                                <th>DEMAND AREA</th>
                                <th>ALLOCATED VOLUME</th>
                                <th>SOURCE RESERVOIR</th>
                                <th>SUPABASE RESULT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${displayHistory.map(h => {
                                const timeStr = h.timestamp || h.time || 'Recent';
                                const dateStr = h.date || '';
                                const isSuccess = h.result === 'allocated';
                                const pillClass = isSuccess ? 'connected' : 'disconnected';
                                const pillStyle = isSuccess 
                                    ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; font-weight: 600;'
                                    : (h.result === 'no_supply' 
                                        ? 'background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-weight: 600;' 
                                        : 'background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; font-weight: 600;');
                                return `
                                    <tr>
                                        <td>
                                            <span class="id-badge" style="font-family: monospace; font-weight: 700; color: #0284c7; background: #e0f2fe;">#${escapeHtml(String(h.id || '—'))}</span>
                                        </td>
                                        <td>
                                            <strong>${escapeHtml(timeStr)}</strong>
                                            ${dateStr ? `<small style="display: block; color: var(--muted); font-size: 11px;">${escapeHtml(dateStr)}</small>` : ''}
                                        </td>
                                        <td>
                                            <span class="id-badge">${escapeHtml(h.areaId || '—')}</span>
                                            <span class="primary-cell" style="font-weight: 600; margin-left: 4px;">${escapeHtml(h.areaName || '—')}</span>
                                        </td>
                                        <td>
                                            <strong style="color: ${h.allocatedLitres > 0 ? '#0284c7' : 'var(--muted)'}; font-size: 13.5px;">
                                                ${formatLitres(h.allocatedLitres || 0)}
                                            </strong>
                                        </td>
                                        <td>
                                            <span style="font-weight: 500; color: var(--navy);">
                                                ${escapeHtml(h.reservoirName || '—')}
                                            </span>
                                        </td>
                                        <td>
                                            <span class="status-pill ${pillClass}" style="${pillStyle}">
                                                ${escapeHtml(resultLabels[h.result] || h.result)}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }

    // 9. Interactive Pipeline Map (if present)
    const mapSvg = document.getElementById('pipelineMapSvg');
    if (mapSvg) {
        renderPipelineMap(state);
    }
}

// ---------------------------------------------------------
// Interactive Pipeline Map Engine
// ---------------------------------------------------------

let latestNetworkState = null;
let selectedEntity = null; // { type: 'pipe'|'res'|'area', id: string }

// Clean, 5-stage grid layout (viewBox 0 0 1000 470)
const NODE_COORDINATES = {
    // 1. Water Sources (Column 1, x = 85)
    'R1': { x: 85, y: 135, type: 'reservoir', shortName: 'North Res.' },
    'R2': { x: 85, y: 335, type: 'reservoir', shortName: 'South Res.' },

    // 2. Feeder Grid (Column 2, x = 275)
    'A1': { x: 275, y: 90, type: 'area', shortName: 'Greenview' },
    'A2': { x: 275, y: 230, type: 'area', shortName: 'Lakeside' },
    'A3': { x: 275, y: 370, type: 'area', shortName: 'Hospital' },

    // 3. Intermediate (Column 3, x = 480)
    'A4': { x: 480, y: 90, type: 'area', shortName: 'Rivergate' },
    'A5': { x: 480, y: 230, type: 'area', shortName: 'Sunrise' },
    'A6': { x: 480, y: 370, type: 'area', shortName: 'Fire Station' },

    // 4. Distribution (Column 4, x = 685)
    'A7': { x: 685, y: 90, type: 'area', shortName: 'Hillview' },
    'A8': { x: 685, y: 230, type: 'area', shortName: 'Maple Res.' },
    'A9': { x: 685, y: 370, type: 'area', shortName: 'Riverside' },

    // 5. Terminal Endpoint (Column 5, x = 890)
    'A10': { x: 890, y: 230, type: 'area', shortName: 'Green Park' }
};

let lastRenderedStateSignature = '';

function renderPipelineMap(state) {
    if (!state) return;
    latestNetworkState = state;

    const currentSignature = JSON.stringify({
        pipelines: state.pipelines ? state.pipelines.map(p => `${p.id}:${p.isWorking}`) : [],
        reservoirs: state.reservoirs ? state.reservoirs.map(r => `${r.id}:${r.remainingSupply}`) : [],
        areas: state.areas ? state.areas.map(a => `${a.id}:${a.allocatedWater}:${a.connected}`) : []
    });

    if (currentSignature === lastRenderedStateSignature) {
        return;
    }
    lastRenderedStateSignature = currentSignature;

    const countBadge = document.getElementById('mapPipelinesCountBadge');
    if (countBadge) countBadge.textContent = state.totalPipelinesCount;

    const pipesGroup = document.getElementById('mapPipesGroup');
    const nodesGroup = document.getElementById('mapNodesGroup');
    if (!pipesGroup || !nodesGroup) return;

    // 1. Render Pipelines with Clean Midpoint ON/OFF Toggle Badges
    pipesGroup.innerHTML = state.pipelines.map(p => {
        const fromCoord = NODE_COORDINATES[p.from];
        const toCoord = NODE_COORDINATES[p.to];
        if (!fromCoord || !toCoord) return '';

        let pathD;
        let midX, midY;

        if (p.id === 'P3') {
            midX = 155;
            midY = 255;
            pathD = `M ${fromCoord.x} ${fromCoord.y} Q 130 255 ${toCoord.x} ${toCoord.y}`;
        } else if (p.id === 'P11') {
            midX = 275;
            midY = 422;
            pathD = `M ${fromCoord.x} ${fromCoord.y} Q 275 440 ${toCoord.x} ${toCoord.y}`;
        } else if (p.id === 'P12') {
            midX = 380;
            midY = 305;
            pathD = `M ${fromCoord.x} ${fromCoord.y} Q 380 305 ${toCoord.x} ${toCoord.y}`;
        } else {
            midX = (fromCoord.x + toCoord.x) / 2;
            midY = (fromCoord.y + toCoord.y) / 2;
            pathD = `M ${fromCoord.x} ${fromCoord.y} L ${toCoord.x} ${toCoord.y}`;
        }

        const isWorking = Boolean(p.isWorking);
        const statusClass = isWorking ? 'working' : 'failed';
        const badgeText = isWorking ? `${p.id} ON` : `${p.id} OFF`;
        const isSelected = selectedEntity && selectedEntity.type === 'pipe' && selectedEntity.id === p.id;

        return `
            <g class="pipe-group ${statusClass} ${isSelected ? 'selected' : ''}" id="map-pipe-${escapeHtml(p.id)}"
               onclick="handlePipeClick(event, '${escapeHtml(p.id)}', ${isWorking})"
               onmouseenter="inspectPipe('${escapeHtml(p.id)}', false)"
               onmouseleave="handleInspectorMouseLeave()">
                <!-- Click Hitbox (expanded stroke for reliable clicking) -->
                <path d="${pathD}" class="pipe-hitbox" fill="none" />
                <!-- Track Line -->
                <path d="${pathD}" class="pipe-track" fill="none" />
                <!-- Water Stream Animation -->
                <path d="${pathD}" class="pipe-stream ${statusClass}" fill="none" />
                <!-- Centered ON / OFF Toggle Pill Badge -->
                <g class="pipe-badge ${statusClass}" transform="translate(${Math.round(midX)}, ${Math.round(midY)})"
                   onclick="handleBadgeClick(event, '${escapeHtml(p.id)}', ${isWorking})">
                    <rect x="-26" y="-11" width="52" height="22" rx="11" class="pipe-badge-bg" />
                    <text x="0" y="3.5" text-anchor="middle" class="pipe-badge-text">${escapeHtml(badgeText)}</text>
                </g>
            </g>
        `;
    }).join('');

    // 2. Render Nodes as Clean, High-Legibility Cards
    let nodesHtml = '';

    // A. Reservoirs (Sources)
    state.reservoirs.forEach(r => {
        const coord = NODE_COORDINATES[r.id];
        if (!coord) return;
        const shortName = coord.shortName || r.name;

        nodesHtml += `
            <g class="map-node node-res" id="map-node-${escapeHtml(r.id)}"
               transform="translate(${coord.x}, ${coord.y})"
               onclick="selectReservoir('${escapeHtml(r.id)}')"
               onmouseenter="inspectReservoir('${escapeHtml(r.id)}')"
               onmouseleave="resetInspector()">
                <rect x="-60" y="-23" width="120" height="46" rx="8" class="res-card-bg" />
                <text x="-48" y="-4" class="res-title">💧 ${escapeHtml(r.id)} ${escapeHtml(shortName)}</text>
                <text x="-48" y="14" class="res-sub">${Number(r.remainingSupply).toLocaleString()} L supply</text>
            </g>
        `;
    });

    // B. Demand Areas (Feeders, Hubs, Terminal)
    state.areas.forEach(a => {
        const coord = NODE_COORDINATES[a.id];
        if (!coord) return;

        const isConnected = a.connected;
        const prioClass = a.priority === 'Critical' ? 'prio-critical' : (a.priority === 'High' ? 'prio-high' : 'prio-normal');
        const shortName = coord.shortName || a.name;
        const isCritical = a.priority === 'Critical';

        nodesHtml += `
            <g class="map-node node-area ${isConnected ? 'connected' : 'disconnected'}" id="map-node-${escapeHtml(a.id)}"
               transform="translate(${coord.x}, ${coord.y})"
               onclick="selectArea('${escapeHtml(a.id)}')"
               onmouseenter="inspectArea('${escapeHtml(a.id)}')"
               onmouseleave="handleInspectorMouseLeave()">
                <rect x="-64" y="-23" width="128" height="46" rx="8" class="area-card-bg" />
                <rect x="-64" y="-23" width="5" height="46" rx="2.5" class="priority-strip ${prioClass}" />
                <text x="-48" y="-5" class="area-title">${escapeHtml(a.id)} • ${escapeHtml(shortName)} ${isCritical ? '🚨' : ''}</text>
                <text x="-48" y="13" class="area-status ${isConnected ? 'flowing' : 'cut'}">${isConnected ? '● Flowing' : '✕ Cut off'} &bull; ${Number(a.allocatedWater).toLocaleString()} L</text>
            </g>
        `;
    });

    nodesGroup.innerHTML = nodesHtml;
}

// ---------------------------------------------------------
// Map Inspection & Command Card Handlers
// ---------------------------------------------------------

function updateSvgSelection() {
    document.querySelectorAll('.pipe-group').forEach(el => el.classList.remove('selected'));
    if (selectedEntity && selectedEntity.type === 'pipe') {
        const pipeEl = document.getElementById(`map-pipe-${selectedEntity.id}`);
        if (pipeEl) pipeEl.classList.add('selected');
    }
}

function handlePipeClick(event, pipeId, isWorking) {
    if (event) event.stopPropagation();
    selectedEntity = { type: 'pipe', id: pipeId };
    inspectPipe(pipeId, true);
    togglePipeline(pipeId, isWorking);
}

function handleBadgeClick(event, pipeId, isWorking) {
    if (event) event.stopPropagation();
    handlePipeClick(event, pipeId, isWorking);
}

let currentInspectedTarget = null;

function inspectPipe(pipeId, isPermanent = false) {
    if (!latestNetworkState) return;
    const p = latestNetworkState.pipelines.find(item => item.id === pipeId);
    if (!p) return;

    if (isPermanent) {
        selectedEntity = { type: 'pipe', id: pipeId };
        updateSvgSelection();
    }

    const stateKey = `pipe_${pipeId}_${p.isWorking}`;
    if (currentInspectedTarget === stateKey && !isPermanent) return;
    currentInspectedTarget = stateKey;

    const fromObj = latestNetworkState.reservoirs.find(r => r.id === p.from) || latestNetworkState.areas.find(a => a.id === p.from);
    const toObj = latestNetworkState.areas.find(a => a.id === p.to);
    const fromName = fromObj ? `${p.from} (${fromObj.name})` : p.from;
    const toName = toObj ? `${p.to} (${toObj.name})` : p.to;

    const iconEl = document.getElementById('inspectorIcon');
    if (iconEl) iconEl.textContent = p.isWorking ? '⚡' : '🛠';

    const titleEl = document.getElementById('inspectorTitle');
    if (titleEl) {
        titleEl.innerHTML = `Pipeline <strong>${escapeHtml(p.id)}</strong>: ${escapeHtml(fromName)} ➔ ${escapeHtml(toName)}`;
    }

    const subEl = document.getElementById('inspectorSubtitle');
    if (subEl) {
        subEl.innerHTML = p.isWorking
            ? `<span style="color: #10b981; font-weight: 700;">● OPERATIONAL (Water Flowing)</span> &bull; Click button or badge to cut flow and log into Maintenance Queue.`
            : `<span style="color: #ef4444; font-weight: 700;">✕ BROKEN (Flow Cut-off)</span> &bull; Maintenance ticket OPEN. Click button or badge to restore flow.`;
    }

    const actionsEl = document.getElementById('inspectorActions');
    if (actionsEl) {
        actionsEl.innerHTML = p.isWorking
            ? `<button class="mini-button mini-button-danger" type="button" onclick="togglePipeline('${escapeHtml(p.id)}', true)">⚡ Cut pipeline ${escapeHtml(p.id)}</button>`
            : `<button class="mini-button mini-button-success" type="button" onclick="togglePipeline('${escapeHtml(p.id)}', false)">✓ Repair pipeline ${escapeHtml(p.id)}</button>`;
    }
}

function handleInspectorMouseLeave() {
    currentInspectedTarget = null;
    if (selectedEntity) {
        if (selectedEntity.type === 'pipe') inspectPipe(selectedEntity.id, true);
        else if (selectedEntity.type === 'res') inspectReservoir(selectedEntity.id);
        else if (selectedEntity.type === 'area') inspectArea(selectedEntity.id);
    } else {
        resetInspector();
    }
}

function inspectReservoir(resId) {
    if (!latestNetworkState) return;
    const r = latestNetworkState.reservoirs.find(item => item.id === resId);
    if (!r) return;

    const pct = r.dailySupply > 0 ? (r.remainingSupply * 100 / r.dailySupply).toFixed(0) : 0;
    const iconEl = document.getElementById('inspectorIcon');
    if (iconEl) iconEl.textContent = '💧';

    const titleEl = document.getElementById('inspectorTitle');
    if (titleEl) {
        titleEl.innerHTML = `Source Reservoir: <strong>${escapeHtml(r.id)} — ${escapeHtml(r.name)}</strong>`;
    }

    const subEl = document.getElementById('inspectorSubtitle');
    if (subEl) {
        subEl.innerHTML = `Remaining Supply: <strong>${Number(r.remainingSupply).toLocaleString()} L</strong> of ${Number(r.dailySupply).toLocaleString()} L (${pct}% available today).`;
    }

    const actionsEl = document.getElementById('inspectorActions');
    if (actionsEl) {
        actionsEl.innerHTML = `<button class="mini-button" type="button" onclick="selectReservoir('${escapeHtml(r.id)}')">View in sources panel</button>`;
    }
}

function inspectArea(areaId) {
    if (!latestNetworkState) return;
    const a = latestNetworkState.areas.find(item => item.id === areaId);
    if (!a) return;

    const statusBadge = a.connected
        ? '<span style="color: #10b981; font-weight: 700;">● Connected</span>'
        : '<span style="color: #ef4444; font-weight: 700;">✕ Disconnected</span>';

    const iconEl = document.getElementById('inspectorIcon');
    if (iconEl) iconEl.textContent = a.priority === 'Critical' ? '🚨' : '🏘';

    const titleEl = document.getElementById('inspectorTitle');
    if (titleEl) {
        titleEl.innerHTML = `Demand Area: <strong>${escapeHtml(a.id)} — ${escapeHtml(a.name)}</strong> (${escapeHtml(a.priority)} Priority)`;
    }

    const subEl = document.getElementById('inspectorSubtitle');
    if (subEl) {
        subEl.innerHTML = `Status: ${statusBadge} &bull; Demand: <strong>${Number(a.dailyDemand).toLocaleString()} L</strong> &bull; Received: <strong>${Number(a.allocatedWater).toLocaleString()} L</strong>.`;
    }

    const actionsEl = document.getElementById('inspectorActions');
    if (actionsEl) {
        actionsEl.innerHTML = `<button class="mini-button" type="button" onclick="quickRequest('${escapeHtml(a.id)}')">+ Add water request</button>`;
    }
}

function resetInspector() {
    currentInspectedTarget = null;
    const iconEl = document.getElementById('inspectorIcon');
    if (iconEl) iconEl.textContent = '💧';

    const titleEl = document.getElementById('inspectorTitle');
    if (titleEl) titleEl.textContent = 'Water Grid Ready';

    const subEl = document.getElementById('inspectorSubtitle');
    if (subEl) subEl.textContent = 'Click any pipeline badge (P1–P15) to cut or repair water flow. Click any area to view real-time supply.';

    const actionsEl = document.getElementById('inspectorActions');
    if (actionsEl) {
        actionsEl.innerHTML = '<span class="inspector-hint">⚡ Select any pipeline or area</span>';
    }
}

function selectReservoir(resId) {
    const el = document.getElementById('reservoirs');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function selectArea(areaId) {
    quickRequest(areaId);
}

function quickRequest(areaId) {
    const el = document.getElementById('requests');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    const select = document.getElementById('area_id');
    if (select) select.value = areaId;
    const input = document.getElementById('requested_litres');
    if (input) input.focus();
}

async function repairAllPipes() {
    if (isPerformingAction) return;
    isPerformingAction = true;
    const repairBtn = document.getElementById('mapRepairAllBtn');
    if (repairBtn) {
        repairBtn.disabled = true;
        repairBtn.textContent = 'Repairing...';
    }
    try {
        if (window.supabaseService) {
            const result = await window.supabaseService.data.repairAllPipelines();
            showNotice('success', result.message);
            lastRenderedStateSignature = '';
            await refreshAll();
            return;
        }

        const broken = latestNetworkState ? latestNetworkState.pipelines.filter(p => !p.isWorking) : [];
        if (broken.length === 0) {
            showNotice('info', 'All pipelines are already operational.');
            return;
        }
        for (const pipe of broken) {
            await fetch('/api/pipelines/repair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pipeline_id: pipe.id })
            });
        }
        showNotice('success', `Repaired all ${broken.length} broken pipeline(s).`);
        lastRenderedStateSignature = '';
        await refreshAll();
    } catch (err) {
        showNotice('error', 'Error while repairing pipelines.');
    } finally {
        isPerformingAction = false;
        if (repairBtn) {
            repairBtn.disabled = false;
            repairBtn.textContent = '✓ Repair all pipes';
        }
    }
}

async function breakRandomPipe() {
    if (isPerformingAction) return;
    isPerformingAction = true;
    try {
        if (window.supabaseService) {
            const result = await window.supabaseService.data.breakRandomPipeline();
            if (result.success) {
                showNotice('info', result.message);
            } else {
                showNotice('info', result.message || 'Cannot fail pipeline.');
            }
            lastRenderedStateSignature = '';
            await refreshAll();
            return;
        }

        const workingPipes = latestNetworkState ? latestNetworkState.pipelines.filter(p => p.isWorking) : [];
        if (workingPipes.length === 0) {
            showNotice('info', 'All pipelines are already broken.');
            return;
        }
        const randomPipe = workingPipes[Math.floor(Math.random() * workingPipes.length)];
        const res = await fetch('/api/pipelines/fail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipeline_id: randomPipe.id })
        });
        const result = await res.json();
        showNotice('info', `Simulated failure on Pipeline ${randomPipe.id}. Check connected areas downstream.`);
        lastRenderedStateSignature = '';
        await refreshAll();
    } catch (err) {
        showNotice('error', 'Error failing pipeline.');
    } finally {
        isPerformingAction = false;
    }
}

function renderForecast(data) {
    const container = document.getElementById('forecastContentContainer');
    if (!container) return; // Not on the forecast page

    const daysLabel = document.getElementById('forecastDaysLabel');
    const countBadge = document.getElementById('forecastCountBadge');

    if (!data || !data.forecasts || data.forecasts.length === 0) {
        if (daysLabel) daysLabel.textContent = `${data ? data.dayCount : 0} day(s) of data`;
        if (countBadge) countBadge.textContent = '0';
        container.innerHTML = '<div class="history-empty">Not enough data yet. Complete at least 2 simulation days to see forecasts.</div>';
        return;
    }

    if (daysLabel) daysLabel.textContent = `${data.dayCount} day(s) of data`;
    if (countBadge) countBadge.textContent = data.forecasts.length;

    const sufficientClass = data.sufficient ? 'forecast-ok' : 'forecast-warn';
    const statusLabel = data.sufficient ? '✓ Sufficient' : '⚠ At Risk';

    container.innerHTML = `
        <div class="forecast-summary">
            <div class="forecast-stat">
                <span class="forecast-stat-label">Predicted total demand</span>
                <span class="forecast-stat-value">${Number(data.totalPredicted).toLocaleString()} <small>L</small></span>
            </div>
            <div class="forecast-stat">
                <span class="forecast-stat-label">Daily supply capacity</span>
                <span class="forecast-stat-value">${Number(data.totalDailyCapacity).toLocaleString()} <small>L</small></span>
            </div>
            <div class="forecast-stat">
                <span class="forecast-stat-label">Status</span>
                <span class="forecast-stat-value ${sufficientClass}">${statusLabel}</span>
            </div>
        </div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>AREA</th>
                        <th>CURRENT</th>
                        <th>PREDICTED</th>
                        <th>TREND</th>
                        <th>CONFIDENCE</th>
                        <th>RISK</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.forecasts.map(fc => {
                        const trendClass = fc.trend === 'RISING' ? 'trend-rising' : (fc.trend === 'FALLING' ? 'trend-falling' : 'trend-stable');
                        const confClass = 'conf-' + String(fc.confidence || '').toLowerCase();
                        return `
                            <tr>
                                <td>
                                    <span class="id-badge">${escapeHtml(fc.areaId)}</span>
                                    <span class="primary-cell">${escapeHtml(fc.areaName)}</span>
                                </td>
                                <td>${Number(fc.currentDemand).toLocaleString()} L</td>
                                <td><strong>${Number(fc.predicted).toLocaleString()} L</strong></td>
                                <td>
                                    <span class="${trendClass}">${escapeHtml(fc.trendSymbol)} ${Math.abs(fc.trendPct).toFixed(1)}%</span>
                                </td>
                                <td><span class="confidence-badge ${confClass}">${escapeHtml(fc.confidence)}</span></td>
                                <td>
                                    ${fc.risk ? '<span class="status-pill disconnected">⚠ Risk</span>' : '<span class="status-pill connected">OK</span>'}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ---------------------------------------------------------
// User Interaction Handlers
// ---------------------------------------------------------

async function togglePipeline(pipelineId, isWorking) {
    if (isPerformingAction) return;
    isPerformingAction = true;

    try {
        if (window.supabaseService) {
            const result = await window.supabaseService.data.togglePipeline(pipelineId, isWorking);
            if (result.success) {
                showNotice('success', result.message);
            } else {
                showNotice('info', result.message || 'Pipeline status updated.');
            }
            lastRenderedStateSignature = '';
            await refreshAll();
            if (selectedEntity && selectedEntity.type === 'pipe' && selectedEntity.id === pipelineId) {
                inspectPipe(pipelineId, true);
            }
            return;
        }

        const endpoint = isWorking ? '/api/pipelines/fail' : '/api/pipelines/repair';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipeline_id: pipelineId })
        });
        const result = await res.json();
        if (result.success) {
            showNotice('success', result.message);
            lastRenderedStateSignature = '';
            await refreshAll();
            if (selectedEntity && selectedEntity.type === 'pipe' && selectedEntity.id === pipelineId) {
                inspectPipe(pipelineId, true);
            }
        } else {
            showNotice('info', result.message || result.error);
        }
    } catch (err) {
        showNotice('error', 'Failed to toggle pipeline status.');
    } finally {
        isPerformingAction = false;
    }
}

async function handleRefillReservoirs() {
    if (isPerformingAction) return;
    if (!confirm('Start a new simulation day? This will refill all reservoirs to 100% capacity and reset daily demand allocation for the next day.')) {
        return;
    }
    isPerformingAction = true;
    showNotice('info', 'Refilling reservoirs and starting next simulation day...');
    try {
        if (window.supabaseService) {
            const result = await window.supabaseService.data.resetSimulationDay();
            if (result.success) {
                showNotice('success', result.message);
                await refreshAll();
            } else {
                showNotice('error', result.error || 'Failed to refill reservoirs.');
            }
            return;
        }

        const res = await fetch('/api/simulation/reset-day', { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            showNotice('success', result.message);
            await refreshAll();
        } else {
            showNotice('error', result.error || 'Failed to refill reservoirs.');
        }
    } catch (err) {
        showNotice('error', 'Network error refilling reservoirs.');
    } finally {
        isPerformingAction = false;
    }
}
window.handleRefillReservoirs = handleRefillReservoirs;

async function refreshAll() {
    const [state, forecast] = await Promise.all([
        fetchNetworkState(),
        fetchForecastData()
    ]);
    if (state) renderDashboard(state);
    if (forecast) renderForecast(forecast);
}

// ---------------------------------------------------------
// Application Initialization
// ---------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Ensure Supabase Client connection is fully initialized
    if (window.supabaseService) {
        await window.supabaseService.initClient();
    }

    // 1. Authenticate user
    try {
        let user = null;
        if (window.supabaseService) {
            user = await window.supabaseService.auth.getCurrentUser();
        }
        if (!user) {
            try {
                const authRes = await fetch('/api/me');
                const authData = await authRes.json();
                if (authData.authenticated) user = authData;
            } catch (e) {}
        }

        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // ROLE ENFORCEMENT:
        // Public users can ONLY access the water request portal (public.html)!
        const currentPath = (window.location.pathname || '').toLowerCase();
        if (user.role === 'public' && !currentPath.includes('public.html') && !currentPath.includes('public-login.html')) {
            window.location.href = 'public.html';
            return;
        }

        const userDisplay = document.getElementById('currentUserDisplay');
        if (userDisplay) {
            userDisplay.textContent = (user.username || user.email) + (user.role ? ` (${user.role.toUpperCase()})` : '');
        }
    } catch (err) {
        console.error('Auth verification failed', err);
    }

    // 2. Sign out button
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            if (window.supabaseService) {
                await window.supabaseService.auth.signOut();
            }
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch (err) {}
            window.location.href = 'login.html';
        });
    }

    // 3. Add Request Form
    const addRequestForm = document.getElementById('addRequestForm');
    const addRequestBtn = document.getElementById('addRequestBtn');
    if (addRequestForm && addRequestBtn) {
        addRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const areaId = document.getElementById('area_id').value;
            const requestedLitres = document.getElementById('requested_litres').value;

            addRequestBtn.disabled = true;
            try {
                if (window.supabaseService) {
                    const result = await window.supabaseService.data.addWaterRequest(areaId, requestedLitres);
                    if (result.success) {
                        showNotice('success', result.message);
                        document.getElementById('requested_litres').value = '';
                        await refreshAll();
                    } else {
                        showNotice('error', result.error || 'Failed to add request.');
                    }
                    return;
                }

                const res = await fetch('/api/requests/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ area_id: areaId, requested_litres: requestedLitres })
                });
                const result = await res.json();
                if (result.success) {
                    showNotice('success', result.message);
                    document.getElementById('requested_litres').value = '';
                    refreshAll();
                } else {
                    showNotice('error', result.error || 'Failed to add request.');
                }
            } catch (err) {
                showNotice('error', 'Network error adding request.');
            } finally {
                addRequestBtn.disabled = false;
            }
        });
    }

    // 4. Allocate Water Button
    const allocateBtn = document.getElementById('allocateWaterBtn');
    if (allocateBtn) {
        allocateBtn.addEventListener('click', async () => {
            allocateBtn.disabled = true;
            allocateBtn.textContent = 'Allocating...';
            try {
                if (window.supabaseService) {
                    const result = await window.supabaseService.data.allocateWater();
                    if (result.success) {
                        showNotice('success', result.message);
                        await refreshAll();
                    } else {
                        showNotice('info', result.message || 'No requests to allocate.');
                    }
                    return;
                }

                const res = await fetch('/api/requests/allocate', { method: 'POST' });
                const result = await res.json();
                if (result.success) {
                    showNotice('success', result.message);
                    refreshAll();
                } else {
                    showNotice('info', result.message || 'No requests to allocate.');
                }
            } catch (err) {
                showNotice('error', 'Network error allocating water.');
            } finally {
                allocateBtn.disabled = false;
                allocateBtn.textContent = 'Allocate pending water';
            }
        });
    }

    // Setup Filter Tabs on Requests page
    const filterTabs = document.querySelectorAll('#requestFilterTabs .filter-tab-btn');
    filterTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            filterTabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRequestFilter = btn.dataset.filter || 'all';
            if (lastKnownState) renderDashboard(lastKnownState);
        });
    });

    // 5. Refill Reservoirs / Reset Simulation Day
    const refillButtons = document.querySelectorAll('.refill-reservoirs-btn');
    refillButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleRefillReservoirs();
        });
    });

    const resetDayForm = document.getElementById('resetDayForm');
    if (resetDayForm) {
        resetDayForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleRefillReservoirs();
        });
    }

    // 6. Pipeline Map Action buttons
    const mapRepairAllBtn = document.getElementById('mapRepairAllBtn');
    if (mapRepairAllBtn) {
        mapRepairAllBtn.addEventListener('click', repairAllPipes);
    }
    const mapBreakRandomBtn = document.getElementById('mapBreakRandomBtn');
    if (mapBreakRandomBtn) {
        mapBreakRandomBtn.addEventListener('click', breakRandomPipe);
    }

    // 7. Navigation Link active tracking based on page filename
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const navLinks = document.querySelectorAll('.navigation .nav-link');
    navLinks.forEach(link => {
        const href = (link.getAttribute('href') || '').toLowerCase();
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // 8. Initial Data Load
    await refreshAll();

    // 9. Subscribe to live Supabase Realtime changes
    if (window.supabaseService) {
        window.supabaseService.subscribeRealtime(() => {
            refreshAll();
        });
    }

    // 10. Auto-sync heartbeat every 4 seconds
    setInterval(refreshAll, 4000);
});

// ---------------------------------------------------------
// Global Action Handlers for Admin Approval Desk
// ---------------------------------------------------------
window.handleAcceptRequest = async function(requestId) {
    if (isPerformingAction) return;
    isPerformingAction = true;
    try {
        let result = null;
        if (window.supabaseService) {
            result = await window.supabaseService.data.acceptWaterRequest(requestId);
        } else {
            const res = await fetch('/api/requests/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId })
            });
            result = await res.json();
        }
        if (result && result.success) {
            showNotice('success', result.message || `Request ${requestId} accepted and queued for water distribution.`);
            await refreshAll();
        } else {
            showNotice('error', result?.error || 'Could not accept request.');
        }
    } catch (e) {
        showNotice('error', 'Error accepting request: ' + e.message);
    } finally {
        isPerformingAction = false;
    }
};

window.handleRejectRequest = async function(requestId) {
    if (isPerformingAction) return;
    const reason = prompt(`Enter reason for rejecting request ${requestId}:`, "Demand exceeds daily area quota or pipeline capacity");
    if (reason === null) return; // User cancelled prompt
    isPerformingAction = true;
    try {
        let result = null;
        if (window.supabaseService) {
            result = await window.supabaseService.data.rejectWaterRequest(requestId, reason);
        } else {
            const res = await fetch('/api/requests/reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId, reason: reason })
            });
            result = await res.json();
        }
        if (result && result.success) {
            showNotice('info', result.message || `Request ${requestId} rejected.`);
            await refreshAll();
        } else {
            showNotice('error', result?.error || 'Could not reject request.');
        }
    } catch (e) {
        showNotice('error', 'Error rejecting request: ' + e.message);
    } finally {
        isPerformingAction = false;
    }
};

// Global Window Exports for SVG and Inline DOM Handlers
window.togglePipeline = togglePipeline;
window.handlePipeClick = handlePipeClick;
window.handleBadgeClick = handleBadgeClick;
window.inspectPipe = inspectPipe;
window.handleInspectorMouseLeave = handleInspectorMouseLeave;
window.resetInspector = resetInspector;
window.selectReservoir = selectReservoir;
window.selectArea = selectArea;
window.inspectReservoir = inspectReservoir;
window.inspectArea = inspectArea;
window.repairAllPipes = repairAllPipes;
window.breakRandomPipe = breakRandomPipe;
