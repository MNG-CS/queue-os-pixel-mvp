import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function createAdminClient() {
    return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}

async function sendTelegramNotification(message: string) {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set. Skipping Telegram notification.');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            console.error('Failed to send Telegram message:', errText);
        } else {
            console.log('Successfully sent Telegram notification');
        }
    } catch (e: any) {
        console.error('Error sending Telegram notification:', e.message);
    }
}
async function verifyAdmin(lineUserId, supabase) {
    if (!lineUserId) return false;
    const { data, error } = await supabase.from('admins').select('id').eq('line_user_id', lineUserId).limit(1).maybeSingle();
    return data !== null && !error;
}
async function sendLinePushMessage(lineUserId, queueNumber) {
    const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
        console.warn('LINE_CHANNEL_ACCESS_TOKEN is not set. Skipping push message.');
        return;
    }
    const body = JSON.stringify({
        to: lineUserId,
        messages: [
            {
                "type": "flex",
                "altText": `🔔 ถึงคิวของคุณแล้ว!
หมายเลข ${queueNumber}
กรุณาติดต่อที่เคาน์เตอร์ครับ`,
                "contents": {
                    "type": "bubble",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "backgroundColor": "#3f334d",
                        "paddingAll": "20px",
                        "contents": [
                            {
                                "type": "text",
                                "text": "🔔 ถึงคิวของคุณแล้ว!",
                                "color": "#FFFFFF",
                                "size": "lg",
                                "weight": "bold"
                            }
                        ]
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "paddingAll": "20px",
                        "spacing": "md",
                        "contents": [
                            {
                                "type": "text",
                                "text": "หมายเลขคิวของคุณคือ",
                                "color": "#c0c5c1",
                                "size": "md",
                                "align": "center"
                            },
                            {
                                "type": "text",
                                "text": `${queueNumber}`,
                                "size": "5xl",
                                "weight": "bold",
                                "align": "center",
                                "margin": "md"
                            },
                            {
                                "type": "text",
                                "text": "กรุณาติดต่อที่เคาน์เตอร์",
                                "color": "#c0c5c1",
                                "size": "md",
                                "align": "center",
                                "wrap": true,
                                "margin": "md"
                            }
                        ]
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "paddingAll": "20px",
                        "backgroundColor": "#3f334d",
                        "contents": [
                            {
                                "type": "button",
                                "action": {
                                    "type": "uri",
                                    "label": "ดูเมนู/โปรโมชั่น",
                                    "uri": "https://i.pinimg.com/736x/7e/e7/99/7ee79984f367cffca752f1853ef80709.jpg"
                                },
                                "style": "secondary",
                                "color": "#eaf0ce",
                                "height": "sm"
                            }
                        ]
                    }
                }
            }
        ]
    });
    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            },
            body: body
        });
        if (!response.ok) {
            const errorBody = await response.json();
            console.error(`Failed to send LINE push message. Status: ${response.status}`, JSON.stringify(errorBody, null, 2));
        } else {
            console.log(`Successfully sent Flex message to ${lineUserId}`);
        }
    } catch (e) {
        console.error("Network error trying to send LINE push message:", e.message);
    }
}
function getTodayUTCRange() {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = (today.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = today.getUTCDate().toString().padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    return {
        start: `${dateString}T00:00:00.000Z`,
        end: `${dateString}T23:59:59.999Z`
    };
}
async function handleGetMyQueue(payload) {
    const { lineUserId } = payload;
    if (!lineUserId) throw new Error('Missing lineUserId');
    const supabase = createAdminClient();
    const { start, end } = getTodayUTCRange();
    const { data: queue, error: queueError } = await supabase.from('queues').select('*').eq('line_user_id', lineUserId).in('status', [
        'WAITING',
        'CALLED'
    ]).gte('created_at', start).lte('created_at', end).order('created_at', {
        ascending: false
    }).limit(1).maybeSingle();
    if (queueError) throw queueError;
    const { data: currentServing, error: servingError } = await supabase.from('queue_service_status').select('current_serving_number, shop_name').eq('id', 1).single();
    if (servingError) throw servingError;
    return new Response(JSON.stringify({
        queue: queue,
        currentServing: currentServing
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleRequestQueue(payload) {
    const { lineUserId, displayName, pictureUrl, customName, characterId } = payload;
    if (!lineUserId) throw new Error('Missing lineUserId');
    const supabase = createAdminClient();
    const { start, end } = getTodayUTCRange();
    const { data: existingQueue, error: checkError } = await supabase.from('queues').select('id').eq('line_user_id', lineUserId).in('status', [
        'WAITING',
        'CALLED'
    ]).gte('created_at', start).lte('created_at', end).limit(1).maybeSingle();
    if (checkError) throw checkError;
    if (existingQueue) {
        return new Response(JSON.stringify({
            error: 'คุณมีคิวที่ยังใช้งานอยู่แล้ว'
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 409
        });
    }
    const { data: newQueue, error: insertError } = await supabase.from('queues').insert({
        line_user_id: lineUserId,
        display_name: customName || displayName,
        picture_url: pictureUrl,
        character_id: characterId,
        status: 'WAITING'
    }).select().single();
    if (insertError) throw insertError;

    // Send Telegram Notification
    try {
        const { data: charData } = await supabase.from('characters').select('name').eq('id', characterId).maybeSingle();
        const charName = charData?.name || 'ไม่ได้เลือก';
        const tgMessage = `🆕 <b>มีคิวใหม่ลงทะเบียน!</b>\n\n` +
                          `• หมายเลขคิว: <b>Q.${newQueue.queue_number}</b>\n` +
                          `• ชื่อลูกค้า: <b>${newQueue.display_name}</b>\n` +
                          `• ตัวละคร: <b>${charName}</b>\n` +
                          `• เวลาจอง: ${new Date(newQueue.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;
        await sendTelegramNotification(tgMessage);
    } catch (e: any) {
        console.error('Telegram request notify error:', e.message);
    }

    return new Response(JSON.stringify({
        newQueue: newQueue
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleCancelMyQueue(payload) {
    const { lineUserId } = payload;
    if (!lineUserId) throw new Error('Missing lineUserId');
    const supabase = createAdminClient();
    const { start, end } = getTodayUTCRange();
    const { data, error } = await supabase.from('queues').update({
        status: 'CANCELLED'
    }).eq('line_user_id', lineUserId).eq('status', 'WAITING').gte('created_at', start).lte('created_at', end).select().single();
    if (error) throw new Error('Could not find queue to cancel or db error');
    if (!data) throw new Error('No active queue found to cancel');

    // Send Telegram Notification for User Cancellation
    try {
        const tgMessage = `❌ <b>ลูกค้ากดยกเลิกคิวด้วยตนเอง!</b>\n\n` +
                          `• หมายเลขคิว: <b>Q.${data.queue_number}</b>\n` +
                          `• ชื่อลูกค้า: <b>${data.display_name}</b>`;
        await sendTelegramNotification(tgMessage);
    } catch (e: any) {
        console.error('Telegram cancel error:', e.message);
    }

    return new Response(JSON.stringify({
        success: true,
        cancelledQueue: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleCheckAdminAuth(payload) {
    const { lineUserId } = payload;
    if (!lineUserId) throw new Error('Missing lineUserId');
    const supabase = createAdminClient();
    const isAdmin = await verifyAdmin(lineUserId, supabase);
    return new Response(JSON.stringify({
        isAdmin: isAdmin
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleGetAllQueuesToday(payload) {
    const supabase = createAdminClient();
    const { start, end } = getTodayUTCRange();
    const { data: queues, error } = await supabase.from('queues').select('*').gte('created_at', start).lte('created_at', end).order('queue_number', {
        ascending: true
    });
    if (error) throw error;
    return new Response(JSON.stringify({
        queues: queues
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleAdminCallNext(payload) {
    const { lineUserId, skipPush } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    const { start, end } = getTodayUTCRange();
    const { data: nextQueue, error: findError } = await supabase.from('queues').select('*').eq('status', 'WAITING').gte('created_at', start).lte('created_at', end).order('queue_number', {
        ascending: true
    }).limit(1).maybeSingle();
    if (findError) throw findError;
    if (!nextQueue) {
        return new Response(JSON.stringify({
            error: 'ไม่มีคิวรอแล้ว'
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 404
        });
    }
    await supabase.from('queues').update({
        status: 'CALLED'
    }).eq('id', nextQueue.id);
    await supabase.from('queue_service_status').update({
        current_serving_number: nextQueue.queue_number,
        current_queue_id: nextQueue.id,
        updated_at: new Date().toISOString()
    }).eq('id', 1);
    
    if (!skipPush) {
        await sendLinePushMessage(nextQueue.line_user_id, nextQueue.queue_number.toString());
    }

    // Send Telegram Notification for Call Next
    try {
        const tgMessage = `📢 <b>เรียกคิวถัดไป!</b>\n\n` +
                          `• หมายเลขคิว: <b>Q.${nextQueue.queue_number}</b>\n` +
                          `• ชื่อลูกค้า: <b>${nextQueue.display_name}</b>\n` +
                          `• LINE Push: <b>${skipPush ? '❌ ไม่ส่ง' : '✅ ส่งแจ้งเตือน'}</b>\n` +
                          `• สถานะ: <b>กำลังให้บริการ</b>`;
        await sendTelegramNotification(tgMessage);
    } catch (e: any) {
        console.error('Telegram call error:', e.message);
    }

    return new Response(JSON.stringify({
        message: `เรียกคิว ${nextQueue.queue_number} สำเร็จ`,
        calledQueue: nextQueue
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleAdminCallSpecific(payload) {
    const { lineUserId, queueId, skipPush } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    const { data: queueToCall, error: findError } = await supabase.from('queues').select('*').eq('id', queueId).limit(1).single();
    if (findError || !queueToCall) throw new Error('Queue not found');
    await supabase.from('queues').update({
        status: 'CALLED'
    }).eq('id', queueToCall.id);
    await supabase.from('queue_service_status').update({
        current_serving_number: queueToCall.queue_number,
        current_queue_id: queueToCall.id,
        updated_at: new Date().toISOString()
    }).eq('id', 1);
    
    if (!skipPush) {
        await sendLinePushMessage(queueToCall.line_user_id, queueToCall.queue_number.toString());
    }

    // Send Telegram Notification for Specific Call
    try {
        const tgMessage = `📢 <b>เรียกคิวเฉพาะเจาะจง!</b>\n\n` +
                          `• หมายเลขคิว: <b>Q.${queueToCall.queue_number}</b>\n` +
                          `• ชื่อลูกค้า: <b>${queueToCall.display_name}</b>\n` +
                          `• LINE Push: <b>${skipPush ? '❌ ไม่ส่ง' : '✅ ส่งแจ้งเตือน'}</b>\n` +
                          `• สถานะ: <b>กำลังให้บริการ</b>`;
        await sendTelegramNotification(tgMessage);
    } catch (e: any) {
        console.error('Telegram specific call error:', e.message);
    }

    return new Response(JSON.stringify({
        message: `เรียกคิว ${queueToCall.queue_number} สำเร็จ`,
        calledQueue: queueToCall
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleAdminSkipQueue(payload) {
    const { lineUserId, queueId } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    const { data, error } = await supabase.from('queues').update({
        status: 'SKIPPED'
    }).eq('id', queueId).select().single();
    if (error) throw error;
    return new Response(JSON.stringify({
        message: `ข้ามคิว ${data.queue_number} แล้ว`,
        queue: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleAdminCancelQueue(payload) {
    const { lineUserId, queueId } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    const { data, error } = await supabase.from('queues').update({
        status: 'CANCELLED'
    }).eq('id', queueId).select().single();
    if (error) throw error;

    // Send Telegram Notification for Admin Cancellation
    try {
        const tgMessage = `🚫 <b>คิวถูกยกเลิกโดยแอดมิน!</b>\n\n` +
                          `• หมายเลขคิว: <b>Q.${data.queue_number}</b>\n` +
                          `• ชื่อลูกค้า: <b>${data.display_name}</b>`;
        await sendTelegramNotification(tgMessage);
    } catch (e: any) {
        console.error('Telegram admin cancel error:', e.message);
    }

    return new Response(JSON.stringify({
        message: `ยกเลิกคิว ${data.queue_number} แล้ว`,
        queue: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}
async function handleAdminClearAll(payload) {
    const { lineUserId } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    const { start, end } = getTodayUTCRange();
    await supabase.from('queues').delete().gte('created_at', start).lte('created_at', end);
    await supabase.from('queue_service_status').update({
        current_serving_number: 0,
        current_queue_id: null
    }).eq('id', 1);
    const { error: rpcError } = await supabase.rpc('admin_reset_queue_sequence');
    if (rpcError) {
        console.error('Error resetting queue sequence:', rpcError.message);
        return new Response(JSON.stringify({
            message: `ล้างคิวสำเร็จ แต่รีเซ็ตเลขคิวไม่สำเร็จ: ${rpcError.message}`
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
    return new Response(JSON.stringify({
        message: `ล้างคิวของวันนี้ทั้งหมดสำเร็จ และรีเซ็ตเลขคิวแล้ว`
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminAddCharacter(payload: any) {
    const { lineUserId, name, sprite_url, cols, rows, css_filter, scale } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    
    const { data, error } = await supabase.from('characters').insert({
        name, sprite_url, cols, rows, css_filter, scale: scale ? parseFloat(scale) : 1.0
    }).select().single();
    if (error) throw error;
    
    return new Response(JSON.stringify({
        message: 'เพิ่มตัวละครใหม่แล้ว',
        character: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminUpdateCharacter(payload: any) {
    const { lineUserId, id, name, sprite_url, cols, rows, css_filter, scale } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    
    const { data, error } = await supabase.from('characters').update({
        name, sprite_url, cols, rows, css_filter, scale: scale ? parseFloat(scale) : 1.0
    }).eq('id', id).select().single();
    if (error) throw error;
    
    return new Response(JSON.stringify({
        message: 'แก้ไขข้อมูลตัวละครแล้ว',
        character: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminDeleteCharacter(payload: any) {
    const { lineUserId, id } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');
    
    const { data, error } = await supabase.from('characters').delete().eq('id', id).select().single();
    if (error) throw error;
    
    return new Response(JSON.stringify({
        message: 'ลบตัวละครเรียบร้อยแล้ว',
        character: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminAddProp(payload: any) {
    const { lineUserId, name, image_url, x_ratio, y_ratio, width, height, collision_radius } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');

    const { data, error } = await supabase.from('props').insert({
        name, image_url,
        x_ratio: parseFloat(x_ratio),
        y_ratio: parseFloat(y_ratio),
        width: parseInt(width) || 40,
        height: parseInt(height) || 40,
        collision_radius: parseFloat(collision_radius) || 20
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
        message: 'เพิ่มวัตถุตกแต่งใหม่สำเร็จ',
        prop: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminUpdateProp(payload: any) {
    const { lineUserId, id, name, image_url, x_ratio, y_ratio, width, height, collision_radius } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');

    const { data, error } = await supabase.from('props').update({
        name, image_url,
        x_ratio: parseFloat(x_ratio),
        y_ratio: parseFloat(y_ratio),
        width: parseInt(width) || 40,
        height: parseInt(height) || 40,
        collision_radius: parseFloat(collision_radius) || 20
    }).eq('id', id).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
        message: 'แก้ไขวัตถุตกแต่งสำเร็จ',
        prop: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminDeleteProp(payload: any) {
    const { lineUserId, id } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');

    const { data, error } = await supabase.from('props').delete().eq('id', id).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
        message: 'ลบวัตถุตกแต่งเรียบร้อยแล้ว',
        prop: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

async function handleAdminUpdateShopName(payload: any) {
    const { lineUserId, shopName } = payload;
    const supabase = createAdminClient();
    if (!await verifyAdmin(lineUserId, supabase)) throw new Error('Unauthorized');

    const { data, error } = await supabase.from('queue_service_status').update({
        shop_name: shopName,
        updated_at: new Date().toISOString()
    }).eq('id', 1).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({
        message: 'แก้ไขชื่อร้านค้าสำเร็จ',
        status: data
    }), {
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
        }
    });
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }
    try {
        const { action, payload } = await req.json();
        if (!action) throw new Error('No action provided');
        switch (action) {
            case 'get-my-queue':
                return await handleGetMyQueue(payload);
            case 'request-queue':
                return await handleRequestQueue(payload);
            case 'cancel-my-queue':
                return await handleCancelMyQueue(payload);
            case 'check-admin-auth':
                return await handleCheckAdminAuth(payload);
            case 'get-all-queues-today':
                return await handleGetAllQueuesToday(payload);
            case 'admin-call-next':
                return await handleAdminCallNext(payload);
            case 'admin-call-specific':
                return await handleAdminCallSpecific(payload);
            case 'admin-skip-queue':
                return await handleAdminSkipQueue(payload);
            case 'admin-cancel-queue':
                return await handleAdminCancelQueue(payload);
            case 'admin-clear-all':
                return await handleAdminClearAll(payload);
            case 'admin-add-character':
                return await handleAdminAddCharacter(payload);
            case 'admin-update-character':
                return await handleAdminUpdateCharacter(payload);
            case 'admin-delete-character':
                return await handleAdminDeleteCharacter(payload);
            case 'admin-add-prop':
                return await handleAdminAddProp(payload);
            case 'admin-update-prop':
                return await handleAdminUpdateProp(payload);
            case 'admin-delete-prop':
                return await handleAdminDeleteProp(payload);
            case 'admin-update-shop-name':
                return await handleAdminUpdateShopName(payload);
            default:
                throw new Error(`Invalid action: ${action}`);
        }
    } catch (error) {
        console.error('Main Handler Error:', error.message);
        return new Response(JSON.stringify({
            error: error.message
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 400
        });
    }
});