const TG = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN;
const SB = process.env.SUPABASE_URL + '/rest/v1';
const SBH = { apikey: process.env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };
const SECRET = process.env.WEBHOOK_SECRET;
const ADMIN = String(process.env.ADMIN_CHAT_ID);
const SITE = 'https://otherwise-weld.vercel.app';
const STATUS = { p: 'Төлөм тастыкталды', s: 'Жөнөтүлдү', d: 'Жеткирилди', c: 'Жокко чыгарылды' };

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tg = (method, body) => fetch(`${TG}/${method}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const say = (chat, t, kb) => tg('sendMessage', { chat_id: chat, text: t, parse_mode: 'HTML', ...(kb ? { reply_markup: kb } : {}) });

function text(o) {
  const items = (o.items || []).map(i => `• ${esc(i.name)} (${esc(i.size)} ${esc(i.color)}) × ${i.qty}`).join('\n');
  return `🛍 <b>Буйрутма №${o.id}</b>\n👤 ${esc(o.customer_name)}\n📞 ${esc(o.phone)}\n📍 ${esc(o.address)}\n\n${items}\n\n💰 <b>${Number(o.total).toLocaleString('ru-RU')} сом</b>\n📌 Абалы: ${esc(o.status)}`;
}
const keyboard = id => ({ inline_keyboard: [
  [{ text: '✅ Төлөм тастыкталды', callback_data: `p:${id}` }, { text: '❌ Четке кагуу', callback_data: `c:${id}` }],
  [{ text: '📦 Жөнөтүлдү', callback_data: `s:${id}` }, { text: '🏁 Жеткирилди', callback_data: `d:${id}` }]
] });
const send = o => say(ADMIN, text(o), keyboard(o.id));
const shopKb = { inline_keyboard: [[{ text: '🛍 Дүкөндү ачуу', web_app: { url: SITE } }]] };
const getOrders = async q => {
  const r = await fetch(`${SB}/orders?select=*&${q}`, { headers: SBH });
  const d = await r.json();
  return Array.isArray(d) ? d : [];
};

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
      const chat = b.message.chat.id;
      const isAdmin = String(chat) === ADMIN;
      const [c0, arg] = b.message.text.trim().split(/\s+/);
      const cmd = c0.split('@')[0].toLowerCase();

      if (cmd === '/start' || cmd === '/dukon') {
        await say(chat, 'Саламатсызбы! 👋 <b>Otherwise</b> дүкөнүнө кош келиңиз.\nКийимдерди көрүү жана буйрутма берүү үчүн баскычты басыңыз.' + (isAdmin ? '\n\nАдмин буйруктары: /help' : ''), shopKb);
      } else if (cmd === '/help') {
        let t = '/start — башкы бет\n/dukon — дүкөндү ачуу\n/help — жардам';
        if (isAdmin) t += '\n\n<b>Админ:</b>\n/buyrutmalar — акыркы 5 буйрутма\n/yangi — төлөмү күтүлгөндөр\n/bugun — бүгүнкү жыйынтык\n/buyrutma 5 — №5 буйрутма\n/admin — админ панели';
        await say(chat, t);
      } else if (isAdmin && cmd === '/buyrutmalar') {
        const rows = await getOrders('order=created_at.desc&limit=5');
        if (!rows.length) await say(chat, 'Буйрутма азырынча жок.');
        else for (const o of rows.reverse()) await send(o);
      } else if (isAdmin && cmd === '/yangi') {
        const rows = (await getOrders('order=created_at.desc&limit=30')).filter(o => o.status === 'Жаңы' || o.status === 'Төлөм текшерилүүдө').slice(0, 10);
        if (!rows.length) await say(chat, 'Күтүп турган буйрутма жок ✅');
        else for (const o of rows.reverse()) await send(o);
      } else if (isAdmin && cmd === '/bugun') {
        const off = 6 * 3600e3; // Бишкек UTC+6
        const l = new Date(Date.now() + off);
        const start = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - off).toISOString();
        const rows = (await getOrders('created_at=gte.' + encodeURIComponent(start))).filter(o => o.status !== 'Жокко чыгарылды');
        const sum = rows.reduce((s, o) => s + Number(o.total), 0);
        await say(chat, `📊 <b>Бүгүн</b>\nБуйрутма: ${rows.length}\nСумма: <b>${sum.toLocaleString('ru-RU')} сом</b>\n(жокко чыгарылгандар кирген жок)`);
      } else if (isAdmin && cmd === '/buyrutma') {
        if (!/^\d+$/.test(arg || '')) await say(chat, 'Мисалы: /buyrutma 5');
        else {
          const rows = await getOrders('id=eq.' + arg);
          if (rows[0]) await send(rows[0]); else await say(chat, 'Андай буйрутма жок.');
        }
      } else if (isAdmin && cmd === '/admin') {
        await say(chat, 'Админ панели:', { inline_keyboard: [[{ text: '⚙️ Ачуу', url: SITE + '/admin.html' }]] });
      } else {
        await say(chat, 'Дүкөндү ачуу үчүн баскычты басыңыз 👇', shopKb);
      }
    }
    return res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    return res.status(200).send('err');
  }
};
