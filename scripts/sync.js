const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DATABASES = {
  crypto:  process.env.NOTION_DB_CRYPTO  || '',
  futures: process.env.NOTION_DB_FUTURES || '',
};

// ── Query all pages with pagination
async function queryAll(dbId) {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// ── Extract property value by type
function prop(page, name) {
  const p = page.properties[name];
  if (!p) return null;
  switch (p.type) {
    case 'title':
      return p.title.map(t => t.plain_text).join('') || null;
    case 'rich_text':
      return p.rich_text.map(t => t.plain_text).join('') || null;
    case 'number':
      return p.number;
    case 'select':
      return p.select?.name || null;
    case 'multi_select':
      return p.multi_select.map(s => s.name);
    case 'date':
      return p.date?.start || null;
    case 'url':
      return p.url || null;
    case 'formula':
      if (p.formula.type === 'number')  return p.formula.number;
      if (p.formula.type === 'string')  return p.formula.string;
      if (p.formula.type === 'boolean') return p.formula.boolean;
      if (p.formula.type === 'date')    return p.formula.date?.start || null;
      return null;
    default:
      return null;
  }
}

// ── Transform page to unified trade object
function transform(page, source) {
  const isCrypto = source === 'crypto';
  return {
    id:       page.id,
    source,
    num:      prop(page, '#'),
    date:     prop(page, 'Day'),
    result:   prop(page, 'Result'),
    dayOfWeek:   prop(page, 'Day of Week'),
    asset:       prop(page, 'Asset'),
    htfBias:     prop(page, 'HTF Bias'),
    oneRPct:     prop(page, '1R (%)'),
    rr:          prop(page, 'RR'),
    maxRR:       prop(page, 'Max RR'),
    drawdown:    prop(page, 'Drawdown (DD)'),
    direction:   prop(page, 'Direction'),
    session:     prop(page, 'Session'),
    setup:       prop(page, 'Setup'),
    deliveryNarrative: prop(page, 'Delivery Narrative'),
    entryModel:  prop(page, 'Entry Model'),
    entryPDA:    prop(page, 'Entry PDA'),
    entryType:   prop(page, 'Entry Type'),
    tradeType:   prop(page, 'Trade Type'),
    emotions:    prop(page, 'Emotions'),
    entryTF:     prop(page, 'Entry TF'),
    model:       prop(page, 'Model'),
    swingType:   prop(page, 'Swing Type'),
    keyLevelTF:  prop(page, 'Key Level TF'),
    mmxmNarr:    prop(page, 'if MMXM narrative'),
    sl:  isCrypto ? prop(page, 'Ticks SL')     : prop(page, 'Pips SL'),
    tp:  isCrypto ? prop(page, 'Ticks to TP')  : prop(page, 'Pips to TP'),
    dd:  isCrypto ? prop(page, 'max Ticks DD') : prop(page, 'max Pips DD'),
    slUnit: isCrypto ? 'ticks' : 'pips',
    dailyOF:     prop(page, 'Daily OF'),
    h1OF:        prop(page, 'H1 OF'),
    dailyChart:  prop(page, 'Daily Chart'),
    hourlyChart: prop(page, 'Hourly Chart'),
    entryChart:  prop(page, 'Entry Chart'),
    notes:       prop(page, 'notes'),
  };
}

// ── Main
async function main() {
  const data = {
    lastSync: new Date().toISOString(),
    crypto:  [],
    futures: [],
  };

  for (const [source, dbId] of Object.entries(DATABASES)) {
    if (!dbId) { console.log(`Skipping ${source} (no DB ID)`); continue; }
    console.log(`Syncing ${source}...`);
    const pages = await queryAll(dbId);
    console.log(`  Found ${pages.length} trades`);
    data[source] = pages.map(p => transform(p, source));
  }

  // Sort by date ascending
  data.crypto.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  data.futures.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log(`\nDone! ${data.crypto.length} crypto + ${data.futures.length} futures trades saved to data.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
