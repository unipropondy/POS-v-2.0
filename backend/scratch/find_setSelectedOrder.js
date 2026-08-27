const fs = require('fs');
const content = fs.readFileSync('c:/Users/UNIPRO/Desktop/POS/frontend/app/sales-report.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('setSelectedOrder')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
