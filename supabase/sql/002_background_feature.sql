-- ============================================================
-- FEATURE: พื้นหลังจำลองหน้าร้าน (Background Templates)
-- รันไฟล์นี้ต่อจาก setup.sql เดิมใน SQL Editor
-- ============================================================

-- 1. ตาราง template สำเร็จรูป (โหมด B / Default)
--    ข้อมูลอ้างอิง อัปเดตเฉพาะตอนเพิ่ม template ใหม่ ไม่มีใครแก้ผ่านหน้าเว็บ
CREATE TABLE IF NOT EXISTS public.background_templates (
  id uuid not null default gen_random_uuid (),
  name text not null,                          -- เช่น 'Space Clinic'
  category text not null,                       -- 'clinic' | 'restaurant' | 'salon'
  image_url text not null,
  door_x_ratio numeric not null default 0.5,    -- ตำแหน่งประตู X (0.0-1.0)
  door_y_ratio numeric not null default 0.5,    -- ตำแหน่งประตู Y (0.0-1.0)
  no_walk_zones jsonb not null default '[]',    -- [{"x1":.., "y1":.., "x2":.., "y2":..}, ...]
  created_at timestamp with time zone not null default now(),
  constraint background_templates_pkey primary key (id)
) TABLESPACE pg_default;

ALTER TABLE public.background_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to background_templates"
ON public.background_templates FOR SELECT
TO anon, authenticated
USING (true);

-- 2. ตารางตั้งค่าพื้นหลังปัจจุบันของร้าน (singleton แถวเดียว เหมือน queue_service_status)
CREATE TABLE IF NOT EXISTS public.shop_background (
  id integer not null default 1,
  mode text not null default 'template',         -- 'template' (โหมด B) | 'custom' (โหมด A/premium)
  template_id uuid null references public.background_templates(id),
  image_url text null,                            -- ค่าจริงที่ใช้แสดงผล (copy มาจาก template หรือใส่เอง)
  door_x_ratio numeric not null default 0.5,
  door_y_ratio numeric not null default 0.365,
  no_walk_zones jsonb not null default '[]',
  is_premium_unlocked boolean not null default false,  -- ปลดล็อกโหมด custom แล้วหรือยัง
  updated_at timestamp with time zone null default now(),
  constraint shop_background_pkey primary key (id),
  constraint single_row_bg_constraint check ((id = 1)),
  constraint shop_background_mode_check check (mode in ('template', 'custom'))
) TABLESPACE pg_default;

ALTER TABLE public.shop_background ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to shop_background"
ON public.shop_background FOR SELECT
TO anon, authenticated
USING (true);

-- หมายเหตุ: การเขียน/แก้ไข shop_background และ background_templates
-- ทำผ่าน Edge Function ด้วย service_role key เท่านั้น (เหมือน queue_service_status)
-- จึงไม่ต้องมี policy สำหรับ INSERT/UPDATE จาก anon

-- ============================================================
-- 3. Insert ข้อมูล 3 template ที่ออกแบบไว้แล้ว
-- ============================================================
INSERT INTO public.background_templates (name, category, image_url, door_x_ratio, door_y_ratio, no_walk_zones) VALUES
(
  'Space Clinic', 'clinic',
  'https://tbpscuqiayisgfygatqf.supabase.co/storage/v1/object/public/image/bg-clinic.png',
  0.500, 0.365,
  '[
    {"x1":0.189,"y1":0.272,"x2":0.397,"y2":0.449},
    {"x1":0.038,"y1":0.454,"x2":0.227,"y2":0.585},
    {"x1":0.530,"y1":0.262,"x2":0.662,"y2":0.403},
    {"x1":0.687,"y1":0.161,"x2":0.870,"y2":0.444}
  ]'::jsonb
),
(
  'Star Bite Restaurant', 'restaurant',
  'https://tbpscuqiayisgfygatqf.supabase.co/storage/v1/object/public/image/bg-restaurant.png',
  0.500, 0.375,
  '[
    {"x1":0.107,"y1":0.141,"x2":0.334,"y2":0.312},
    {"x1":0.177,"y1":0.287,"x2":0.296,"y2":0.413},
    {"x1":0.069,"y1":0.403,"x2":0.290,"y2":0.585},
    {"x1":0.038,"y1":0.565,"x2":0.189,"y2":0.766},
    {"x1":0.668,"y1":0.141,"x2":0.902,"y2":0.312},
    {"x1":0.703,"y1":0.287,"x2":0.823,"y2":0.413},
    {"x1":0.712,"y1":0.403,"x2":0.933,"y2":0.585},
    {"x1":0.807,"y1":0.565,"x2":0.958,"y2":0.766}
  ]'::jsonb
),
(
  'Star Stylist Salon', 'salon',
  'https://tbpscuqiayisgfygatqf.supabase.co/storage/v1/object/public/image/bg-salon.png',
  0.500, 0.405,
  '[
    {"x1":0.063,"y1":0.181,"x2":0.277,"y2":0.474},
    {"x1":0.044,"y1":0.524,"x2":0.189,"y2":0.706},
    {"x1":0.719,"y1":0.181,"x2":0.933,"y2":0.474},
    {"x1":0.813,"y1":0.524,"x2":0.958,"y2":0.706}
  ]'::jsonb
);

-- ============================================================
-- 4. ตั้งค่าเริ่มต้น: ใช้ template แรก (Space Clinic) เป็นค่า default ของร้าน
-- ============================================================
INSERT INTO public.shop_background (id, mode, template_id, image_url, door_x_ratio, door_y_ratio, no_walk_zones)
SELECT 1, 'template', id, image_url, door_x_ratio, door_y_ratio, no_walk_zones
FROM public.background_templates
WHERE category = 'clinic'
ON CONFLICT (id) DO NOTHING;
