/**
 * WaterGrid - Supabase Configuration & Connection Manager
 * Provides dynamic Supabase credentials, connection testing,
 * and an interactive UI modal for project pairing.
 */

(function () {
    const STORAGE_KEY_URL = 'WATERGRID_SUPABASE_URL';
    const STORAGE_KEY_ANON = 'WATERGRID_SUPABASE_ANON_KEY';

    // Default configuration (pre-populated with user's live Supabase cloud project)
    const DEFAULT_URL = 'https://wumtzyikxpdsglymdzhy.supabase.co';
    const DEFAULT_ANON = 'sb_publishable_11yzmNUQkcKsh0gi_n3Ypw_uITIDWRn';

    window.WaterGridConfig = {
        getUrl: function () {
            return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_URL;
        },
        getAnonKey: function () {
            return localStorage.getItem(STORAGE_KEY_ANON) || DEFAULT_ANON;
        },
        isConfigured: function () {
            const url = this.getUrl();
            const key = this.getAnonKey();
            return Boolean(url && url.trim().startsWith('http') && key && key.trim().length > 15);
        },
        saveConfig: function (url, key) {
            if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim().replace(/\/$/, ''));
            if (key) localStorage.setItem(STORAGE_KEY_ANON, key.trim());
        },
        clearConfig: function () {
            localStorage.removeItem(STORAGE_KEY_URL);
            localStorage.removeItem(STORAGE_KEY_ANON);
        }
    };

    // Inject connection status badge and modal into DOM once loaded
    document.addEventListener('DOMContentLoaded', () => {
        injectSupabaseUI();
    });

    function injectSupabaseUI() {
        // Prevent duplicate injection
        if (document.getElementById('supabaseConfigModal')) return;

        // 1. Create Modal Markup
        const modal = document.createElement('div');
        modal.id = 'supabaseConfigModal';
        modal.className = 'supabase-modal-backdrop';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="supabase-modal" role="dialog" aria-modal="true" aria-labelledby="supabaseModalTitle">
                <div class="supabase-modal-header">
                    <div>
                        <div class="eyebrow" style="color: #38bdf8;">CLOUD DATABASE</div>
                        <h2 id="supabaseModalTitle" style="margin: 0; font-size: 1.25rem; font-weight: 600;">Supabase Backend Settings</h2>
                    </div>
                    <button type="button" class="supabase-modal-close" id="supabaseModalCloseBtn" aria-label="Close">&times;</button>
                </div>
                
                <div class="supabase-modal-body">
                    <p style="color: var(--muted); font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                        Connect WaterGrid directly to your Supabase PostgreSQL database for persistent water tracking, live real-time pipeline telemetry, and user authentication.
                    </p>

                    <div id="supabaseStatusAlert" class="supabase-status-banner">
                        <span class="status-dot"></span>
                        <span id="supabaseStatusText">Checking connection...</span>
                    </div>

                    <form id="supabaseConfigForm" style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px;">
                        <div>
                            <label for="cfgSupabaseUrl" style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 6px;">
                                Supabase Project URL
                            </label>
                            <input 
                                type="url" 
                                id="cfgSupabaseUrl" 
                                placeholder="https://your-project-id.supabase.co" 
                                class="supabase-input"
                                autocomplete="off"
                                spellcheck="false"
                            >
                            <small style="color: var(--muted); font-size: 11px;">Found under: Supabase Project Settings &rarr; API &rarr; Project URL</small>
                        </div>

                        <div>
                            <label for="cfgSupabaseAnonKey" style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--muted); margin-bottom: 6px;">
                                Supabase Anon / Public Key
                            </label>
                            <input 
                                type="password" 
                                id="cfgSupabaseAnonKey" 
                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                class="supabase-input"
                                autocomplete="off"
                                spellcheck="false"
                            >
                            <small style="color: var(--muted); font-size: 11px;">Found under: Supabase Project Settings &rarr; API &rarr; Project API Keys (anon public)</small>
                        </div>

                        <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
                            <button type="submit" id="cfgSaveBtn" class="button button-primary" style="flex: 1;">
                                Connect & Save
                            </button>
                            <button type="button" id="cfgTestBtn" class="button button-secondary" style="flex: 1;">
                                Test Connection
                            </button>
                        </div>
                    </form>

                    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 12px; font-weight: 600; color: var(--text);">Database Schema &amp; Seed Data</span>
                            <button type="button" id="cfgCopySqlBtn" class="mini-button" style="padding: 4px 10px;">
                                📋 Copy SQL Schema
                            </button>
                        </div>
                        <p style="font-size: 11px; color: var(--muted); margin: 0; line-height: 1.4;">
                            Run <code style="color: #38bdf8;">supabase_schema.sql</code> in your Supabase SQL Editor to create tables for reservoirs, demand areas, pipelines, and audit logs.
                        </p>
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button type="button" id="cfgResetLocalBtn" class="mini-button" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #f87171;">
                                Disconnect (Use Local Demo Mode)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 2. Add Status Pill in Header or Sidebar
        updateSupabaseStatusBadges();

        // 3. Event Listeners for Modal
        const closeBtn = document.getElementById('supabaseModalCloseBtn');
        if (closeBtn) closeBtn.onclick = closeSupabaseModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeSupabaseModal();
        };

        const form = document.getElementById('supabaseConfigForm');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const url = document.getElementById('cfgSupabaseUrl').value.trim();
                const key = document.getElementById('cfgSupabaseAnonKey').value.trim();

                if (!url || !key) {
                    alert('Please enter both Supabase Project URL and Anon Public Key.');
                    return;
                }

                const saveBtn = document.getElementById('cfgSaveBtn');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving & Connecting...';

                window.WaterGridConfig.saveConfig(url, key);

                if (window.supabaseService) {
                    await window.supabaseService.initClient();
                    const status = await window.supabaseService.testConnection();
                    if (status.ok) {
                        alert('✓ Successfully connected to Supabase PostgreSQL database!');
                        closeSupabaseModal();
                        window.location.reload();
                    } else {
                        alert('Configuration saved, but connection test failed: ' + status.error + '\n\nPlease check your Project URL and Anon Key.');
                        updateModalStatusBanner(false, status.error);
                    }
                } else {
                    window.location.reload();
                }
                saveBtn.disabled = false;
                saveBtn.textContent = 'Connect & Save';
            };
        }

        const testBtn = document.getElementById('cfgTestBtn');
        if (testBtn) {
            testBtn.onclick = async () => {
                testBtn.disabled = true;
                testBtn.textContent = 'Testing...';
                const url = document.getElementById('cfgSupabaseUrl').value.trim();
                const key = document.getElementById('cfgSupabaseAnonKey').value.trim();

                if (url && key) {
                    window.WaterGridConfig.saveConfig(url, key);
                    if (window.supabaseService) {
                        await window.supabaseService.initClient();
                    }
                }

                if (window.supabaseService) {
                    const status = await window.supabaseService.testConnection();
                    updateModalStatusBanner(status.ok, status.ok ? 'Connection verified to Supabase tables' : status.error);
                }
                testBtn.disabled = false;
                testBtn.textContent = 'Test Connection';
            };
        }

        const copySqlBtn = document.getElementById('cfgCopySqlBtn');
        if (copySqlBtn) {
            copySqlBtn.onclick = async () => {
                try {
                    const res = await fetch('supabase_schema.sql');
                    if (res.ok) {
                        const sql = await res.text();
                        await navigator.clipboard.writeText(sql);
                        copySqlBtn.textContent = '✓ Copied SQL!';
                        setTimeout(() => copySqlBtn.textContent = '📋 Copy SQL Schema', 3000);
                    } else {
                        alert('Could not automatically read supabase_schema.sql. Please copy it directly from your project directory.');
                    }
                } catch (err) {
                    alert('Please copy supabase_schema.sql from the project directory into Supabase SQL Editor.');
                }
            };
        }

        const resetLocalBtn = document.getElementById('cfgResetLocalBtn');
        if (resetLocalBtn) {
            resetLocalBtn.onclick = () => {
                if (confirm('Disconnect Supabase and switch to Local In-Memory Demo mode?')) {
                    window.WaterGridConfig.clearConfig();
                    window.location.reload();
                }
            };
        }
    }

    window.openSupabaseModal = function () {
        const modal = document.getElementById('supabaseConfigModal');
        if (!modal) return;

        const urlInput = document.getElementById('cfgSupabaseUrl');
        const keyInput = document.getElementById('cfgSupabaseAnonKey');
        if (urlInput) urlInput.value = window.WaterGridConfig.getUrl();
        if (keyInput) keyInput.value = window.WaterGridConfig.getAnonKey();

        modal.style.display = 'flex';

        // Check status on open
        if (window.supabaseService) {
            window.supabaseService.testConnection().then(status => {
                updateModalStatusBanner(status.ok, status.ok ? 'Connected to live Supabase database' : status.error);
            });
        }
    };

    window.closeSupabaseModal = function () {
        const modal = document.getElementById('supabaseConfigModal');
        if (modal) modal.style.display = 'none';
    };

    function updateModalStatusBanner(isLive, message) {
        const banner = document.getElementById('supabaseStatusAlert');
        const text = document.getElementById('supabaseStatusText');
        if (!banner || !text) return;

        if (isLive) {
            banner.className = 'supabase-status-banner banner-live';
            text.textContent = '● Supabase Connected: ' + (message || 'Tables Ready');
        } else {
            banner.className = 'supabase-status-banner banner-standby';
            text.textContent = '○ Local Demo Mode (' + (message || 'Configure Supabase credentials') + ')';
        }
    }

    function updateSupabaseStatusBadges() {
        const isConfigured = window.WaterGridConfig.isConfigured();

        // 1. Update or inject into topbar-right
        const topbarRight = document.querySelector('.topbar-right');
        if (topbarRight) {
            let badge = document.getElementById('supabaseTopbarBadge');
            if (!badge) {
                badge = document.createElement('button');
                badge.id = 'supabaseTopbarBadge';
                badge.type = 'button';
                badge.className = 'preview-tag supabase-status-pill';
                badge.onclick = window.openSupabaseModal;
                topbarRight.insertBefore(badge, topbarRight.firstChild);
            }
            if (isConfigured) {
                badge.innerHTML = `<span class="status-dot dot-live"></span>Supabase: Live Cloud`;
                badge.title = 'Supabase Cloud Connected (Click to manage)';
            } else {
                badge.innerHTML = `<span class="status-dot dot-demo"></span>Supabase: Standby Mode`;
                badge.title = 'Running in Demo Mode (Click to connect your Supabase project)';
            }
        }

        // 2. Update sidebar bottom status if present
        const sidebarStatus = document.querySelector('.sidebar-bottom .system-status');
        if (sidebarStatus) {
            if (isConfigured) {
                sidebarStatus.innerHTML = `<span class="status-dot dot-live"></span>Supabase Cloud Connected`;
            } else {
                sidebarStatus.innerHTML = `<span class="status-dot dot-demo"></span>Supabase Engine Standby`;
            }
            sidebarStatus.style.cursor = 'pointer';
            sidebarStatus.onclick = window.openSupabaseModal;
        }
    }

    // Export badge updater for use by supabase-service
    window.updateSupabaseStatusBadges = updateSupabaseStatusBadges;
})();
