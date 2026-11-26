# Disco y Destino 70's

App web local de sorteos (identidad **Disco nocturno**). Sin cuentas, solo localhost, offline.

## Requisitos

- Node.js **≥ 22** (usa `node:sqlite`)

## Arranque

```bash
cd ruleta-retro
npm install
npm start
```

Abre **http://127.0.0.1:3000** (solo localhost).

Puerto configurable:

```bash
PORT=3000 npm start
```

## Plantillas Excel

En `templates/`:

- `participantes.xlsx` — columnas: **ID · Nombre · Área**
- `premios.xlsx` — columnas: **ID · Artículo · Cantidad**

También servidas en `/templates/...` con la app en marcha.

## Scripts útiles

| Comando | Qué hace |
|---------|----------|
| `npm start` | Servidor Express |
| `npm run seed-templates` | Regenera Excel de muestra |
| `npm run test:engine` | Pruebas del motor (crypto, cuota, replay) |
| `npm run test:e2e` | Flujo HTTP completo import→sorteos→export |

## Flujo

1. Portada → carga Excel (o resumen si ya hay datos)
2. Viabilidad + ¡COMENZAR!
3. Escenario → Iniciar sorteo (resultado persistido **antes** de animar)
4. Ruleta premios → Esfera área → Máquina colaborador → Celebración
5. Al agotar premios → Gran final + export Excel
