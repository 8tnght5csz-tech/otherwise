module.exports = async (req, res) => {
  if (req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).send('no');
  const SITE = 'https://otherwise-weld.vercel.app';
  const post = (m, body) => fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(r => r.text());
  const user = [
    { command: 'start', description: 'Баштоо' },
    { command: 'dukon', description: 'Дүкөндү ачуу' },
    { command: 'menin', description: 'Менин буйрутмаларым' },
    { command: 'help', description: 'Жардам' }
  ];
  const admin = [
    ...user,
    { command: 'buyrutmalar', description: 'Акыркы 5 буйрутма' },
    { command: 'yangi', description: 'Төлөмү күтүлгөндөр' },
    { command: 'bugun', description: 'Бүгүнкү жыйынтык' },
    { command: 'admin', description: 'Админ панели' }
  ];
  const out = [];
  out.push(await post('setWebhook', { url: SITE + '/api/bot', secret_token: process.env.WEBHOOK_SECRET }));
  out.push(await post('setMyCommands', { commands: user }));
  out.push(await post('setMyCommands', { commands: admin, scope: { type: 'chat', chat_id: Number(process.env.ADMIN_CHAT_ID) } }));
  out.push(await post('setChatMenuButton', { menu_button: { type: 'web_app', text: '🛍 Дүкөн', web_app: { url: SITE } } }));
  res.status(200).send(out.join('\n'));
};
