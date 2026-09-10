-- ==========================================================================
-- KisanSetu — Complete Supabase PostgreSQL Database Schema & Auth Triggers
-- ==========================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked with Supabase Auth users)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    user_code TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('farmer', 'procurement_centre', 'central_government')),
    centre_name TEXT,
    designation TEXT,
    location TEXT,
    village TEXT,
    district TEXT,
    state_name TEXT DEFAULT 'Haryana',
    phone TEXT,
    bank_name TEXT,
    bank_account_masked TEXT,
    ifsc_code TEXT,
    land_record_id TEXT,
    avatar_initials TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upgrade existing profiles table if needed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS centre_name TEXT;

-- --------------------------------------------------------------------------
-- 2. CROPS TABLE (MSP rates & crop metadata)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_en TEXT UNIQUE NOT NULL,
    name_hi TEXT NOT NULL,
    msp_rate_per_quintal NUMERIC NOT NULL,
    unit TEXT DEFAULT 'quintal',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- 3. PROCUREMENT CENTRES TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centre_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    state_name TEXT NOT NULL DEFAULT 'Haryana',
    address TEXT,
    capacity_quintals_per_day NUMERIC DEFAULT 2500,
    active_counters INTEGER DEFAULT 3,
    avg_processing_time_min NUMERIC DEFAULT 4.8,
    queue_status TEXT DEFAULT 'Low' CHECK (queue_status IN ('Low', 'Moderate', 'High')),
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- 4. BOOKINGS TABLE (Farmer Slot Booking Tokens)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    centre_id UUID REFERENCES public.procurement_centres(id) ON DELETE CASCADE,
    centre_name TEXT,
    crop_name TEXT NOT NULL,
    crop_hindi TEXT,
    raw_quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL DEFAULT 'quintal',
    quantity_quintals NUMERIC NOT NULL,
    booking_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    arrival_time TEXT,
    token_code TEXT NOT NULL,
    token_seq INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Booked' CHECK (status IN ('Booked', 'CheckedIn', 'Verified', 'Weighed', 'QualityApproved', 'Completed', 'Cancelled')),
    qr_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS centre_name TEXT;

-- --------------------------------------------------------------------------
-- 5. LIVE QUEUE TABLE (Realtime Mandi Token Sequence Tracking)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centre_code TEXT UNIQUE DEFAULT 'PC-XYZ-01',
    centre_name TEXT DEFAULT 'XYZ Procurement Centre',
    serving_token_num INTEGER NOT NULL DEFAULT 102,
    serving_token_code TEXT NOT NULL DEFAULT 'A102',
    avg_processing_min NUMERIC DEFAULT 4.8,
    active_counters INTEGER DEFAULT 3,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Upgrade existing live_queue table if needed
ALTER TABLE public.live_queue ADD COLUMN IF NOT EXISTS centre_code TEXT;
ALTER TABLE public.live_queue ADD COLUMN IF NOT EXISTS centre_name TEXT;

-- Ensure UNIQUE index exists on centre_code for ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS live_queue_centre_code_idx ON public.live_queue (centre_code);

-- --------------------------------------------------------------------------
-- 6. PROCUREMENTS TABLE (Produce Weighing & Quality Verification Records)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_code TEXT UNIQUE NOT NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    farmer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    centre_name TEXT,
    crop_name TEXT NOT NULL,
    actual_weight_quintals NUMERIC NOT NULL,
    quality_grade TEXT DEFAULT 'Grade A (Premium)',
    moisture_pct NUMERIC DEFAULT 13.5,
    msp_rate NUMERIC NOT NULL,
    total_amount NUMERIC NOT NULL,
    stage_index INTEGER DEFAULT 4,
    status TEXT NOT NULL DEFAULT 'Processing' CHECK (status IN ('Verified', 'Weighed', 'QualityApproved', 'Processing', 'Completed', 'Paid')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.procurements ADD COLUMN IF NOT EXISTS centre_name TEXT;

-- --------------------------------------------------------------------------
-- 7. PAYMENTS TABLE (Direct Benefit Transfer Payout Records)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    procurement_id UUID REFERENCES public.procurements(id) ON DELETE CASCADE,
    farmer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_id TEXT UNIQUE NOT NULL,
    amount NUMERIC NOT NULL,
    payment_mode TEXT DEFAULT 'Direct Benefit Transfer (PFMS)',
    bank_account_masked TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Processing' CHECK (status IN ('Pending', 'Processing', 'Paid', 'Failed')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- 8. NOTIFICATIONS TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Queue' CHECK (category IN ('Queue', 'Procurement', 'Payment', 'System')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- AUTH USER TRIGGER (Creates profile automatically upon Sign Up)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, centre_name, user_code, designation, location, avatar_initials
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'role', 'farmer'),
    new.raw_user_meta_data->>'centre_name',
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'procurement_centre' THEN 'PC-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 6))
      WHEN (new.raw_user_meta_data->>'role') = 'central_government' THEN 'GOV-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 6))
      ELSE 'KS-F' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 5))
    END,
    CASE 
      WHEN (new.raw_user_meta_data->>'role') = 'procurement_centre' THEN 'Mandi Manager (' || COALESCE(new.raw_user_meta_data->>'centre_name', 'Procurement Centre') || ')'
      WHEN (new.raw_user_meta_data->>'role') = 'central_government' THEN 'Joint Secretary (MSP Ops)'
      ELSE 'Registered Farmer'
    END,
    COALESCE(new.raw_user_meta_data->>'location', 'Haryana, India'),
    UPPER(SUBSTRING(COALESCE(new.raw_user_meta_data->>'full_name', new.email) FROM 1 FOR 2))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    centre_name = EXCLUDED.centre_name;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — Read/Write Access Configuration
-- ==========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Idempotent Policy Definitions
DROP POLICY IF EXISTS "Allow public all access to profiles" ON public.profiles;
CREATE POLICY "Allow public all access to profiles" ON public.profiles FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public read access to crops" ON public.crops;
CREATE POLICY "Allow public read access to crops" ON public.crops FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read access to procurement centres" ON public.procurement_centres;
CREATE POLICY "Allow public read access to procurement centres" ON public.procurement_centres FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public all access to bookings" ON public.bookings;
CREATE POLICY "Allow public all access to bookings" ON public.bookings FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all access to live_queue" ON public.live_queue;
CREATE POLICY "Allow public all access to live_queue" ON public.live_queue FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all access to procurements" ON public.procurements;
CREATE POLICY "Allow public all access to procurements" ON public.procurements FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all access to payments" ON public.payments;
CREATE POLICY "Allow public all access to payments" ON public.payments FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow public all access to notifications" ON public.notifications;
CREATE POLICY "Allow public all access to notifications" ON public.notifications FOR ALL USING (true);

-- ==========================================================================
-- SEED INITIAL MOCK DATA
-- ==========================================================================
INSERT INTO public.crops (name_en, name_hi, msp_rate_per_quintal) VALUES
('Paddy', 'धान', 2300),
('Wheat', 'गेहूँ', 2275),
('Maize', 'मक्का', 2090),
('Other', 'अन्य', 2000)
ON CONFLICT (name_en) DO UPDATE SET msp_rate_per_quintal = EXCLUDED.msp_rate_per_quintal;

INSERT INTO public.procurement_centres (centre_code, name, district, address, capacity_quintals_per_day, active_counters, avg_processing_time_min, queue_status, latitude, longitude) VALUES
('PC-XYZ-01', 'XYZ Procurement Centre', 'Karnal', 'Sector 4, Main Mandi Yard, Karnal', 2500, 3, 4.8, 'Low', 29.6857, 76.9905),
('PC-ABC-02', 'ABC Procurement Centre', 'Karnal', 'GT Road, Near Grain Market, Gharaunda', 1800, 2, 8.5, 'High', 29.5410, 76.9730),
('PC-KRN-03', 'Karnal Yard #3', 'Karnal', 'Subzi Mandi Complex, Karnal City', 3200, 4, 3.5, 'Moderate', 29.6920, 76.9820),
('PC-GHR-04', 'Gharaunda Procurement Yard', 'Karnal', 'Gharaunda Bypass, Karnal', 2100, 2, 5.2, 'Low', 29.5380, 76.9650)
ON CONFLICT (centre_code) DO NOTHING;

-- Seed Live Queue safely
INSERT INTO public.live_queue (centre_code, centre_name, serving_token_num, serving_token_code, avg_processing_min, active_counters)
VALUES ('PC-XYZ-01', 'XYZ Procurement Centre', 102, 'A102', 4.8, 3)
ON CONFLICT (centre_code) DO NOTHING;

-- Enable Realtime for Live Queue and Bookings (Safe Execution)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_queue;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
