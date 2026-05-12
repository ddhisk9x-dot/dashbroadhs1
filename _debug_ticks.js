// scratch debug script
const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) envVars[key.trim()] = rest.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');
const s = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await s.from('student_ticks').select('mhs, tick_date, completed').eq('completed', true);
  if (error) { console.error('ERROR:', error); return; }

  console.log('Total ticks in DB:', data.length);

  // Count by MHS for April 2026
  const byMhs = {};
  data.forEach(t => {
    const m = t.tick_date.slice(0, 7);
    const k = t.mhs;
    if (!byMhs[k]) byMhs[k] = {};
    if (!byMhs[k][m]) byMhs[k][m] = 0;
    byMhs[k][m]++;
  });

  const apr = Object.entries(byMhs)
    .map(([mhs, months]) => ({ mhs, apr: months['2026-04'] || 0, total: Object.values(months).reduce((a, b) => a + b, 0) }))
    .filter(x => x.apr > 0)
    .sort((a, b) => b.apr - a.apr)
    .slice(0, 15);

  console.log('\nTop 15 by ticks in Apr 2026:');
  console.table(apr);
})();
