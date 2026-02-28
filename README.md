# PostgreSQL Cluster Overview (Zabbix 7)

Custom dashboard widget for Zabbix 7.x focused on PostgreSQL monitoring.

Current module version: `1.1`

![Widget preview](pgsql-widget.png)

## What the widget includes

- PostgreSQL cluster visual with database selector.
- Replication diagram (primary/standby) with animated line.
- Health score (`0-100`) with weighted categories.
- Host metrics panel (CPU and memory).
- Cluster metrics (WAL, active connections, cache/replication/XID depending on available items).
- Per-database metric cards.
- Optional sparklines on cards.
- Optional click-through to Zabbix history graph links.
- Trigger-based alert coloring/badges (configurable minimum severity).

## Data sources

Designed for hosts linked to the official template:
- `PostgreSQL by Zabbix agent 2`

Main item groups used by default:
- Per-DB: `pgsql.db.*`, `pgsql.dbstat.*`, `pgsql.locks.*`, `pgsql.queries.*`
- Cluster: `pgsql.connections.sum.*`, `pgsql.wal.*`, `pgsql.cache.hit`, `pgsql.replication.*`, `pgsql.oldest.xid`
- Host: `system.cpu.load[...]`, `vm.memory.size[...]`

If `Database discovery item ID` is left empty, the widget auto-detects discovery via `pgsql.db.discovery` for the selected host.

## Health score

Weighted categories (editable in widget settings):
- Connectivity
- Integrity
- Stability
- Efficiency
- Replication
- Bloat

Weights are normalized automatically, so custom totals still work.

## Widget settings (edit form)

### Core
- `Host`
- `Database discovery item ID (optional)`
- `Default database`

### Links and UI behavior
- `Zabbix base URL`
- `Graph period`
- `Alert badge severity`

### CPU thresholds
- `CPU warn threshold`
- `CPU high threshold`

### Health score weights
- `Health weight: Connectivity (%)`
- `Health weight: Integrity (%)`
- `Health weight: Stability (%)`
- `Health weight: Efficiency (%)`
- `Health weight: Replication (%)`
- `Health weight: Bloat (%)`

### Metric configuration
For most host/cluster/DB metrics you can configure:
- `Show ...` (`Yes`/`No`)
- `Item key` (or key prefix)

This allows adapting the widget to non-default item keys.

## Installation

Copy this module folder to your Zabbix frontend modules directory, for example:
- `/usr/share/zabbix/modules/`
- or `/usr/share/zabbix/ui/modules/`

Then in Zabbix UI:
1. `Administration -> General -> Modules`
2. `Scan directory`
3. Enable `PostgreSQL Cluster Overview`
4. Add the widget to a dashboard

## Update

After replacing/updating files:
1. Disable/Enable the module
2. Hard refresh browser cache (`Ctrl/Cmd+Shift+R`)

## Icon behavior

Icon loading order:
1. `assets/img/postgres-icon-24.png` (preferred)
2. `assets/img/postgres-icon-24.svg` (fallback)

Custom icon replacement:
- Replace `assets/img/postgres-icon-24.png` with your own transparent PNG.

## Repository structure

```text
zabbix-widget-pgsql/
├── manifest.json
├── Widget.php
├── actions/
│   └── WidgetView.php
├── includes/
│   └── WidgetForm.php
├── views/
│   ├── widget.view.php
│   └── widget.edit.php
├── assets/
│   ├── js/
│   │   └── class.widget.js
│   ├── css/
│   │   └── widget.css
│   └── img/
│       ├── postgres-icon-24.png
│       ├── postgres-icon-24.svg
│       └── database.png
└── README.md
```
---

Parts of this software were generated using Codex. We do not guarantee the total accuracy, security, or stability of the generated code.

