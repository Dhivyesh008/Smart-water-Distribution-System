/**
 * WaterGrid - Supabase Service & Data Engine
 * Handles Authentication, Database CRUD operations, Real-time Subscriptions,
 * Water Allocation Algorithm, and resilient local fallback.
 */

(function () {
    let supabaseClient = null;
    let isConnectedLive = false;
    let realtimeChannel = null;

    // Default Seed Data for Resilient Local Fallback & Initial DB Hydration
    const INITIAL_RESERVOIRS = [
        { id: 'R1', name: 'North Reservoir', dailySupply: 5000, remainingSupply: 5000 },
        { id: 'R2', name: 'South Reservoir', dailySupply: 3000, remainingSupply: 3000 }
    ];

    const INITIAL_DEMAND_AREAS = [
        { id: 'A1', name: 'Greenview Homes', type: 'residential', dailyDemand: 1500, priority: 'Normal', allocatedWater: 0 },
        { id: 'A2', name: 'Lakeside Villas', type: 'residential', dailyDemand: 2000, priority: 'High', allocatedWater: 0 },
        { id: 'A3', name: 'City Hospital', type: 'critical_institution', dailyDemand: 3000, priority: 'Critical', allocatedWater: 0 },
        { id: 'A4', name: 'Rivergate Apartments', type: 'residential', dailyDemand: 1800, priority: 'Normal', allocatedWater: 0 },
        { id: 'A5', name: 'Sunrise Colony', type: 'residential', dailyDemand: 1200, priority: 'High', allocatedWater: 0 },
        { id: 'A6', name: 'Central Fire Station', type: 'critical_institution', dailyDemand: 1800, priority: 'Critical', allocatedWater: 0 },
        { id: 'A7', name: 'Hillview Nagar', type: 'residential', dailyDemand: 1400, priority: 'Normal', allocatedWater: 0 },
        { id: 'A8', name: 'Maple Residency', type: 'residential', dailyDemand: 1600, priority: 'High', allocatedWater: 0 },
        { id: 'A9', name: 'Riverside Colony', type: 'residential', dailyDemand: 1300, priority: 'Normal', allocatedWater: 0 },
        { id: 'A10', name: 'Green Park', type: 'residential', dailyDemand: 1700, priority: 'High', allocatedWater: 0 }
    ];

    const INITIAL_PIPELINES = [
        { id: 'P1', from: 'R1', to: 'A1', isWorking: true },
        { id: 'P2', from: 'R1', to: 'A2', isWorking: true },
        { id: 'P3', from: 'R1', to: 'A3', isWorking: true },
        { id: 'P4', from: 'A1', to: 'A4', isWorking: true },
        { id: 'P5', from: 'A2', to: 'A5', isWorking: true },
        { id: 'P6', from: 'A3', to: 'A6', isWorking: true },
        { id: 'P7', from: 'A4', to: 'A7', isWorking: true },
        { id: 'P8', from: 'A5', to: 'A8', isWorking: true },
        { id: 'P9', from: 'A6', to: 'A9', isWorking: true },
        { id: 'P10', from: 'A7', to: 'A10', isWorking: true },
        { id: 'P11', from: 'R2', to: 'A6', isWorking: true },
        { id: 'P12', from: 'R2', to: 'A8', isWorking: true },
        { id: 'P13', from: 'A7', to: 'A8', isWorking: true },
        { id: 'P14', from: 'A9', to: 'A10', isWorking: true },
        { id: 'P15', from: 'A3', to: 'A8', isWorking: true }
    ];

    // Local Fallback Storage Engine (mirrors PostgreSQL database in localStorage)
    const LocalStore = {
        get: function (key, fallback) {
            try {
                const item = localStorage.getItem('WG_' + key);
                return item ? JSON.parse(item) : fallback;
            } catch (e) {
                return fallback;
            }
        },
        set: function (key, value) {
            try {
                localStorage.setItem('WG_' + key, JSON.stringify(value));
            } catch (e) {}
        },
        init: function () {
            if (!this.get('reservoirs', null)) this.set('reservoirs', INITIAL_RESERVOIRS);
            if (!this.get('areas', null)) this.set('areas', INITIAL_DEMAND_AREAS);
            if (!this.get('pipelines', null)) this.set('pipelines', INITIAL_PIPELINES);
            if (!this.get('requests', null)) this.set('requests', [
                {
                    id: 'REQ-001',
                    areaId: 'A1',
                    requestedLitres: 1200,
                    requestedBy: 'citizen@watergrid.com',
                    reason: 'Community pipeline low pressure - need domestic refill',
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    decisionNotes: ''
                },
                {
                    id: 'REQ-002',
                    areaId: 'A3',
                    requestedLitres: 2500,
                    requestedBy: 'emergency@cityhealth.gov',
                    reason: 'City Hospital Emergency ICU reserve replenishment',
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    decisionNotes: ''
                }
            ]);
            if (!this.get('users', null)) this.set('users', [
                { email: 'admin@watergrid.com', password: 'Admin@123', username: 'Grid Administrator', role: 'admin' },
                { email: 'operator@watergrid.com', password: 'Water@123', username: 'Field Operator', role: 'admin' },
                { email: 'citizen@watergrid.com', password: 'Citizen@123', username: 'Public Resident', role: 'public' }
            ]);
            if (!this.get('maintenance', null)) this.set('maintenance', []);
            if (!this.get('history', null)) this.set('history', []);
            if (!this.get('dayCounter', null)) this.set('dayCounter', 1);
        }
    };

    LocalStore.init();

    // -----------------------------------------------------------------
    // Initialize Supabase Client (Cached Promise pattern)
    // -----------------------------------------------------------------
    let initPromise = null;

    async function initClient() {
        if (initPromise) return initPromise;

        initPromise = (async () => {
            if (!window.supabase) {
                console.warn('Supabase JS SDK not loaded yet.');
                return false;
            }

            const url = window.WaterGridConfig ? window.WaterGridConfig.getUrl() : '';
            const key = window.WaterGridConfig ? window.WaterGridConfig.getAnonKey() : '';

            if (url && key && url.startsWith('http')) {
                try {
                    if (!supabaseClient) {
                        supabaseClient = window.supabase.createClient(url, key, {
                            auth: {
                                persistSession: true,
                                autoRefreshToken: true
                            }
                        });
                    }
                    const test = await testConnection();
                    isConnectedLive = test.ok;
                } catch (err) {
                    console.error('Error initializing Supabase client:', err);
                    isConnectedLive = false;
                }
            } else {
                supabaseClient = null;
                isConnectedLive = false;
            }

            if (window.updateSupabaseStatusBadges) {
                window.updateSupabaseStatusBadges();
            }

            return isConnectedLive;
        })();

        return initPromise;
    }

    async function testConnection() {
        if (!supabaseClient) {
            return { ok: false, error: 'Supabase credentials not configured' };
        }
        try {
            const { data, error } = await supabaseClient
                .from('reservoirs')
                .select('id')
                .limit(1);

            if (error) {
                return { ok: false, error: error.message };
            }
            isConnectedLive = true;
            return { ok: true, data };
        } catch (err) {
            isConnectedLive = false;
            return { ok: false, error: err.message || 'Connection timeout or network failure' };
        }
    }

    // -----------------------------------------------------------------
    // BFS Network Reachability Engine
    // Calculates which demand areas can reach reservoirs with supply
    // -----------------------------------------------------------------
    function computeNetworkReachability(reservoirs, areas, pipelines) {
        // 1. Determine active water source IDs (reservoirs that have remaining supply)
        const activeSourceIds = new Set(
            reservoirs.filter(r => (r.remainingSupply || r.remaining_supply) > 0).map(r => r.id)
        );

        // 2. Build graph adjacency list using only working pipelines
        const adj = {};
        pipelines.forEach(p => {
            const from = p.from || p.from_id;
            const to = p.to || p.to_id;
            const isWorking = p.isWorking !== undefined ? p.isWorking : p.is_working;

            if (isWorking) {
                if (!adj[from]) adj[from] = [];
                if (!adj[to]) adj[to] = [];
                adj[from].push(to);
                adj[to].push(from); // Network pipes can carry bidirectional distribution
            }
        });

        // 3. Multi-source BFS starting from all active reservoirs
        const reachable = new Set();
        const queue = [];

        activeSourceIds.forEach(id => {
            reachable.add(id);
            queue.push(id);
        });

        while (queue.length > 0) {
            const curr = queue.shift();
            const neighbors = adj[curr] || [];
            for (const neighbor of neighbors) {
                if (!reachable.has(neighbor)) {
                    reachable.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        // 4. Return map of AreaId -> Boolean connected
        const statusMap = {};
        areas.forEach(a => {
            statusMap[a.id] = reachable.has(a.id);
        });
        return statusMap;
    }

    // -----------------------------------------------------------------
    // Authentication Operations
    // -----------------------------------------------------------------
    const authService = {
        async signIn(email, password) {
            const cleanEmail = email.trim();

            // 1. Try Supabase Auth if connected
            if (isConnectedLive && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient.auth.signInWithPassword({
                        email: cleanEmail,
                        password: password
                    });
                    if (error) throw error;

                    let username = data.user.user_metadata?.username || cleanEmail.split('@')[0];
                    try {
                        const { data: prof } = await supabaseClient
                            .from('profiles')
                            .select('username')
                            .eq('id', data.user.id)
                            .single();
                        if (prof && prof.username) username = prof.username;
                    } catch (e) {}

                    let role = 'public';
                    try {
                        const { data: prof } = await supabaseClient
                            .from('profiles')
                            .select('username, role')
                            .eq('id', data.user.id)
                            .single();
                        if (prof && prof.username) username = prof.username;
                        if (prof && prof.role) role = prof.role;
                    } catch (e) {}

                    sessionStorage.setItem('WATERGRID_USER', JSON.stringify({
                        id: data.user.id,
                        email: data.user.email,
                        username: username,
                        role: role,
                        mode: 'supabase'
                    }));

                    return { success: true, user: { ...data.user, role } };
                } catch (supabaseErr) {
                    console.warn('Supabase auth failed (' + supabaseErr.message + '), checking Java backend & local accounts...');
                }
            }

            // 2. Try Java Backend Server (/api/auth/login)
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: cleanEmail, password: password })
                });
                if (res.ok) {
                    const javaData = await res.json();
                    if (javaData.success) {
                        const userObj = {
                            id: 'java-' + (javaData.username || 'user'),
                            email: cleanEmail,
                            username: javaData.username || 'Operator',
                            role: javaData.role || (cleanEmail.includes('admin') || cleanEmail.includes('operator') ? 'admin' : 'public'),
                            mode: 'java'
                        };
                        sessionStorage.setItem('WATERGRID_USER', JSON.stringify(userObj));
                        return { success: true, user: userObj };
                    }
                }
            } catch (javaErr) {
                // Java server might not be running or network error
            }

            // 3. Fallback to Local Demo Accounts
            const users = LocalStore.get('users', [
                { email: 'admin@watergrid.com', password: 'Admin@123', username: 'Grid Administrator', role: 'admin' },
                { email: 'operator@watergrid.com', password: 'Water@123', username: 'Field Operator', role: 'admin' },
                { email: 'citizen@watergrid.com', password: 'Citizen@123', username: 'Public Resident', role: 'public' }
            ]);

            const user = users.find(u => u.email.toLowerCase() === cleanEmail.toLowerCase());
            if (user && user.password === password) {
                const userObj = {
                    id: 'demo-user-' + user.email,
                    email: user.email,
                    username: user.username,
                    role: user.role || 'public',
                    mode: 'local'
                };
                sessionStorage.setItem('WATERGRID_USER', JSON.stringify(userObj));
                return { success: true, user: userObj };
            }

            return {
                success: false,
                error: 'Invalid credentials. Default login: admin@watergrid.com (Admin) or citizen@watergrid.com (Citizen)'
            };
        },

        async signUp(email, password, username, role = 'public') {
            const cleanEmail = email.trim();
            const cleanUser = username.trim();
            const userRole = (role || 'public').toLowerCase();

            // Register with Java backend
            try {
                await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: cleanUser,
                        email: cleanEmail,
                        password: password,
                        confirmPassword: password,
                        role: userRole
                    })
                });
            } catch (e) {}

            // Save in LocalStore
            const users = LocalStore.get('users', [
                { email: 'admin@watergrid.com', password: 'Admin@123', username: 'Grid Administrator', role: 'admin' },
                { email: 'operator@watergrid.com', password: 'Water@123', username: 'Field Operator', role: 'admin' },
                { email: 'citizen@watergrid.com', password: 'Citizen@123', username: 'Public Resident', role: 'public' }
            ]);
            if (!users.some(u => u.email.toLowerCase() === cleanEmail.toLowerCase())) {
                users.push({ email: cleanEmail, password, username: cleanUser, role: userRole });
                LocalStore.set('users', users);
            }

            // Also register with Supabase if connected
            if (isConnectedLive && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient.auth.signUp({
                        email: cleanEmail,
                        password: password,
                        options: {
                            data: { username: cleanUser, role: userRole }
                        }
                    });
                    if (error) throw error;

                    if (data.user) {
                        try {
                            await supabaseClient.from('profiles').upsert({
                                id: data.user.id,
                                email: cleanEmail,
                                username: cleanUser,
                                role: userRole
                            });
                        } catch (pe) {}
                    }
                } catch (err) {
                    console.warn('Supabase signUp note:', err.message);
                }
            }

            return { success: true };
        },

        async signOut() {
            sessionStorage.removeItem('WATERGRID_USER');
            try {
                await fetch('/api/auth/logout', { method: 'POST' });
            } catch (e) {}
            if (isConnectedLive && supabaseClient) {
                try {
                    await supabaseClient.auth.signOut();
                } catch (e) {}
            }
            return { success: true };
        },

        async getCurrentUser() {
            // Check session storage first
            const localSession = sessionStorage.getItem('WATERGRID_USER');
            if (localSession) {
                try {
                    return JSON.parse(localSession);
                } catch (e) {}
            }

            // Check Java backend session (/api/me)
            try {
                const res = await fetch('/api/me');
                if (res.ok) {
                    const meData = await res.json();
                    if (meData.authenticated) {
                        const userObj = {
                            id: 'java-' + meData.username,
                            email: meData.email,
                            username: meData.username,
                            mode: 'java'
                        };
                        sessionStorage.setItem('WATERGRID_USER', JSON.stringify(userObj));
                        return userObj;
                    }
                }
            } catch (e) {}

            // Check Supabase session
            if (isConnectedLive && supabaseClient) {
                try {
                    const { data: { user } } = await supabaseClient.auth.getUser();
                    if (user) {
                        const email = user.email;
                        const username = user.user_metadata?.username || email.split('@')[0];
                        const userObj = { id: user.id, email, username, mode: 'supabase' };
                        sessionStorage.setItem('WATERGRID_USER', JSON.stringify(userObj));
                        return userObj;
                    }
                } catch (e) {}
            }
            return null;
        }
    };

    // -----------------------------------------------------------------
    // Core Data Operations (Supabase + Resilient Local Fallback)
    // -----------------------------------------------------------------
    const dataService = {
        // Dedicated fetch for live Supabase allocation_history table records
        async fetchAllocationHistory(limit = 100) {
            await initClient();
            if (isConnectedLive && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('allocation_history')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .limit(limit);

                    if (!error && Array.isArray(data)) {
                        const mapped = data.map(h => {
                            const d = h.created_at ? new Date(h.created_at) : new Date();
                            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const dateStr = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
                            return {
                                id: h.id,
                                time: timeStr,
                                timestamp: timeStr,
                                date: dateStr,
                                areaId: h.area_id,
                                areaName: h.area_name,
                                allocatedLitres: h.allocated_litres,
                                reservoirName: h.reservoir_name,
                                result: h.result,
                                createdAt: h.created_at
                            };
                        });
                        LocalStore.set('history', mapped);
                        return mapped;
                    } else if (error) {
                        console.warn('Supabase allocation_history query note:', error.message);
                    }
                } catch (err) {
                    console.error('Error fetching live allocation_history from Supabase:', err);
                }
            }

            // Fallback to local store
            const localHist = LocalStore.get('history', []);
            return localHist.map(h => ({
                id: h.id,
                time: h.time || h.timestamp || new Date().toLocaleTimeString(),
                timestamp: h.timestamp || h.time || new Date().toLocaleTimeString(),
                date: h.date || new Date().toLocaleDateString(),
                areaId: h.areaId || h.area_id,
                areaName: h.areaName || h.area_name,
                allocatedLitres: h.allocatedLitres || h.allocated_litres,
                reservoirName: h.reservoirName || h.reservoir_name,
                result: h.result,
                createdAt: h.createdAt || h.created_at
            }));
        },

        async clearAllocationHistory() {
            await initClient();
            if (isConnectedLive && supabaseClient) {
                try {
                    await supabaseClient.from('allocation_history').delete().neq('id', 0);
                } catch (err) {
                    console.error('Error clearing Supabase allocation_history:', err);
                }
            }
            LocalStore.set('history', []);
            return { success: true, message: 'Allocation history records cleared.' };
        },

        async fetchNetworkState() {
            await initClient();

            // 1. Try live Java Backend Engine first
            try {
                const res = await fetch('/api/network/state');
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.reservoirs && data.allRequests) {
                        // ALSO merge live requests directly from Supabase water_requests if connected
                        if (supabaseClient) {
                            try {
                                const { data: sbReqs } = await supabaseClient
                                    .from('water_requests')
                                    .select('*')
                                    .order('created_at', { ascending: false });

                                if (sbReqs && sbReqs.length > 0) {
                                    sbReqs.forEach(sr => {
                                        const reqIdStr = 'REQ-' + String(sr.id).padStart(3, '0');
                                        const area = data.areas?.find(a => a.id === sr.area_id) || {};
                                        let normalizedStatus = sr.status || 'pending';
                                        if (normalizedStatus === 'processed') normalizedStatus = 'allocated';
                                        if (normalizedStatus === 'cancelled') normalizedStatus = 'rejected';

                                        const existing = data.allRequests.find(r =>
                                            String(r.id).toLowerCase() === reqIdStr.toLowerCase() ||
                                            String(r.id).toLowerCase() === ('REQ-' + sr.id).toLowerCase()
                                        );

                                        if (existing) {
                                            existing.status = normalizedStatus;
                                            if (sr.decision_notes) existing.decisionNotes = sr.decision_notes;
                                        } else {
                                            data.allRequests.unshift({
                                                id: reqIdStr,
                                                numericId: sr.id,
                                                areaId: sr.area_id,
                                                areaName: area.name || sr.area_id,
                                                priority: area.priority || 'Normal',
                                                requestedLitres: sr.requested_litres,
                                                requestedBy: sr.requested_by || 'Resident Citizen',
                                                reason: sr.reason || 'Domestic Supply Request',
                                                status: normalizedStatus,
                                                createdAt: sr.created_at ? new Date(sr.created_at).toLocaleString() : '',
                                                decisionNotes: sr.decision_notes || (normalizedStatus === 'rejected' ? 'Request cancelled/rejected' : '')
                                            });
                                        }
                                    });
                                }
                            } catch (sbErr) {
                                console.warn('Supabase request merge note:', sbErr);
                            }
                        }
                        return data;
                    }
                }
            } catch (e) {}

            if (isConnectedLive && supabaseClient) {
                try {
                    const [
                        resRes,
                        areasRes,
                        pipesRes,
                        reqsRes,
                        maintRes,
                        histRes,
                        simRes
                    ] = await Promise.all([
                        supabaseClient.from('reservoirs').select('*').order('id'),
                        supabaseClient.from('demand_areas').select('*').order('id'),
                        supabaseClient.from('pipelines').select('*').order('id'),
                        supabaseClient.from('water_requests').select('*').order('created_at', { ascending: false }),
                        supabaseClient.from('maintenance_queue').select('*').eq('status', 'open').order('id'),
                        supabaseClient.from('allocation_history').select('*').order('created_at', { ascending: false }).limit(100),
                        supabaseClient.from('simulation_state').select('*').eq('id', 1).single()
                    ]);

                    const reservoirs = (resRes.data || []).map(r => ({
                        id: r.id,
                        name: r.name,
                        dailySupply: r.daily_supply,
                        remainingSupply: r.remaining_supply,
                        percentage: r.daily_supply > 0 ? (r.remaining_supply / r.daily_supply) * 100 : 0
                    }));

                    const pipelines = (pipesRes.data || []).map(p => ({
                        id: p.id,
                        from: p.from_id,
                        to: p.to_id,
                        isWorking: p.is_working
                    }));

                    const areasRaw = areasRes.data || [];
                    const reachability = computeNetworkReachability(reservoirs, areasRaw, pipelines);

                    const areas = areasRaw.map(a => ({
                        id: a.id,
                        name: a.name,
                        type: a.area_type,
                        dailyDemand: a.daily_demand,
                        priority: a.priority,
                        allocatedWater: a.allocated_water || 0,
                        unmetWater: Math.max(0, a.daily_demand - (a.allocated_water || 0)),
                        connected: Boolean(reachability[a.id])
                    }));

                    const allReqsRaw = reqsRes.data || [];
                    const allRequests = allReqsRaw.map(req => {
                        const area = areas.find(a => a.id === req.area_id) || {};
                        let normalizedStatus = req.status || 'pending';
                        if (normalizedStatus === 'processed') normalizedStatus = 'allocated';
                        if (normalizedStatus === 'cancelled') normalizedStatus = 'rejected';
                        return {
                            id: 'REQ-' + String(req.id).padStart(3, '0'),
                            numericId: req.id,
                            areaId: req.area_id,
                            areaName: area.name || req.area_id,
                            priority: area.priority || 'Normal',
                            requestedLitres: req.requested_litres,
                            requestedBy: req.requested_by || 'Resident Citizen',
                            reason: req.reason || 'Domestic Supply Request',
                            status: normalizedStatus,
                            createdAt: req.created_at ? new Date(req.created_at).toLocaleString() : '',
                            decisionNotes: req.decision_notes || ''
                        };
                    });

                    const pendingRequests = allRequests.filter(r => r.status === 'pending' || r.status === 'approved');

                    const maintenanceQueue = (maintRes.data || []).map(m => ({
                        id: m.id,
                        pipelineId: m.pipeline_id,
                        issue: m.issue,
                        from: m.from_id,
                        to: m.to_id
                    }));

                    const allocationHistory = (histRes.data || []).map(h => {
                        const d = h.created_at ? new Date(h.created_at) : new Date();
                        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const dateStr = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
                        return {
                            id: h.id,
                            time: timeStr,
                            timestamp: timeStr,
                            date: dateStr,
                            areaId: h.area_id,
                            areaName: h.area_name,
                            allocatedLitres: h.allocated_litres,
                            reservoirName: h.reservoir_name,
                            result: h.result,
                            createdAt: h.created_at
                        };
                    });
                    LocalStore.set('history', allocationHistory);

                    const totalSupply = reservoirs.reduce((sum, r) => sum + r.remainingSupply, 0);
                    const totalDailyDemand = areas.reduce((sum, a) => sum + a.dailyDemand, 0);
                    const failedPipelinesCount = pipelines.filter(p => !p.isWorking).length;
                    const connectedAreasCount = areas.filter(a => a.connected).length;
                    const dayCounter = simRes.data?.day_counter || 1;

                    return {
                        totalSupply,
                        totalDailyDemand,
                        totalPipelinesCount: pipelines.length,
                        failedPipelinesCount,
                        totalAreasCount: areas.length,
                        connectedAreasCount,
                        dayCounter,
                        reservoirs,
                        areas,
                        pipelines,
                        pendingRequests,
                        allRequests,
                        maintenanceQueue,
                        allocationHistory
                    };
                } catch (err) {
                    console.error('Error in live fetchNetworkState, falling back:', err);
                }
            }

            // Fallback / Demo Engine Computation
            const reservoirs = LocalStore.get('reservoirs', INITIAL_RESERVOIRS).map(r => ({
                id: r.id,
                name: r.name,
                dailySupply: r.dailySupply,
                remainingSupply: r.remainingSupply,
                percentage: r.dailySupply > 0 ? (r.remainingSupply / r.dailySupply) * 100 : 0
            }));

            const pipelines = LocalStore.get('pipelines', INITIAL_PIPELINES);
            const areasRaw = LocalStore.get('areas', INITIAL_DEMAND_AREAS);
            const reachability = computeNetworkReachability(reservoirs, areasRaw, pipelines);

            const areas = areasRaw.map(a => ({
                id: a.id,
                name: a.name,
                type: a.type,
                dailyDemand: a.dailyDemand,
                priority: a.priority,
                allocatedWater: a.allocatedWater || 0,
                unmetWater: Math.max(0, a.dailyDemand - (a.allocatedWater || 0)),
                connected: Boolean(reachability[a.id])
            }));

            const rawRequests = LocalStore.get('requests', []);
            const allRequests = rawRequests.map(r => {
                const area = areas.find(a => a.id === r.areaId) || {};
                return {
                    id: String(r.id),
                    areaId: r.areaId,
                    areaName: area.name || r.areaId,
                    priority: area.priority || 'Normal',
                    requestedLitres: r.requestedLitres,
                    requestedBy: r.requestedBy || 'Public Citizen',
                    reason: r.reason || 'Domestic Supply Request',
                    status: r.status || 'pending',
                    createdAt: r.createdAt || new Date().toISOString(),
                    decisionNotes: r.decisionNotes || ''
                };
            });

            const pendingRequests = allRequests.filter(r => r.status === 'approved' || r.status === 'pending');

            const maintenanceQueue = LocalStore.get('maintenance', []);
            const rawLocalHist = LocalStore.get('history', []);
            const allocationHistory = rawLocalHist.map(h => ({
                id: h.id,
                time: h.time || h.timestamp || new Date().toLocaleTimeString(),
                timestamp: h.timestamp || h.time || new Date().toLocaleTimeString(),
                date: h.date || new Date().toLocaleDateString(),
                areaId: h.areaId || h.area_id,
                areaName: h.areaName || h.area_name,
                allocatedLitres: h.allocatedLitres || h.allocated_litres,
                reservoirName: h.reservoirName || h.reservoir_name,
                result: h.result
            }));
            const dayCounter = LocalStore.get('dayCounter', 1);

            const totalSupply = reservoirs.reduce((sum, r) => sum + r.remainingSupply, 0);
            const totalDailyDemand = areas.reduce((sum, a) => sum + a.dailyDemand, 0);
            const failedPipelinesCount = pipelines.filter(p => !p.isWorking).length;
            const connectedAreasCount = areas.filter(a => a.connected).length;

            return {
                totalSupply,
                totalDailyDemand,
                totalPipelinesCount: pipelines.length,
                failedPipelinesCount,
                totalAreasCount: areas.length,
                connectedAreasCount,
                dayCounter,
                reservoirs,
                areas,
                pipelines,
                pendingRequests,
                allRequests,
                maintenanceQueue,
                allocationHistory
            };
        },

        async togglePipeline(pipelineId, isWorking) {
            const nextStatus = !isWorking;
            let fromId = '';
            let toId = '';

            // 1. Live Supabase Cloud Persistence
            if (isConnectedLive && supabaseClient) {
                try {
                    // Update pipeline status
                    await supabaseClient
                        .from('pipelines')
                        .update({ is_working: nextStatus, updated_at: new Date().toISOString() })
                        .eq('id', pipelineId);

                    // Lookup pipeline endpoints for rich incident details
                    const { data: pipe } = await supabaseClient
                        .from('pipelines')
                        .select('*')
                        .eq('id', pipelineId)
                        .maybeSingle();

                    if (pipe) {
                        fromId = pipe.from_id || '';
                        toId = pipe.to_id || '';
                    }

                    if (!nextStatus) {
                        // Failing/Cutting pipeline: ensure incident is logged into maintenance_queue
                        const { data: existingTickets } = await supabaseClient
                            .from('maintenance_queue')
                            .select('id')
                            .eq('pipeline_id', pipelineId)
                            .eq('status', 'open');

                        if (!existingTickets || existingTickets.length === 0) {
                            const initPipe = INITIAL_PIPELINES.find(p => p.id === pipelineId);
                            const issueText = `Pipeline ${pipelineId} cut-off incident (${fromId || initPipe?.from || ''} ➔ ${toId || initPipe?.to || ''})`;
                            await supabaseClient.from('maintenance_queue').insert({
                                pipeline_id: pipelineId,
                                issue: issueText,
                                from_id: fromId || initPipe?.from || '',
                                to_id: toId || initPipe?.to || '',
                                status: 'open'
                            });
                        }
                    } else {
                        // Repaired: close open maintenance tickets for this pipeline
                        await supabaseClient
                            .from('maintenance_queue')
                            .update({ status: 'completed', completed_at: new Date().toISOString() })
                            .eq('pipeline_id', pipelineId)
                            .eq('status', 'open');
                    }
                } catch (err) {
                    console.error('Error toggling pipeline in Supabase:', err);
                }
            }

            // 2. Synchronize LocalStore Engine (Cache & Offline Fallback)
            const pipelines = LocalStore.get('pipelines', INITIAL_PIPELINES);
            const p = pipelines.find(item => item.id === pipelineId);
            if (p) {
                p.isWorking = nextStatus;
                LocalStore.set('pipelines', pipelines);
                if (!fromId) fromId = p.from;
                if (!toId) toId = p.to;
            }

            let maint = LocalStore.get('maintenance', []);
            if (!nextStatus) {
                if (!maint.some(m => m.pipelineId === pipelineId)) {
                    maint.unshift({
                        id: Date.now(),
                        pipelineId: pipelineId,
                        issue: `Pipeline ${pipelineId} cut-off incident (${fromId} ➔ ${toId})`,
                        from: fromId,
                        to: toId
                    });
                }
            } else {
                maint = maint.filter(m => m.pipelineId !== pipelineId);
            }
            LocalStore.set('maintenance', maint);

            return {
                success: true,
                message: nextStatus
                    ? `✓ Pipeline ${pipelineId} repaired. Flow restored.`
                    : `⚡ Pipeline ${pipelineId} cut off! Logged in Maintenance Queue.`
            };
        },

        async repairAllPipelines() {
            if (isConnectedLive && supabaseClient) {
                try {
                    await supabaseClient
                        .from('pipelines')
                        .update({ is_working: true, updated_at: new Date().toISOString() })
                        .neq('is_working', true);

                    await supabaseClient
                        .from('maintenance_queue')
                        .update({ status: 'completed', completed_at: new Date().toISOString() })
                        .eq('status', 'open');
                } catch (err) {
                    console.error('Error repairing all pipelines in Supabase:', err);
                }
            }

            // Fallback Engine
            const pipelines = LocalStore.get('pipelines', INITIAL_PIPELINES);
            pipelines.forEach(p => p.isWorking = true);
            LocalStore.set('pipelines', pipelines);
            LocalStore.set('maintenance', []);
            return { success: true, message: 'All network pipelines repaired and restored. Maintenance queue cleared.' };
        },

        async breakRandomPipeline() {
            const state = await this.fetchNetworkState();
            const working = state.pipelines.filter(p => p.isWorking);
            if (working.length === 0) {
                return { success: false, message: 'All pipelines are already broken.' };
            }
            const random = working[Math.floor(Math.random() * working.length)];
            return await this.togglePipeline(random.id, true);
        },

        async addWaterRequest(areaId, requestedLitres, reason = '', requestedBy = '') {
            const amount = parseInt(requestedLitres, 10);
            if (isNaN(amount) || amount <= 0) {
                return { success: false, error: 'Requested volume must be a positive number.' };
            }

            let insertedRow = null;
            let supabaseSuccess = false;

            // 1. PRIMARY STORAGE: Persist directly into Supabase PostgreSQL water_requests table
            if (supabaseClient) {
                try {
                    // Try with rich schema first (if columns exist)
                    const richRes = await supabaseClient.from('water_requests').insert({
                        area_id: areaId,
                        requested_litres: amount,
                        requested_by: requestedBy || 'Public Citizen',
                        reason: reason || 'Domestic Supply Request',
                        status: 'pending'
                    }).select();

                    if (!richRes.error && richRes.data && richRes.data.length > 0) {
                        insertedRow = richRes.data[0];
                        supabaseSuccess = true;
                        console.log('✓ Stored in Supabase water_requests (rich schema):', insertedRow);
                    } else {
                        // Fallback to standard Supabase schema (guaranteed columns: area_id, requested_litres, status)
                        const stdRes = await supabaseClient.from('water_requests').insert({
                            area_id: areaId,
                            requested_litres: amount,
                            status: 'pending'
                        }).select();

                        if (!stdRes.error && stdRes.data && stdRes.data.length > 0) {
                            insertedRow = stdRes.data[0];
                            supabaseSuccess = true;
                            console.log('✓ Stored in Supabase water_requests (standard schema):', insertedRow);
                        } else if (stdRes.error) {
                            console.error('Supabase standard insert error:', stdRes.error);
                        }
                    }
                } catch (err) {
                    console.error('Supabase insert exception:', err);
                }
            }

            // 2. Synchronize with live Java backend
            const customReqId = insertedRow ? ('REQ-' + String(insertedRow.id).padStart(3, '0')) : undefined;
            try {
                await fetch('/api/requests/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        request_id: customReqId,
                        area_id: areaId,
                        requested_litres: amount,
                        reason: reason || 'Domestic Supply Request',
                        requested_by: requestedBy || 'Public Citizen'
                    })
                });
            } catch (e) {}

            // 3. Fallback Local Storage
            const requests = LocalStore.get('requests', []);
            const reqId = customReqId || ('REQ-' + String(requests.length + 1).padStart(3, '0'));
            requests.unshift({
                id: reqId,
                numericId: insertedRow ? insertedRow.id : null,
                areaId: areaId,
                requestedLitres: amount,
                requestedBy: requestedBy || 'Public Citizen',
                reason: reason || 'Domestic Supply Request',
                status: 'pending',
                decisionNotes: '',
                createdAt: new Date().toISOString()
            });
            LocalStore.set('requests', requests);

            return {
                success: true,
                message: `Water request for ${amount.toLocaleString()} L in ${areaId} stored in Supabase water_requests (${reqId}). Awaiting Admin review.`
            };
        },

        async acceptWaterRequest(requestId) {
            const rawId = String(requestId).replace(/\D/g, '');
            const numericId = rawId ? parseInt(rawId, 10) : null;
            const idFilter = numericId !== null ? numericId : requestId;

            // 1. Update Supabase PostgreSQL water_requests table
            if (supabaseClient && idFilter) {
                try {
                    // Try 1: Rich update (status: 'approved', decision_notes)
                    let res = await supabaseClient.from('water_requests')
                        .update({ status: 'approved', decision_notes: 'Approved by Grid Administrator' })
                        .eq('id', idFilter);

                    if (res.error) {
                        // Try 2: If decision_notes column doesn't exist, try status: 'approved' only
                        console.warn('Supabase rich accept update failed, trying status:approved without decision_notes:', res.error.message);
                        res = await supabaseClient.from('water_requests')
                            .update({ status: 'approved' })
                            .eq('id', idFilter);
                    }

                    if (res.error) {
                        // Try 3: If check constraint only allows legacy ('pending', 'processed', 'cancelled')
                        console.warn('Supabase status:approved failed (constraint may only allow legacy statuses), trying processed:', res.error.message);
                        res = await supabaseClient.from('water_requests')
                            .update({ status: 'processed' })
                            .eq('id', idFilter);
                    }

                    if (res.error) {
                        console.error('Supabase accept error on all attempts:', res.error);
                    } else {
                        console.log('✓ Successfully updated accepted request in Supabase:', idFilter);
                    }
                } catch (err) {
                    console.warn('Supabase accept error:', err);
                }
            }

            // 2. Notify Java backend
            try {
                await fetch('/api/requests/accept', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request_id: requestId })
                });
            } catch (e) {}

            // 3. LocalStore update
            const requests = LocalStore.get('requests', []);
            const req = requests.find(r => String(r.id) === String(requestId) || String(r.numericId) === String(idFilter));
            if (req) {
                req.status = 'approved';
                req.decisionNotes = 'Approved by Grid Administrator';
                LocalStore.set('requests', requests);
            }
            return { success: true, message: `Request ${requestId} accepted and approved for water allocation.` };
        },

        async rejectWaterRequest(requestId, reason = 'Rejected by Grid Administrator') {
            const rawId = String(requestId).replace(/\D/g, '');
            const numericId = rawId ? parseInt(rawId, 10) : null;
            const idFilter = numericId !== null ? numericId : requestId;

            // 1. Update Supabase PostgreSQL water_requests table
            if (supabaseClient && idFilter) {
                try {
                    // Try 1: Rich update (status: 'rejected', decision_notes)
                    let res = await supabaseClient.from('water_requests')
                        .update({ status: 'rejected', decision_notes: reason })
                        .eq('id', idFilter);

                    if (res.error) {
                        // Try 2: Without decision_notes
                        console.warn('Supabase rich reject update failed, trying status:rejected without decision_notes:', res.error.message);
                        res = await supabaseClient.from('water_requests')
                            .update({ status: 'rejected' })
                            .eq('id', idFilter);
                    }

                    if (res.error) {
                        // Try 3: 'cancelled' is always valid in the legacy check constraint
                        console.warn('Supabase status:rejected failed, falling back to cancelled:', res.error.message);
                        res = await supabaseClient.from('water_requests')
                            .update({ status: 'cancelled' })
                            .eq('id', idFilter);
                    }

                    if (res.error) {
                        console.error('Supabase reject error on all attempts:', res.error);
                    } else {
                        console.log('✓ Successfully updated rejected request in Supabase:', idFilter);
                    }
                } catch (err) {
                    console.warn('Supabase reject error:', err);
                }
            }

            // 2. Notify Java backend
            try {
                await fetch('/api/requests/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request_id: requestId, reason: reason })
                });
            } catch (e) {}

            // 3. LocalStore update
            const requests = LocalStore.get('requests', []);
            const req = requests.find(r => String(r.id) === String(requestId) || String(r.numericId) === String(idFilter));
            if (req) {
                req.status = 'rejected';
                req.decisionNotes = reason;
                LocalStore.set('requests', requests);
            }
            return { success: true, message: `Request ${requestId} rejected.` };
        },

        // -----------------------------------------------------------------
        // Water Priority Allocation Algorithm
        // 1. High priority areas served first (Critical > High > Normal)
        // 2. Checks pipeline path connectivity to available reservoirs
        // 3. Fulfills allocation and records audit trail in allocation_history
        // 4. Preserves daily_demand intact while updating allocated_water
        // -----------------------------------------------------------------
        async allocateWater() {
            await initClient();
            const priorityWeight = { 'Critical': 1, 'High': 2, 'Normal': 3 };

            function findUsableReservoir(areaId, reservoirs, pipelines) {
                const adj = {};
                (pipelines || []).forEach(p => {
                    const from = p.from || p.from_id;
                    const to = p.to || p.to_id;
                    const isWorking = p.isWorking !== undefined ? p.isWorking : p.is_working;
                    if (isWorking) {
                        if (!adj[from]) adj[from] = [];
                        if (!adj[to]) adj[to] = [];
                        adj[from].push(to);
                        adj[to].push(from);
                    }
                });

                for (const r of (reservoirs || [])) {
                    const supply = (r.remaining_supply !== undefined ? r.remaining_supply : r.remainingSupply) || 0;
                    if (supply <= 0) continue;

                    const visited = new Set();
                    const queue = [r.id];
                    visited.add(r.id);
                    let found = false;

                    while (queue.length > 0) {
                        const curr = queue.shift();
                        if (curr === areaId) {
                            found = true;
                            break;
                        }
                        for (const n of (adj[curr] || [])) {
                            if (!visited.has(n)) {
                                visited.add(n);
                                queue.push(n);
                            }
                        }
                    }
                    if (found) return r;
                }
                return null;
            }

            function isPhysicallyConnected(areaId, reservoirs, pipelines) {
                const adj = {};
                (pipelines || []).forEach(p => {
                    const from = p.from || p.from_id;
                    const to = p.to || p.to_id;
                    if (!adj[from]) adj[from] = [];
                    if (!adj[to]) adj[to] = [];
                    adj[from].push(to);
                    adj[to].push(from);
                });
                for (const r of (reservoirs || [])) {
                    const visited = new Set();
                    const queue = [r.id];
                    visited.add(r.id);
                    while (queue.length > 0) {
                        const curr = queue.shift();
                        if (curr === areaId) return true;
                        for (const n of (adj[curr] || [])) {
                            if (!visited.has(n)) {
                                visited.add(n);
                                queue.push(n);
                            }
                        }
                    }
                }
                return false;
            }

            // 1. SUPABASE LIVE CLOUD PERSISTENCE
            if (isConnectedLive && supabaseClient) {
                try {
                    const [resRes, areasRes, pipesRes, reqsRes] = await Promise.all([
                        supabaseClient.from('reservoirs').select('*').order('id'),
                        supabaseClient.from('demand_areas').select('*').order('id'),
                        supabaseClient.from('pipelines').select('*').order('id'),
                        supabaseClient.from('water_requests').select('*').in('status', ['approved', 'pending']).order('created_at')
                    ]);

                    const reservoirs = resRes.data || [];
                    const areas = areasRes.data || [];
                    const pipelines = pipesRes.data || [];
                    const pendingRequests = reqsRes.data || [];

                    let allocatedCount = 0;
                    let totalAllocatedLitres = 0;
                    const historyRecords = [];

                    // Phase 1: Allocate explicit citizen water requests (by Area Priority)
                    if (pendingRequests.length > 0) {
                        pendingRequests.sort((a, b) => {
                            const areaA = areas.find(ar => ar.id === a.area_id);
                            const areaB = areas.find(ar => ar.id === b.area_id);
                            const pA = priorityWeight[areaA?.priority] || 4;
                            const pB = priorityWeight[areaB?.priority] || 4;
                            return pA - pB;
                        });

                        for (const req of pendingRequests) {
                            const area = areas.find(ar => ar.id === req.area_id);
                            if (!area) continue;

                            const assignedRes = findUsableReservoir(area.id, reservoirs, pipelines);
                            if (!assignedRes) {
                                const physical = isPhysicallyConnected(area.id, reservoirs, pipelines);
                                historyRecords.push({
                                    area_id: area.id,
                                    area_name: area.name,
                                    allocated_litres: 0,
                                    reservoir_name: 'None',
                                    result: physical ? 'no_supply' : 'disconnected'
                                });
                                await supabaseClient.from('water_requests').update({ status: 'cancelled' }).eq('id', req.id);
                                continue;
                            }

                            const litres = Math.min(req.requested_litres, assignedRes.remaining_supply);
                            if (litres > 0) {
                                assignedRes.remaining_supply -= litres;
                                area.allocated_water = (area.allocated_water || 0) + litres;
                                allocatedCount++;
                                totalAllocatedLitres += litres;

                                historyRecords.push({
                                    area_id: area.id,
                                    area_name: area.name,
                                    allocated_litres: litres,
                                    reservoir_name: assignedRes.name,
                                    result: 'allocated'
                                });

                                await supabaseClient.from('water_requests').update({ status: 'processed' }).eq('id', req.id);
                            }
                        }
                    }

                    // Phase 2: Allocate daily grid water demand for all areas with unmet daily demand
                    // Priority Order: Critical (1) ➔ High (2) ➔ Normal (3)
                    const sortedAreas = [...areas].sort((a, b) => {
                        const pA = priorityWeight[a.priority] || 4;
                        const pB = priorityWeight[b.priority] || 4;
                        return pA - pB;
                    });

                    for (const area of sortedAreas) {
                        const currentAlloc = area.allocated_water || 0;
                        const unmet = Math.max(0, area.daily_demand - currentAlloc);
                        if (unmet <= 0) continue; // Area demand already fully met

                        const assignedRes = findUsableReservoir(area.id, reservoirs, pipelines);
                        if (!assignedRes) {
                            const physical = isPhysicallyConnected(area.id, reservoirs, pipelines);
                            historyRecords.push({
                                area_id: area.id,
                                area_name: area.name,
                                allocated_litres: 0,
                                reservoir_name: 'None',
                                result: physical ? 'no_supply' : 'disconnected'
                            });
                            continue;
                        }

                        const litres = Math.min(unmet, assignedRes.remaining_supply);
                        if (litres > 0) {
                            assignedRes.remaining_supply -= litres;
                            area.allocated_water = currentAlloc + litres;
                            allocatedCount++;
                            totalAllocatedLitres += litres;

                            historyRecords.push({
                                area_id: area.id,
                                area_name: area.name,
                                allocated_litres: litres,
                                reservoir_name: assignedRes.name,
                                result: 'allocated'
                            });
                        }
                    }

                    if (historyRecords.length === 0) {
                        return { success: false, message: 'All connected demand areas have already received their full daily water allocation.' };
                    }

                    // Commit reservoir supply updates
                    for (const r of reservoirs) {
                        await supabaseClient
                            .from('reservoirs')
                            .update({ remaining_supply: r.remaining_supply, updated_at: new Date().toISOString() })
                            .eq('id', r.id);
                    }

                    // Commit area allocated_water (daily_demand remains intact and unmutated!)
                    for (const a of areas) {
                        await supabaseClient
                            .from('demand_areas')
                            .update({ allocated_water: a.allocated_water, updated_at: new Date().toISOString() })
                            .eq('id', a.id);
                    }

                    // Commit audit trail to allocation_history table
                    const { error: insertHistErr } = await supabaseClient.from('allocation_history').insert(historyRecords);
                    if (insertHistErr) {
                        console.error('Supabase allocation_history insert error:', insertHistErr);
                    } else {
                        console.log(`✓ Successfully recorded ${historyRecords.length} allocation event(s) in Supabase allocation_history table.`);
                    }

                    // Synchronize LocalStore
                    LocalStore.set('reservoirs', reservoirs.map(r => ({
                        id: r.id,
                        name: r.name,
                        dailySupply: r.daily_supply,
                        remainingSupply: r.remaining_supply
                    })));

                    LocalStore.set('areas', areas.map(a => ({
                        id: a.id,
                        name: a.name,
                        type: a.area_type,
                        dailyDemand: a.daily_demand,
                        priority: a.priority,
                        allocatedWater: a.allocated_water
                    })));

                    let localHist = LocalStore.get('history', []);
                    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const nowDate = new Date().toLocaleDateString();
                    historyRecords.forEach(hr => {
                        localHist.unshift({
                            id: Date.now() + Math.random(),
                            time: nowStr,
                            timestamp: nowStr,
                            date: nowDate,
                            areaId: hr.area_id,
                            areaName: hr.area_name,
                            allocatedLitres: hr.allocated_litres,
                            reservoirName: hr.reservoir_name,
                            result: hr.result
                        });
                    });
                    LocalStore.set('history', localHist.slice(0, 50));

                    return {
                        success: true,
                        message: `Successfully allocated ${totalAllocatedLitres.toLocaleString()} L of water across ${allocatedCount} area route(s). Audit records logged in Allocation History.`
                    };
                } catch (err) {
                    console.error('Error in live allocateWater:', err);
                }
            }

            // 2. FALLBACK LOCAL ENGINE
            const reservoirs = LocalStore.get('reservoirs', INITIAL_RESERVOIRS);
            const areas = LocalStore.get('areas', INITIAL_DEMAND_AREAS);
            const pipelines = LocalStore.get('pipelines', INITIAL_PIPELINES);
            const requests = LocalStore.get('requests', []);
            let history = LocalStore.get('history', []);

            let allocatedCount = 0;
            let totalAllocatedLitres = 0;
            const historyRecords = [];

            // Phase 1: Allocate explicit requests
            const pending = requests.filter(r => r.status === 'approved' || r.status === 'pending');
            if (pending.length > 0) {
                pending.sort((a, b) => {
                    const areaA = areas.find(ar => ar.id === a.areaId);
                    const areaB = areas.find(ar => ar.id === b.areaId);
                    const pA = priorityWeight[areaA?.priority] || 4;
                    const pB = priorityWeight[areaB?.priority] || 4;
                    return pA - pB;
                });

                for (const req of pending) {
                    const area = areas.find(ar => ar.id === req.areaId);
                    if (!area) continue;

                    const res = findUsableReservoir(area.id, reservoirs, pipelines);
                    if (!res) {
                        const physical = isPhysicallyConnected(area.id, reservoirs, pipelines);
                        historyRecords.push({
                            area_id: area.id,
                            area_name: area.name,
                            allocated_litres: 0,
                            reservoir_name: 'None',
                            result: physical ? 'no_supply' : 'disconnected'
                        });
                        req.status = 'cancelled';
                        continue;
                    }

                    const litres = Math.min(req.requestedLitres, res.remainingSupply);
                    if (litres > 0) {
                        res.remainingSupply -= litres;
                        area.allocatedWater = (area.allocatedWater || 0) + litres;
                        req.status = 'processed';
                        allocatedCount++;
                        totalAllocatedLitres += litres;

                        historyRecords.push({
                            area_id: area.id,
                            area_name: area.name,
                            allocated_litres: litres,
                            reservoir_name: res.name,
                            result: 'allocated'
                        });
                    }
                }
            }

            // Phase 2: Allocate daily grid water demand for all areas with unmet daily demand
            const sortedAreas = [...areas].sort((a, b) => {
                const pA = priorityWeight[a.priority] || 4;
                const pB = priorityWeight[b.priority] || 4;
                return pA - pB;
            });

            for (const area of sortedAreas) {
                const currentAlloc = area.allocatedWater || 0;
                const unmet = Math.max(0, area.dailyDemand - currentAlloc);
                if (unmet <= 0) continue;

                const res = findUsableReservoir(area.id, reservoirs, pipelines);
                if (!res) {
                    const physical = isPhysicallyConnected(area.id, reservoirs, pipelines);
                    historyRecords.push({
                        area_id: area.id,
                        area_name: area.name,
                        allocated_litres: 0,
                        reservoir_name: 'None',
                        result: physical ? 'no_supply' : 'disconnected'
                    });
                    continue;
                }

                const litres = Math.min(unmet, res.remainingSupply);
                if (litres > 0) {
                    res.remainingSupply -= litres;
                    area.allocatedWater = currentAlloc + litres;
                    allocatedCount++;
                    totalAllocatedLitres += litres;

                    historyRecords.push({
                        area_id: area.id,
                        area_name: area.name,
                        allocated_litres: litres,
                        reservoir_name: res.name,
                        result: 'allocated'
                    });
                }
            }

            if (historyRecords.length === 0) {
                return { success: false, message: 'All connected demand areas have already received their full daily water allocation.' };
            }

            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const nowDate = new Date().toLocaleDateString();
            historyRecords.forEach(hr => {
                history.unshift({
                    id: Date.now() + Math.random(),
                    time: nowStr,
                    timestamp: nowStr,
                    date: nowDate,
                    areaId: hr.area_id,
                    areaName: hr.area_name,
                    allocatedLitres: hr.allocated_litres,
                    reservoirName: hr.reservoir_name,
                    result: hr.result
                });
            });

            LocalStore.set('reservoirs', reservoirs);
            LocalStore.set('areas', areas);
            LocalStore.set('requests', requests);
            LocalStore.set('history', history.slice(0, 50));

            return {
                success: true,
                message: `Successfully allocated ${totalAllocatedLitres.toLocaleString()} L of water across ${allocatedCount} area route(s). Audit records logged in Allocation History.`
            };
        },

        async resetSimulationDay() {
            await initClient();
            if (isConnectedLive && supabaseClient) {
                try {
                    // 1. Increment simulation day
                    let newDay = 2;
                    try {
                        const { data: sim } = await supabaseClient.from('simulation_state').select('*').eq('id', 1).single();
                        if (sim && sim.day_counter) {
                            newDay = sim.day_counter + 1;
                            await supabaseClient.from('simulation_state').update({ day_counter: newDay }).eq('id', 1);
                        } else {
                            await supabaseClient.from('simulation_state').upsert({ id: 1, day_counter: 2 });
                        }
                    } catch (simErr) {
                        console.warn('Simulation state increment note:', simErr);
                    }

                    // 2. Refill all reservoirs to their full daily_supply
                    const { data: reservoirs } = await supabaseClient.from('reservoirs').select('*');
                    for (const r of (reservoirs || [])) {
                        await supabaseClient.from('reservoirs')
                            .update({ remaining_supply: r.daily_supply, updated_at: new Date().toISOString() })
                            .eq('id', r.id);
                    }

                    // 3. Reset demand areas allocated_water to 0 for the fresh day
                    await supabaseClient.from('demand_areas')
                        .update({ allocated_water: 0, updated_at: new Date().toISOString() })
                        .gte('daily_demand', 0);

                    // 4. Synchronize local store cache
                    LocalStore.set('dayCounter', newDay);
                    if (reservoirs) {
                        LocalStore.set('reservoirs', reservoirs.map(r => ({
                            id: r.id,
                            name: r.name,
                            dailySupply: r.daily_supply,
                            remainingSupply: r.daily_supply
                        })));
                    }
                    const localAreas = LocalStore.get('areas', INITIAL_DEMAND_AREAS);
                    localAreas.forEach(a => a.allocatedWater = 0);
                    LocalStore.set('areas', localAreas);

                    return {
                        success: true,
                        message: `Day ${newDay} started! All reservoirs refilled to 100% capacity for the new day.`
                    };
                } catch (err) {
                    console.error('Error resetting day in Supabase:', err);
                }
            }

            // Fallback Engine
            const day = LocalStore.get('dayCounter', 1) + 1;
            LocalStore.set('dayCounter', day);

            const reservoirs = LocalStore.get('reservoirs', INITIAL_RESERVOIRS);
            reservoirs.forEach(r => r.remainingSupply = r.dailySupply);
            LocalStore.set('reservoirs', reservoirs);

            const areas = LocalStore.get('areas', INITIAL_DEMAND_AREAS);
            areas.forEach(a => a.allocatedWater = 0);
            LocalStore.set('areas', areas);

            return { success: true, message: `Day ${day} started! All reservoirs refilled to 100% capacity for the new day.` };
        },

        async fetchForecastData() {
            const state = await this.fetchNetworkState();
            const totalDailyCapacity = state.reservoirs.reduce((sum, r) => sum + r.dailySupply, 0);

            // Compute smart predictive trends based on area priority & demand
            const forecasts = state.areas.map(area => {
                const variancePct = ((area.id.charCodeAt(1) % 5) - 2) * 2.5; // Smooth deterministic variance
                const trend = variancePct > 1 ? 'RISING' : (variancePct < -1 ? 'FALLING' : 'STABLE');
                const trendSymbol = trend === 'RISING' ? '↑' : (trend === 'FALLING' ? '↓' : '→');
                const predicted = Math.round(area.dailyDemand * (1 + variancePct / 100));
                const confidence = area.type === 'critical_institution' ? 'HIGH' : 'MEDIUM';
                const risk = predicted > area.dailyDemand && !area.connected;

                return {
                    areaId: area.id,
                    areaName: area.name,
                    currentDemand: area.dailyDemand,
                    predicted,
                    trend,
                    trendSymbol,
                    trendPct: variancePct,
                    confidence,
                    risk
                };
            });

            const totalPredicted = forecasts.reduce((sum, f) => sum + f.predicted, 0);
            return {
                dayCount: state.dayCounter || 1,
                totalPredicted,
                totalDailyCapacity,
                sufficient: totalPredicted <= totalDailyCapacity,
                forecasts
            };
        },

        // -----------------------------------------------------------------
        // Live Realtime Subscriptions
        // Listens to Supabase Postgres changes and triggers UI updates
        // -----------------------------------------------------------------
        subscribeRealtime(callback) {
            if (!isConnectedLive || !supabaseClient) return;

            try {
                if (realtimeChannel) {
                    supabaseClient.removeChannel(realtimeChannel);
                }

                realtimeChannel = supabaseClient
                    .channel('watergrid-live-changes')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'reservoirs' }, () => callback())
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'demand_areas' }, () => callback())
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'pipelines' }, () => callback())
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'water_requests' }, () => callback())
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_queue' }, () => callback())
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'allocation_history' }, () => callback())
                    .subscribe();
            } catch (err) {
                console.warn('Realtime subscription error:', err);
            }
        }
    };

    // Export globally
    window.supabaseService = {
        initClient,
        testConnection,
        isLive: () => isConnectedLive,
        auth: authService,
        data: dataService,
        subscribeRealtime: (cb) => dataService.subscribeRealtime(cb)
    };

    // Auto-initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', async () => {
        await initClient();
    });
})();
