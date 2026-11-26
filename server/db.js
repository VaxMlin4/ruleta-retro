'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.RULETA_DB
  ? path.resolve(process.env.RULETA_DB)
  : path.join(DATA_DIR, 'ruleta.sqlite');

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db);
    ensureDefaultEvent(db);
  }
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS eventos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'borrador',
      reglas_json TEXT,
      sistemas_cuota_objetivo INTEGER,
      sistemas_ganadores INTEGER NOT NULL DEFAULT 0,
      sorteo_en_curso INTEGER NOT NULL DEFAULT 0,
      animacion_en_curso INTEGER NOT NULL DEFAULT 0,
      sorteo_actual_id TEXT,
      creado_en TEXT NOT NULL,
      iniciado_en TEXT,
      finalizado_en TEXT
    );

    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      es_sistemas INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS empleados (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      area_id TEXT NOT NULL,
      elegible INTEGER NOT NULL DEFAULT 1,
      atenuado INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (area_id) REFERENCES areas(id)
    );

    CREATE TABLE IF NOT EXISTS premios (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      cantidad_inicial INTEGER NOT NULL,
      cantidad_disponible INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sorteos (
      id TEXT PRIMARY KEY,
      evento_id TEXT NOT NULL,
      secuencia INTEGER NOT NULL,
      premio_id TEXT NOT NULL,
      area_id TEXT NOT NULL,
      empleado_id TEXT NOT NULL,
      creado_en TEXT NOT NULL,
      FOREIGN KEY (evento_id) REFERENCES eventos(id),
      FOREIGN KEY (premio_id) REFERENCES premios(id),
      FOREIGN KEY (area_id) REFERENCES areas(id),
      FOREIGN KEY (empleado_id) REFERENCES empleados(id),
      UNIQUE (evento_id, secuencia),
      UNIQUE (evento_id, empleado_id)
    );

    CREATE TABLE IF NOT EXISTS meta (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

function ensureDefaultEvent(database) {
  const row = database.prepare('SELECT id FROM eventos LIMIT 1').get();
  if (!row) {
    const id = uuidv4();
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO eventos (id, nombre, estado, reglas_json, sistemas_ganadores, sorteo_en_curso, animacion_en_curso, creado_en)
         VALUES (?, ?, 'borrador', '{}', 0, 0, 0, ?)`
      )
      .run(id, 'Disco y Destino 70\'s', now);
    database.prepare('INSERT INTO meta (clave, valor) VALUES (?, ?)').run('evento_activo', id);
  }
}

function getActiveEventId() {
  const database = getDb();
  const meta = database.prepare("SELECT valor FROM meta WHERE clave = 'evento_activo'").get();
  if (meta?.valor) return meta.valor;
  const ev = database.prepare('SELECT id FROM eventos ORDER BY creado_en DESC LIMIT 1').get();
  return ev?.id;
}

function getEvent(eventId = getActiveEventId()) {
  return getDb().prepare('SELECT * FROM eventos WHERE id = ?').get(eventId);
}

/** Transacción síncrona (node:sqlite no expone .transaction). */
function runTransaction(fn) {
  const database = getDb();
  database.exec('BEGIN');
  try {
    const result = fn(database);
    database.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      database.exec('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  }
}

module.exports = {
  getDb,
  getActiveEventId,
  getEvent,
  runTransaction,
  DB_PATH,
  DATA_DIR,
};
