const sql = require('./backend/node_modules/mssql');
const dotenv = require('./backend/node_modules/dotenv');
dotenv.config({ path: './backend/.env' });

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true },
};

async function run() {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query(`
      SELECT DishId, Name, DishGroupId, IsCombo, currentcost 
      FROM DishMaster 
      WHERE Name LIKE '%Pasta%' OR Name LIKE '%Apple%'
    `);
    console.log(JSON.stringify(result.recordset, null, 2));

    const comboConfig = await pool.request().query(`
      SELECT * FROM ComboGroupMaster
    `);
    console.log("ComboGroupMaster:", JSON.stringify(comboConfig.recordset, null, 2));

    const comboItem = await pool.request().query(`
      SELECT * FROM ComboItemMaster
    `);
    console.log("ComboItemMaster:", JSON.stringify(comboItem.recordset, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
run();

