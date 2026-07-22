async function simulateNetworkRequest(table) {
  // Simulate 50ms latency
  return new Promise(resolve => setTimeout(resolve, 50));
}

const tablesToClean = [
    'avaliacoes', 'comissoes', 'appointments',
    'support_tickets', 'notifications', 'alerts',
    'activity_log', 'auditoria_logs', 'superadmin_logs',
    'cupons', 'termos_aceite', 'feature_flags',
    'tenant_domains', 'metas_desempenho', 'marketplace',
    'clientes', 'services', 'profissionais', 'branches'
];

async function runSequential() {
  const start = performance.now();
  for (const table of tablesToClean) {
    await simulateNetworkRequest(table);
  }
  const end = performance.now();
  return end - start;
}

async function runConcurrent() {
  const start = performance.now();
  await Promise.all(
    tablesToClean.map(async (table) => {
      await simulateNetworkRequest(table);
    })
  );
  const end = performance.now();
  return end - start;
}

async function main() {
  console.log("Measuring sequential...");
  const seqTime = await runSequential();
  console.log(`Sequential time: ${seqTime.toFixed(2)} ms`);

  console.log("Measuring concurrent...");
  const conTime = await runConcurrent();
  console.log(`Concurrent time: ${conTime.toFixed(2)} ms`);

  const improvement = ((seqTime - conTime) / seqTime * 100).toFixed(2);
  console.log(`Improvement: ${improvement}% faster!`);
}

main();
