# QUEUE-OS Pixel MVP — ระบบจองคิวออนไลน์ผ่าน LINE Mini App (Pixel Art)

ระบบจองคิว/นัดหมายสำหรับร้านค้า SME (ร้านอาหาร, คลินิก ฯลฯ) ผ่าน LINE Mini App (LIFF)
สไตล์ Pixel Art โดยมี Supabase เป็น backend หลัก

Code base เริ่มต้นดัดแปลงจากคอร์ส "ระบบจองคิวออนไลน์แบบ Visual Sandbox Pixel Art
ผ่าน LINE Mini App" (LINE API Expert, iton5)

> **หมายเหตุ:** repo นี้เป็นคนละโปรเจกต์กับ **QUEUE-OS ตัวจริง** (React/Vite/TypeScript,
> Bun, ERD 12 ตาราง, อยู่ที่ `D:\AI_Project\QUEUE_OS\liff-app`) ใช้ที่นี่เป็น
> **starter/reference สำหรับทดลอง pattern LINE LIFF + Supabase + pixel art UI**
> ก่อนตัดสินใจว่าจะนำแนวคิดไหนไปรวมกับ QUEUE-OS ตัวหลักในอนาคต

## โครงสร้างโปรเจกต์

```
queue-os-mvp/
├── web/                      # Frontend 3 หน้า (host แยกจาก Supabase)
│   ├── index.html            # หน้าลูกค้า (จองคิว/ดูคิว/ยกเลิก) - ต้องใช้ USER_LIFF_ID
│   ├── admin.html            # หน้าแอดมิน (จัดการคิว/ตัวละคร/props) - ต้องใช้ ADMIN_LIFF_ID
│   ├── monitor.html          # จอแสดงผลหน้าร้าน (ไม่ต้อง LIFF)
│   ├── config.example.json   # แม่แบบ config (commit ได้)
│   └── config.json           # ค่าจริง (gitignored ห้าม commit)
├── supabase/
│   ├── sql/
│   │   └── setup.sql         # รันใน SQL Editor ตอนสร้าง project ใหม่
│   └── functions/
│       └── api/
│           └── index.ts      # Edge Function เดียว รวมทุก action (17 actions)
├── docs/                     # เอกสารเพิ่มเติม (roadmap, decisions)
├── .gitignore
└── README.md
```

## Stack

- Frontend: Static HTML + Tailwind (CDN) + LINE LIFF SDK v2 + Supabase JS client
- Backend: Supabase (Postgres + Edge Functions/Deno), polling ทุก 3-5 วิ (ไม่ใช้ Realtime)
- แจ้งเตือนลูกค้า: LINE Messaging API (Flex Message push)
- แจ้งเตือนแอดมิน: Telegram Bot API

## Setup (ตามลำดับ)

### 1. สร้าง Supabase project
1. เข้า https://supabase.com → Sign in → New Project
2. ตั้งชื่อ, password, เลือก region สิงคโปร์ → Create

### 2. รัน schema
ไปที่ SQL Editor → วางเนื้อหาจาก `supabase/sql/setup.sql` → Run
(สร้าง 5 ตาราง: `admins`, `queue_service_status`, `characters`, `queues`, `props` พร้อม RLS)

### 3. Deploy Edge Function
- สร้างฟังก์ชันชื่อ `api` → วางโค้ดจาก `supabase/functions/api/index.ts`
- ไปที่ฟังก์ชัน `api` → Details → **ปิด** "Verify JWT with legacy secret"

### 4. ตั้งค่า Secrets (Edge Functions → Secrets)
| ตัวแปร | มาจากไหน |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → Messaging API channel |
| `TELEGRAM_BOT_TOKEN` | BotFather ใน Telegram |
| `TELEGRAM_CHAT_ID` | แชท/กลุ่มที่ต้องการรับแจ้งเตือน |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ ต้องมี — index.ts ใช้ตัวนี้สร้าง admin client (Project Settings → API) ปกติ Supabase ตั้งให้อัตโนมัติ แต่เช็คให้ชัวร์หลัง deploy |

### 5. ตั้งค่า LINE Developers Console
ต้องมี **2 LIFF app แยกกัน**:
- LIFF ตัวที่ 1 → ใช้กับ `index.html` (ลูกค้า) → ได้ `USER_LIFF_ID`
- LIFF ตัวที่ 2 → ใช้กับ `admin.html` (แอดมิน) → ได้ `ADMIN_LIFF_ID`
- Messaging API channel แยกต่างหาก → เอา Channel Access Token ไปใส่ secret ข้อ 4

### 6. ตั้งค่า config.json
คัดลอก `web/config.example.json` → บันทึกเป็น `web/config.json` แล้วกรอกค่าจริง:
```json
{
    "SUPABASE_URL": "https://xxxxxx.supabase.co",
    "SUPABASE_KEY": "...",       // anon public key (Project Settings → API)
    "ADMIN_LIFF_ID": "...",
    "USER_LIFF_ID": "..."
}
```
ไฟล์นี้ถูก gitignore ไว้แล้ว — **ห้าม commit ค่าจริงขึ้น repo**

### 7. เพิ่มแอดมินคนแรก
เข้า Supabase Table Editor → ตาราง `admins` → เพิ่มแถวใหม่ ใส่ `line_user_id`
ของคนที่จะเป็นแอดมิน (หาได้จาก LINE Developers หรือ log ตอน login ครั้งแรก)

### 8. Deploy frontend
Push repo นี้ขึ้น GitHub แล้วต่อกับ Vercel/Netlify/Cloudflare Pages
(root directory ตั้งเป็น `web/`) — ได้ URL มาตั้งเป็น Endpoint URL ของ LIFF แต่ละตัว

## Roadmap โดยย่อ

- **Phase 1 (ตอนนี้)** — MVP single-tenant ร้านเดียว ใช้ stack ตามไฟล์นี้ทั้งหมด
- **Phase 2** — เพิ่ม Claude API (Haiku) เข้า Edge Function เฉพาะ query ที่ rule-based ตอบไม่ได้
- **Phase 3** — ปรับ schema เพิ่ม `tenant_id` รองรับหลายร้านใน Supabase project เดียว
- **Phase 4** — scale + vertical ใหม่ (คลินิก ฯลฯ), พิจารณาแยก instance ต่อ tenant สำหรับลูกค้าความเสี่ยงสูง

รายละเอียดเพิ่มเติมดูใน `docs/`
