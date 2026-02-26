# PostgreSQL Cluster Overview — Zabbix 7 Widget

A custom Zabbix dashboard widget that displays a selectable PostgreSQL cluster
database overview with real-time metrics, sparklines, and an at-a-glance health
score — based on the official **PostgreSQL by Zabbix agent 2** template.

![PGSQL Widget](pgsql-widget.png)

---

## What this widget does

### Health Score
A weighted health score (0–100%) is displayed prominently in the header, calculated
from six categories:

| Category | Weight | What it measures |
|---|---|---|
| Connectivity | 25% | Active connections as % of `max_connections` |
| Integriteit | 20% | Rollback ratio vs. commits |
| Stabiliteit | 20% | Idle-in-transaction sessions + XID age |
| Efficiency | 20% | Cache hit ratio + slow queries |
| Replication | 10% | Replication lag + WAL segment count |
| Bloat | 5% | Number of bloating tables |

Color coding: **green** (≥ 90% — Excellent), **orange** (≥ 70% — Let op), **red** (< 70% — Kritiek).  
The score updates automatically when switching between databases. Hover over the score block to see per-category details.

---

### Database selector
- Reads the database list from `pgsql.db.discovery[...]`
- Clickable buttons to switch between discovered databases
- A default database can be configured in the widget settings

---

### Per-database metrics
Each metric card is clickable and opens the full Zabbix history graph in a new tab.

| Metric | Item key prefix |
|---|---|
| Database size | `pgsql.db.size[` |
| Active backends | `pgsql.dbstat.numbackends[` |
| Commits/s | `pgsql.dbstat.xact_commit.rate[` |
| Rollbacks/s | `pgsql.dbstat.xact_rollback.rate[` |
| Locks total | `pgsql.locks.total[` |
| Deadlocks/s | `pgsql.dbstat.deadlocks.rate[` |
| Temp bytes/s | `pgsql.dbstat.temp_bytes.rate[` |
| Slow queries | `pgsql.queries.query.slow_count[` |
| Bloating tables | `pgsql.db.bloating_tables[` |

---

### Cluster-wide metrics

| Metric | Item key |
|---|---|
| Active connections % | `pgsql.connections.sum.total_pct` |
| WAL write/s | `pgsql.wal.write` |
| WAL receive/s | `pgsql.wal.receive` |
| WAL segment count | `pgsql.wal.count` |
| Cache hit ratio | `pgsql.cache.hit` |
| Replication lag (s) | `pgsql.replication.lag.sec[` *(prefix)* |
| Oldest XID Age | `pgsql.oldest.xid[` *(prefix)* |
| Idle in transaction | `pgsql.connections.sum.idle_in_transaction` |
| Checkpoint write time | `pgsql.bgwriter.checkpoint_write_time.rate` |
| Checkpoint Req/s | `pgsql.bgwriter.checkpoint_req` *(if available)* |
| Checkpoint Sch/s | `pgsql.bgwriter.checkpoint_scheduled` *(if available)* |

The **Oldest XID Age** card includes a progress bar that turns orange above 100 million
and red above 150 million, warning before the ~2 billion wraparound limit.

---

### Host system metrics
Displayed in the top-right section with sparklines and threshold-based color indicators:

- Host CPU load (avg1 / avg5 / avg15) — configurable warn/critical thresholds
- Host memory total
- Host memory available

CPU avg1 turns **orange** when above the warn threshold and **red** above the critical threshold.

---

### Sparklines
Every metric card and host metric shows a sparkline of the last 20 data points fetched
from Zabbix history. All sparklines are clickable (if a Zabbix base URL is configured)
and open the full history graph for that item.

---

### Tooltips
Hover over any metric card to see a contextual explanation of what the metric means,
what values to watch for, and what action to take.

---

### pgtune shortcut
A subtle link to [pgtune.leopard.in.ua](https://pgtune.leopard.in.ua/) is shown below
the database icon as a quick reference for PostgreSQL configuration tuning.

---

## Requirements

- Zabbix 7.0 (likely compatible with 7.x)
- Host monitored with the **PostgreSQL by Zabbix agent 2** template

---

## Installation

Clone the repository directly into the Zabbix modules directory:
```bash
cd /usr/share/zabbix/modules   # or /usr/share/zabbix/ui/modules
git clone https://github.com/your-org/your-repo.git zabbix-widget-pgsql
```

Then activate the module in Zabbix:

1. Go to **Administration → General → Modules**
2. Click **Scan directory**
3. Enable **PostgreSQL Cluster Overview**
4. Add the widget to any dashboard and configure it

---

## Updating
```bash
cd /usr/share/zabbix/modules/zabbix-widget-pgsql
git pull
```

Reload your browser after updating to clear any cached JavaScript.

---

## Widget configuration

All settings are available in the widget edit form:

| Setting | Description |
|---|---|
| **Host** | The Zabbix host running the PostgreSQL agent 2 template |
| **Database discovery item ID** | Optional — auto-detected from `pgsql.db.discovery` if left empty |
| **Default database** | The database selected by default on load |
| **Zabbix base URL** | e.g. `https://zabbix.example.com` — enables clickable graph links on all cards |
| **Graph period** | Time range for graph links: 1h / 6h / 24h / 7d |
| **CPU warn / high threshold** | Thresholds for CPU load color indicators |
| **Show / Item key** | Per-metric toggles and item key overrides for non-standard templates |

Every metric has both a **Show** toggle (Yes/No) and a configurable **item key**,
allowing the widget to work with customized or non-standard PostgreSQL templates.

---

## File structure
```
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
└── assets/
    ├── js/
    │   └── class.widget.js
    ├── css/
    │   └── widget.css
    └── img/
        └── postgres-icon-24.svg
```

---

## Notes

- If the discovery rule has not yet collected data, the widget falls back to metric keys already present on the host.
- Asset paths are derived dynamically from the module folder name, so renaming the clone directory does not require any code changes.
- To use a custom icon, place `postgres-icon-24.png` in `assets/img/`. The widget will prefer the `.png` and fall back to the `.svg` automatically.
- The health score only includes categories for which data is available. Categories with no matching items are excluded from the weighted average rather than counted as zero.
- Replication score defaults to 100 when no standby is detected (replication lag = n/a), as the absence of a standby is not considered a health risk by itself.
