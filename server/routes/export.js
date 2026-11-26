'use strict';

const express = require('express');
const { buildWinnersWorkbook } = require('../services/exportExcel');

const router = express.Router();

router.get('/ganadores', async (_req, res) => {
  try {
    const buf = await buildWinnersWorkbook();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ruleta-retro-ganadores.xlsx"'
    );
    res.send(buf);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

module.exports = router;
