const TG = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN;
const SB = process.env.SUPABASE_URL + '/rest/v1';
const SBH = { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };
const SECRET = process.env.WEBHOOK_SECRET;
const ADMIN = String(process.env.ADMIN_CHAT_ID);
const STATUS = { p: 'Төлөм тастыкталды', s: 'Жөнөтүлдү', d: 'Жеткирилди', c: 'Жокко чыгарылды' };

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tg = (method, body) => fetch(`${TG}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

function text(o) {
  const items = (o.items || []).map(i => `• ${esc(i.name)} (${esc(i.size)} ${esc(i.color)}) × ${i.qty}`).join('\n');
  return `🛍 <b>Буйрутма №${o.id}</b>\n👤 ${esc(o.customer_name)}\n📞 ${esc(o.phone)}\n📍 ${esc(o.address)}\n\n${items}\n\n💰 <b>${Number(o.total).toLocaleString('ru-RU')} сом</b>\n📌 Абалы: ${esc(o.status)}`;
}
const keyboard = id => ({ inline_keyboard: [
  [{ text: '✅ Төлөм тастыкталды', callback_data: `p:${id}` }, { text: '❌ Четке кагуу', callback_data: `c:${id}` }],
  [{ text: '📦 Жөнөтүлдү', callback_data: `s:${id}` }, { text: '🏁 Жеткирилди', callback_data: `d:${id}` }]
] });
const send = o => tg('sendMessage', { chat_id: ADMIN, text: text(o), parse_mode: 'HTML', reply_markup: keyboard(o.id) });

module.exports = async (req, res) => {
  try {
    if (!SECRET) return res.status(500).send('no secret');
    if (req.method !== 'POST') return res.status(200).send('ok');
    const b = req.body || {};

    if (req.headers['x-webhook-secret'] === SECRET) {
      if (b.type === 'INSERT' && b.record) await send(b.record);
      return res.status(200).send('ok');
    }

    if (req.headers['x-telegram-bot-api-secret-token'] !== SECRET) return res.status(401).send('no');

    if (b.callback_query) {
      const q = b.callback_query;
      if (String(q.from.id) !== ADMIN) {
        await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Уруксат жок' });
        return res.status(200).send('ok');
      }
      const [k, id] = String(q.data).split(':');
      const st = STATUS[k];
      if (!st || !/^\d+$/.test(id)) return res.status(200).send('ok');
      const r = await fetch(`${SB}/orders?id=eq.${id}`, {
        method: 'PATCH', headers: { ...SBH, Prefer: 'return=representation' }, body: JSON.stringify({ status: st })
      });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows[0]) {
        await tg('answerCallbackQuery', { callback_query_id: q.id, text: 'Ката чыкты' });
        return res.status(200).send('ok');
      }
      await tg('answerCallbackQuery', { callback_query_id: q.id, text: '✅ ' + st });
      await tg('editMessageText', {
        chat_id: q.message.chat.id, message_id: q.message.message_id,
        text: text(rows[0]), parse_mode: 'HTML', reply_markup: keyboard(id)
      });
      return res.status(200).send('ok');
    }

    if (b.message && b.message.text) {
      const m = b.message;
      if (String(m.chat.id) !== ADMIN) return res.status(200).send('ok');
      if (m.text.startsWith('/buyrutmalar')) {
        const r = await fetch(`${SB}/orders?select=*&order=created_at.desc&limit=5`, { headers: SBH });
        const rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) await tg('sendMessage', { chat_id: ADMIN, text: 'Буйрутма азырынча жок.' });
        else for (const o of rows.reverse()) await send(o);
      } else {
        await tg('sendMessage', { chat_id: ADMIN, text: 'Буйрутмаларды көрүү: /buyrutmalar' });
      }
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    return res.status(200).send('err');
  }
};
