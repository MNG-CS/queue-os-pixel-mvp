create table public.admins (
  id uuid not null default gen_random_uuid (),
  line_user_id text not null,
  name text null,
  constraint admins_pkey primary key (id),
  constraint admins_line_user_id_key unique (line_user_id)
) TABLESPACE pg_default;

create table public.queue_service_status (
  id integer not null default 1,
  current_serving_number integer null default 0,
  current_queue_id uuid null,
  shop_name text not null default 'NextQ Store',
  message text null,
  updated_at timestamp with time zone null default now(),
  constraint queue_service_status_pkey primary key (id),
  constraint single_row_constraint check ((id = 1))
) TABLESPACE pg_default;

INSERT INTO public.queue_service_status (id, current_serving_number, shop_name)
VALUES (1, 0, 'NextQ Store');

create table public.characters (
  id uuid not null default gen_random_uuid (),
  name text not null,
  sprite_url text not null,
  cols integer not null default 4,
  rows integer not null default 4,
  css_filter text null,
  created_at timestamp with time zone not null default now(),
  constraint characters_pkey primary key (id)
) TABLESPACE pg_default;

-- Insert default characters
INSERT INTO public.characters (name, sprite_url, cols, rows, css_filter) VALUES
('พนักงานออฟฟิศหญิง (น้ำเงิน)', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/21542/WalkingDemo-ZAK-SHEET.png', 4, 4, null),
('พนักงานออฟฟิศหญิง (ชมพู)', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/21542/WalkingDemo-KIM-SHEET.png', 4, 4, 'hue-rotate(120deg)'),
('พนักงานออฟฟิศหนุ่ม (เขียว)', 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/21542/WalkingDemo-HANK-2-SHEET.png', 4, 4, 'hue-rotate(240deg)');

create table public.queues (
  id uuid not null default gen_random_uuid (),
  queue_number serial not null,
  line_user_id text not null,
  display_name text null,
  picture_url text null,
  character_id uuid references public.characters(id) on delete set null,
  status text not null default 'WAITING'::text,
  created_at timestamp with time zone not null default now(),
  constraint queues_pkey primary key (id)
) TABLESPACE pg_default;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_service_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;

-- 1. Policies for 'admins'
-- Admins table is highly private, only service_role (Edge Functions) can read/write it.
-- No public policies needed.

-- 2. Policies for 'queue_service_status'
-- Anyone (customers, monitor, admins) can view the current serving queue number
CREATE POLICY "Allow public read access to queue_service_status"
ON public.queue_service_status FOR SELECT
TO anon, authenticated
USING (true);

-- 3. Policies for 'characters'
-- Anyone can view the list of characters to select them
CREATE POLICY "Allow public read access to characters"
ON public.characters FOR SELECT
TO anon, authenticated
USING (true);

-- 4. Policies for 'queues'
-- Anyone can view queues to see their status/position on the monitor and booking page
CREATE POLICY "Allow public read access to queues"
ON public.queues FOR SELECT
TO anon, authenticated
USING (true);

-- Customers need to be able to create a queue directly via the API or anon insert
CREATE POLICY "Allow public insert to queues"
ON public.queues FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Note: All modification operations (INSERT/UPDATE/DELETE on characters, updates on queues by admin)
-- are performed via Supabase Edge Functions using the service_role key, which bypasses RLS.

-- ==========================================
-- DATABASE FUNCTIONS & RPC PROCEDURES
-- ==========================================

-- Function to reset the queue_number sequence (used by admin-clear-all Edge Function)
CREATE OR REPLACE FUNCTION public.admin_reset_queue_sequence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset the serial queue_number sequence back to 1
  ALTER SEQUENCE public.queues_queue_number_seq RESTART WITH 1;
END;
$$;

-- ==========================================
-- UPDATE SCHEMA FOR CHARACTER SCALE & PROPS
-- ==========================================

-- 1. Add scale column to characters table
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS scale numeric NOT NULL DEFAULT 1.0;

-- 2. Create props table for decorative items
CREATE TABLE IF NOT EXISTS public.props (
  id uuid not null default gen_random_uuid (),
  name text not null,
  image_url text not null,
  x_ratio numeric not null default 0.5, -- X position ratio (0.0 to 1.0)
  y_ratio numeric not null default 0.5, -- Y position ratio (0.0 to 1.0)
  width integer not null default 40,
  height integer not null default 40,
  collision_radius numeric not null default 20,
  created_at timestamp with time zone not null default now(),
  constraint props_pkey primary key (id)
) TABLESPACE pg_default;

-- Enable RLS on props
ALTER TABLE public.props ENABLE ROW LEVEL SECURITY;

-- Policy for public read props
CREATE POLICY "Allow public read access to props"
ON public.props FOR SELECT
TO anon, authenticated
USING (true);

-- Insert default props
INSERT INTO public.props (name, image_url, x_ratio, y_ratio, width, height, collision_radius) VALUES
('กระถางต้นไม้กลม', 'https://img.icons8.com/pixel-serif/100/sprout.png', 0.2, 0.4, 40, 40, 18),
('ป้ายต้อนรับร้าน', 'https://img.icons8.com/pixel-serif/100/road-barrier.png', 0.8, 0.3, 40, 40, 16),
('เก้าอี้ม้านั่งไม้', 'https://img.icons8.com/pixel-serif/100/wooden-bench.png', 0.7, 0.7, 50, 40, 22);

-- Add shop_name column to queue_service_status if not exists
ALTER TABLE public.queue_service_status ADD COLUMN IF NOT EXISTS shop_name text NOT NULL DEFAULT 'NextQ Store';