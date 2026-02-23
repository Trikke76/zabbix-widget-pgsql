# PostgreSQL Cluster Overview widget (Zabbix 7)

Custom widget om databases in een PostgreSQL cluster selecteerbaar te tonen met kernmetrics uit het officiele template `PostgreSQL by Zabbix agent 2`.

## Wat deze widget doet

- Leest DB-lijst uit `pgsql.db.discovery[...]`.
- Toont een dropdown met gevonden databases.
- Toont per geselecteerde database:
  - Database size
  - Backends connected
  - Commits/s
  - Rollbacks/s
  - Locks total
  - Deadlocks/s
  - Slow queries (optioneel)

## Structuur

- `pgsql_cluster_widget/manifest.json`
- `pgsql_cluster_widget/Widget.php`
- `pgsql_cluster_widget/actions/WidgetView.php`
- `pgsql_cluster_widget/includes/WidgetForm.php`
- `pgsql_cluster_widget/views/widget.view.php`
- `pgsql_cluster_widget/views/widget.edit.php`
- `pgsql_cluster_widget/assets/js/class.widget.js`
- `pgsql_cluster_widget/assets/css/widget.css`
- `pgsql_cluster_widget/assets/img/postgres-icon-24.svg`

## Installatie

1. Kopieer de map `pgsql_cluster_widget` naar je Zabbix frontend modules map, meestal:
   - `/usr/share/zabbix/modules/`
2. Herstart webserver/php-fpm indien nodig.
3. In Zabbix: `Administration -> General -> Modules` en activeer `PostgreSQL Cluster Overview`.
4. Voeg widget toe op een dashboard.
5. Kies in widget-instellingen het `Database discovery item` (item key `pgsql.db.discovery[...]`).

## Notities

- De widget verwacht dat de host al gekoppeld is aan template `PostgreSQL by Zabbix agent 2`.
- Als discovery nog geen recente waarde heeft, valt de widget terug op item-keys die al bestaan op de host.
- Als je je eigen icoon wilt gebruiken, plaats `postgres-icon-24.png` in `assets/img/` en pas het pad aan in `actions/WidgetView.php`.
