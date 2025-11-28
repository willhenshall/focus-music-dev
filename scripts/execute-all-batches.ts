import { readFileSync } from 'fs';

async function executeAllBatches() {
  console.log('🎵 Executing all 23 metadata backfill batches...\n');

  const totalBatches = 23;
  const results: { batch: number; success: boolean; message: string }[] = [];

  for (let i = 1; i <= totalBatches; i++) {
    const batchNum = i.toString().padStart(2, '0');
    const filename = `/tmp/backfill_batch_${batchNum}.sql`;

    console.log(`\n📦 Batch ${i}/${totalBatches}:`);
    console.log(`   Reading ${filename}...`);

    try {
      const sql = readFileSync(filename, 'utf-8');
      console.log(`   SQL size: ${(sql.length / 1024).toFixed(2)} KB`);
      console.log(`   Ready to execute via MCP tool`);
      console.log(`   SQL preview: ${sql.substring(0, 200)}...`);

      // Output the SQL for MCP execution
      console.log(`\n   ===== BATCH ${i} SQL CONTENT =====`);
      console.log(sql);
      console.log(`   ===== END BATCH ${i} =====\n`);

      results.push({ batch: i, success: true, message: 'SQL ready for execution' });
    } catch (err: any) {
      console.error(`   ❌ Error reading batch ${i}:`, err.message);
      results.push({ batch: i, success: false, message: err.message });
    }

    // Brief pause between batches
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n\n📊 Summary:');
  console.log(`   Total batches: ${totalBatches}`);
  console.log(`   Ready for execution: ${results.filter(r => r.success).length}`);
  console.log(`   Failed to read: ${results.filter(r => !r.success).length}`);

  if (results.some(r => !r.success)) {
    console.log('\n❌ Failed batches:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - Batch ${r.batch}: ${r.message}`);
    });
  }
}

executeAllBatches().catch(console.error);
