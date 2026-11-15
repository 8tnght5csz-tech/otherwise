module.exports = async (req, res) => {
  if (req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).send('no');
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://otherwise-weld.vercel.app/api/bot', secret_token: process.env.WEBHOOK_SECRET })
  });
  res.status(200).send(await r.text());
};
