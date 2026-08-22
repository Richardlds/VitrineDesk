import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczOTI4NDcwNSwiZXhwIjoyMDU0ODQ0NzA1fQ.tAOMT_N4_oQh1n13w8571Xm06eN2L2Y238k1Z5fO93o'
);

async function run() {
  console.log('Verificando client_subscriptions...');
  const { data, error } = await supabase
    .from('client_subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) console.error(error);
  console.log(data);
}

run();
