'use strict';

const path = require('path');
const express = require('express');
const { getDb } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Init DB early
getDb();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api/prep', require('./routes/prep'));
app.use('/api/event', require('./routes/event'));
app.use('/api/draw', require('./routes/draw'));
app.use('/api/export', require('./routes/export'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Disco y Destino 70\'s', port: PORT });
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/templates', express.static(path.join(__dirname, '..', 'templates')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Disco y Destino 70's → http://${HOST}:${PORT}`);
});
