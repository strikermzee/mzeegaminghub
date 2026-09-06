// One server, one database. Business Tycoon's `users` and `game_results` tables now live
// in the hub's SQLite file alongside everything else; this shim keeps the call sites unchanged.
module.exports = require('../../src/db');
