# PostgreSQL Cluster Overview — Zabbix 7 Widget

A custom Zabbix dashboard widget that displays a selectable PostgreSQL cluster
database overview with real-time metrics and sparklines, based on the official
**PostgreSQL by Zabbix agent 2** template.

## What this widget does

- Reads the database list from `pgsql.db.discovery[...]`
- Shows a list of discovered databases with click-to-select buttons
- Displays real sparklines (last 20 data points from Zabbix history) per metric
- Shows per selected database:
  - Database size
  - Active backends
  - Commits/s and Rollbacks/s
  - Locks total and Deadlocks/s
  - Temp bytes/s
  - Slow queries
- Shows cluster-wide metrics (active connections, WAL write/receive/count)
- Shows host system metrics (CPU load avg1/5/15, memory total/available) with threshold-based color indicators

## Requirements

- Zabbix 7.0 but will probably also work on 7.x
- Host monitored with the **PostgreSQL by Zabbix agent 2** template

## Installation

Clone the repository directly into the Zabbix modules directory:

```bash
cd /usr/share/zabbix/modules or modules/ui/
git clone https://github.com/your-org/your-repo.git zabbix-widget-pgsql
```

Then activate the module in Zabbix:

1. Go to **Administration → General → Modules**
2. Click **Scan directory**
3. Enable **PostgreSQL Cluster Overview**
4. Add the widget to any dashboard and select your PostgreSQL host

## Updating

```bash
cd /usr/share/zabbix/modules/zabbix-widget-pgsql
git pull
```

Reload your browser after updating to clear any cached JavaScript.

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

## Notes

- If the discovery rule has not yet collected data, the widget falls back to metric keys already present on the host.
- Asset paths are derived dynamically from the module folder name, so renaming the clone directory does not require any code changes.
- To use a custom icon, place `postgres-icon-24.png` in `assets/img/`. The widget will prefer the `.png` and fall back to the `.svg` automatically.
