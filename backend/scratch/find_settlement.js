const fs = require('fs');
const content = fs.readFileSync('c:/Users/UNIPRO/Desktop/POS/backend/routes/creditCustomers.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('processSplitPayments')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
