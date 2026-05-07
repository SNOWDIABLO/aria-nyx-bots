require('dotenv').config();

function check(name) {
  const v = process.env[name] || '';
  console.log(`${name}: ${v.length > 0 ? `OK (${v.length} chars)` : '❌ VIDE'}`);
}

check('BOT1_TOKEN');
check('BOT2_TOKEN');
check('OPENROUTER_API_KEY');
check('OPENAI_API_KEY');
check('CHAT_CHANNEL_ID');
check('GUILD_ID');
check('AI_MODEL');
console.log('\nValeur de AI_MODEL:', JSON.stringify(process.env.AI_MODEL));
