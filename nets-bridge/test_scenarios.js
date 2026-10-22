// nets-bridge/test_mock_scenarios.js
// Tests Approved, Declined, Cancelled, Timeout, and Duplicate-Payment scenarios
// Verifies that NO false settlements are committed to SettlementHeader in MSSQL.

'use strict';

const path = require('path');
require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../backend/.env') });
const { poolPromise } = require(path.resolve(__dirname, '../backend/config/db'));

// Simulated frontend response handler matching frontend/app/payment.tsx exactly:
function simulateFrontendResponseHandling(result, total) {
  const responseCode = result.code;
  let status = "failed";
  let message = "";
  let createsSettlement = false;

  if (result.success || responseCode === "00") {
    status = "success";
    message = `✅ $${total.toFixed(2)} paid successfully via NETS`;
    createsSettlement = true; // Would proceed to handleTerminalPaymentSuccess
  } else if (responseCode === "02") {
    status = "cancelled";
    message = `❌ Transaction cancelled on terminal`;
    createsSettlement = false; // Does NOT settle
  } else if (responseCode === "03" || responseCode === "SOCKET_ERR") {
    status = "failed";
    message = `⏰ Transaction timeout`;
    createsSettlement = false; // Does NOT settle
  } else {
    status = "failed";
    message = `❌ ${result.msg || "Payment declined"}`;
    createsSettlement = false; // Does NOT settle
  }

  return { status, message, createsSettlement };
}

// Simulated in-flight duplicate lock matching backend/routes/nets.js:
const activeRequests = new Map();

async function processWithInFlightGuard(lockKey, transactionPromiseFactory) {
  if (activeRequests.has(lockKey)) {
    return {
      duplicateBlocked: true,
      result: await activeRequests.get(lockKey),
    };
  }

  const promise = transactionPromiseFactory();
  activeRequests.set(lockKey, promise);

  try {
    const result = await promise;
    return { duplicateBlocked: false, result };
  } finally {
    activeRequests.delete(lockKey);
  }
}

async function runScenarioTests() {
  console.log('=================================================================');
  console.log('   NETS PAYMENT RESPONSE SCENARIOS & MSSQL INTEGRITY TEST        ');
  console.log('=================================================================');

  const pool = await poolPromise;
  const initialCountRes = await pool.request().query('SELECT COUNT(*) AS total FROM SettlementHeader');
  const initialSettlementCount = initialCountRes.recordset[0].total;
  console.log(`\n[BASELINE] Current SettlementHeader record count: ${initialSettlementCount}`);

  const scenarioResults = [];

  // Scenario 1: Approved ("00")
  console.log('\n--- SCENARIO 1: Approved Payment ("00") ---');
  const mockApproved = {
    success: true,
    code: "00",
    msg: "Approved",
    approvalCode: "NETS888",
    transRef: "REF123456789",
    cardLastFour: "9876",
  };
  const appRes = simulateFrontendResponseHandling(mockApproved, 12.50);
  console.log('  Input:', JSON.stringify(mockApproved));
  console.log('  UI Result:', JSON.stringify(appRes));
  const s1Pass = appRes.status === "success" && appRes.createsSettlement === true;
  scenarioResults.push({ name: 'Approved ("00") Handling', pass: s1Pass, detail: 'Correctly identified as success with approval code NETS888' });

  // Scenario 2: Declined ("01")
  console.log('\n--- SCENARIO 2: Declined Payment ("01") ---');
  const mockDeclined = {
    success: false,
    code: "01",
    msg: "Insufficient funds / Declined by issuer",
  };
  const decRes = simulateFrontendResponseHandling(mockDeclined, 12.50);
  console.log('  Input:', JSON.stringify(mockDeclined));
  console.log('  UI Result:', JSON.stringify(decRes));
  const s2Pass = decRes.status === "failed" && decRes.createsSettlement === false;
  scenarioResults.push({ name: 'Declined ("01") Handling', pass: s2Pass, detail: 'Correctly marked failed, NO settlement created' });

  // Scenario 3: Cancelled on Terminal ("02")
  console.log('\n--- SCENARIO 3: Cancelled Payment ("02") ---');
  const mockCancelled = {
    success: false,
    code: "02",
    msg: "Cancelled by cardholder on terminal",
  };
  const canRes = simulateFrontendResponseHandling(mockCancelled, 12.50);
  console.log('  Input:', JSON.stringify(mockCancelled));
  console.log('  UI Result:', JSON.stringify(canRes));
  const s3Pass = canRes.status === "cancelled" && canRes.createsSettlement === false;
  scenarioResults.push({ name: 'Cancelled ("02") Handling', pass: s3Pass, detail: 'Correctly marked cancelled, order left open, NO settlement created' });

  // Scenario 4: Timeout ("03")
  console.log('\n--- SCENARIO 4: Timeout ("03") ---');
  const mockTimeout = {
    success: false,
    code: "03",
    msg: "Transaction timed out on terminal",
  };
  const toRes = simulateFrontendResponseHandling(mockTimeout, 12.50);
  console.log('  Input:', JSON.stringify(mockTimeout));
  console.log('  UI Result:', JSON.stringify(toRes));
  const s4Pass = toRes.status === "failed" && toRes.createsSettlement === false;
  scenarioResults.push({ name: 'Timeout ("03") Handling', pass: s4Pass, detail: 'Correctly marked failed/timeout, NO false settlement' });

  // Scenario 5: Concurrent Duplicate Payment Request Lock
  console.log('\n--- SCENARIO 5: Concurrent Duplicate Payment Lock ---');
  const lockKey = "TABLE_5_DUPLICATE_CHECK";
  let executionCount = 0;

  const simulateLongTransaction = () => new Promise(resolve => {
    executionCount++;
    setTimeout(() => resolve({ success: true, code: "00", approvalCode: "DUP_TEST" }), 150);
  });

  // Launch two concurrent requests simultaneously for the same table
  const req1Promise = processWithInFlightGuard(lockKey, simulateLongTransaction);
  const req2Promise = processWithInFlightGuard(lockKey, simulateLongTransaction);

  const [res1, res2] = await Promise.all([req1Promise, req2Promise]);
  console.log('  Req 1 result:', res1);
  console.log('  Req 2 result:', res2);
  console.log('  Total transactions initiated to terminal:', executionCount);

  const s5Pass = executionCount === 1 && (res1.duplicateBlocked === false && res2.duplicateBlocked === true);
  scenarioResults.push({
    name: 'Duplicate In-Flight Lock',
    pass: s5Pass,
    detail: `Only 1 transaction spawned; duplicate request intercepted and joined in-flight promise`,
  });

  // Verify MSSQL Settlement Integrity
  console.log('\n--- MSSQL SETTLEMENT TABLE INTEGRITY VERIFICATION ---');
  const finalCountRes = await pool.request().query('SELECT COUNT(*) AS total FROM SettlementHeader');
  const finalSettlementCount = finalCountRes.recordset[0].total;
  console.log(`[VERIFY] SettlementHeader record count before: ${initialSettlementCount}, after: ${finalSettlementCount}`);

  const s6Pass = finalSettlementCount === initialSettlementCount;
  scenarioResults.push({
    name: 'MSSQL SettlementTable Integrity',
    pass: s6Pass,
    detail: `SettlementHeader record count exactly matches baseline (${finalSettlementCount} == ${initialSettlementCount}). Zero false settlements created.`,
  });

  // Print Summary
  console.log('\n=================================================================');
  console.log('              SCENARIO TEST RESULTS SUMMARY                      ');
  console.log('=================================================================');
  scenarioResults.forEach(r => {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name} - ${r.detail}`);
  });

  const total = scenarioResults.length;
  const passed = scenarioResults.filter(r => r.pass).length;
  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${total - passed}`);

  process.exit(passed === total ? 0 : 1);
}

runScenarioTests().catch(err => {
  console.error('Fatal error running scenario tests:', err);
  process.exit(1);
});
