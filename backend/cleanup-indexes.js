const sequelize = require('./config/database'); // Adjust path if your DB config is elsewhere

async function runCleanup() {
  try {
    console.log('🔍 Authenticating with database...');
    await sequelize.authenticate();
    console.log('✅ Connected.\n');

    // The tables known to have suffered from the accumulation bug
    const affectedTables = ['users', 'accounts', 'transactions', 'otps'];

    for (const table of affectedTables) {
      console.log(`📂 Scanning table: ${table}...`);
      
      try {
        // Fetch all raw indexes for the current table
        const [indexes] = await sequelize.query(`SHOW INDEX FROM ${table}`);
        
        // Isolate unique index names (SHOW INDEX returns a row per column in the index)
        const uniqueIndexNames = [...new Set(indexes.map(idx => idx.Key_name))];
        let droppedCount = 0;

        for (const indexName of uniqueIndexNames) {
          // Skip the primary key and any intentionally non-numbered indexes
          if (indexName === 'PRIMARY') continue;

          // Sequelize duplicates append _2, _3, etc. 
          // This regex targets any index name ending with an underscore and digits.
          const isJunkDuplicate = /_\d+$/.test(indexName);

          if (isJunkDuplicate) {
            console.log(`   🗑️ Dropping accumulated index: ${indexName}`);
            await sequelize.query(`ALTER TABLE ${table} DROP INDEX ${indexName}`);
            droppedCount++;
          }
        }

        if (droppedCount === 0) {
          console.log(`   ✨ No duplicate indexes found in ${table}.`);
        } else {
          console.log(`   ✅ Cleaned up ${droppedCount} duplicate indexes in ${table}.`);
        }

      } catch (tableErr) {
        // Catch errors for missing tables (e.g., if one hasn't been created yet)
        console.warn(`   ⚠️ Could not scan ${table}: ${tableErr.message}`);
      }
      console.log('--------------------------------------------------');
    }

    console.log('\n🎉 Cleanup complete! Your MySQL index limit is restored.');

  } catch (error) {
    console.error('\n❌ Fatal script error:', error.message);
  } finally {
    // Close the connection gracefully so the script terminates
    await sequelize.close();
    process.exit(0);
  }
}

runCleanup();