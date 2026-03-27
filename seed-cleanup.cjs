#!/usr/bin/env node
'use strict';

/**
 * LoanBeacons — Demo Scenario Cleanup
 * -------------------------------------
 * Deletes all Firestore scenario documents where  demo === true
 *
 * Usage:
 *   node seed-cleanup.cjs
 */

const admin = require('firebase-admin');
const path  = require('path');

let sa;
try {
  sa = require(path.join(__dirname, 'serviceAccountKey.json'));
} catch {
  console.error('\n❌  serviceAccountKey.json not found.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function cleanup() {
  console.log('\n🧹  LoanBeacons — Demo Scenario Cleanup');
  console.log('─'.repeat(50));

  const snap = await db.collection('scenarios').where('demo', '==', true).get();
  if (snap.empty) { console.log('   Nothing to delete — no demo records found.\n'); process.exit(0); }

  console.log(`   Found ${snap.size} demo scenarios. Deleting...\n`);

  const batch = db.batch();
  snap.docs.forEach(doc => {
    console.log(`  🗑️   ${doc.data().scenarioName || doc.id}`);
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`\n  ✅  ${snap.size} demo scenarios deleted.\n`);
  process.exit(0);
}

cleanup().catch(e => { console.error('\n❌  Fatal:', e.message); process.exit(1); });
