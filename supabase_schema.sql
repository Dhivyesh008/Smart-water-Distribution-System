-- =====================================================================
-- SMART WATER DISTRIBUTION SYSTEM - SUPABASE POSTGRESQL SCHEMA
-- Paste this script into your Supabase Dashboard: SQL Editor -> New Query -> Run
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USER PROFILES TABLE (Linked with Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RESERVOIRS (Water Sources)
CREATE TABLE IF NOT EXISTS public.reservoirs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    daily_supply INT NOT NULL,
    remaining_supply INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DEMAND AREAS (Consumer & Critical Zones)
CREATE TABLE IF NOT EXISTS public.demand_areas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    area_type TEXT NOT NULL CHECK (area_type IN ('residential', 'critical_institution')),
    daily_demand INT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('Normal', 'High', 'Critical')),
    allocated_water INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PIPELINES (Network Distribution Grid)
CREATE TABLE IF NOT EXISTS public.pipelines (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    is_working BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. WATER REQUESTS QUEUE
CREATE TABLE IF NOT EXISTS public.water_requests (
    id BIGSERIAL PRIMARY KEY,
    area_id TEXT NOT NULL REFERENCES public.demand_areas(id) ON DELETE CASCADE,
    requested_litres INT NOT NULL,
    requested_by TEXT DEFAULT 'Public Citizen',
    reason TEXT DEFAULT 'Domestic Supply Request',
    decision_notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'allocated', 'processed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema Migration helpers if water_requests already exists in your Supabase project:
ALTER TABLE public.water_requests ADD COLUMN IF NOT EXISTS requested_by TEXT DEFAULT 'Public Citizen';
ALTER TABLE public.water_requests ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'Domestic Supply Request';
ALTER TABLE public.water_requests ADD COLUMN IF NOT EXISTS decision_notes TEXT;
ALTER TABLE public.water_requests DROP CONSTRAINT IF EXISTS water_requests_status_check;
ALTER TABLE public.water_requests ADD CONSTRAINT water_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'allocated', 'processed', 'cancelled'));

-- 7. ALLOCATION HISTORY AUDIT LOG
CREATE TABLE IF NOT EXISTS public.allocation_history (
    id BIGSERIAL PRIMARY KEY,
    area_id TEXT NOT NULL,
    area_name TEXT NOT NULL,
    allocated_litres INT DEFAULT 0,
    reservoir_name TEXT,
    result TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. MAINTENANCE QUEUE
CREATE TABLE IF NOT EXISTS public.maintenance_queue (
    id BIGSERIAL PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
    issue TEXT NOT NULL,
    from_id TEXT,
    to_id TEXT,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 9. SIMULATION STATE
CREATE TABLE IF NOT EXISTS public.simulation_state (
    id INT PRIMARY KEY DEFAULT 1,
    day_counter INT DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Allows read & write access for authenticated users & anon demo access
-- =====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservoirs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Public insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update profiles" ON public.profiles FOR UPDATE USING (true);

CREATE POLICY "Allow all reservoirs" ON public.reservoirs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all demand_areas" ON public.demand_areas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all pipelines" ON public.pipelines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all water_requests" ON public.water_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all allocation_history" ON public.allocation_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all maintenance_queue" ON public.maintenance_queue FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all simulation_state" ON public.simulation_state FOR ALL USING (true) WITH CHECK (true);

-- Enable Supabase Realtime broadcasting for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservoirs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.demand_areas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipelines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.water_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_queue;

-- =====================================================================
-- SEED INITIAL DATA
-- =====================================================================

-- Reservoirs
INSERT INTO public.reservoirs (id, name, daily_supply, remaining_supply) VALUES
    ('R1', 'North Reservoir', 5000, 5000),
    ('R2', 'South Reservoir', 3000, 3000)
ON CONFLICT (id) DO NOTHING;

-- Demand Areas
INSERT INTO public.demand_areas (id, name, area_type, daily_demand, priority, allocated_water) VALUES
    ('A1', 'Greenview Homes', 'residential', 1500, 'Normal', 0),
    ('A2', 'Lakeside Villas', 'residential', 2000, 'High', 0),
    ('A3', 'City Hospital', 'critical_institution', 3000, 'Critical', 0),
    ('A4', 'Rivergate Apartments', 'residential', 1800, 'Normal', 0),
    ('A5', 'Sunrise Colony', 'residential', 1200, 'High', 0),
    ('A6', 'Central Fire Station', 'critical_institution', 1800, 'Critical', 0),
    ('A7', 'Hillview Nagar', 'residential', 1400, 'Normal', 0),
    ('A8', 'Maple Residency', 'residential', 1600, 'High', 0),
    ('A9', 'Riverside Colony', 'residential', 1300, 'Normal', 0),
    ('A10', 'Green Park', 'residential', 1700, 'High', 0)
ON CONFLICT (id) DO NOTHING;

-- Pipelines
INSERT INTO public.pipelines (id, from_id, to_id, is_working) VALUES
    ('P1', 'R1', 'A1', TRUE),
    ('P2', 'R1', 'A2', TRUE),
    ('P3', 'R1', 'A3', TRUE),
    ('P4', 'A1', 'A4', TRUE),
    ('P5', 'A2', 'A5', TRUE),
    ('P6', 'A3', 'A6', TRUE),
    ('P7', 'A4', 'A7', TRUE),
    ('P8', 'A5', 'A8', TRUE),
    ('P9', 'A6', 'A9', TRUE),
    ('P10', 'A7', 'A10', TRUE),
    ('P11', 'R2', 'A6', TRUE),
    ('P12', 'R2', 'A8', TRUE),
    ('P13', 'A7', 'A8', TRUE),
    ('P14', 'A9', 'A10', TRUE),
    ('P15', 'A3', 'A8', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Simulation State
INSERT INTO public.simulation_state (id, day_counter) VALUES
    (1, 1)
ON CONFLICT (id) DO NOTHING;
