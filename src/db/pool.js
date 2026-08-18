const { Pool } = require('pg');
const config = require('../config/env');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(1);
});

module.exports = pool;
