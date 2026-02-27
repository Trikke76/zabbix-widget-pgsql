<?php

declare(strict_types = 1);

namespace Modules\PgsqlClusterWidget\Includes;

use Zabbix\Widgets\CWidgetForm;
use Zabbix\Widgets\Fields\CWidgetFieldMultiSelectHost;
use Zabbix\Widgets\Fields\CWidgetFieldSelect;
use Zabbix\Widgets\Fields\CWidgetFieldTextBox;

class WidgetForm extends CWidgetForm {

	public function addFields(): self {
		return $this
			// ── Host selection ────────────────────────────────────────────
			->addField(
				(new CWidgetFieldMultiSelectHost('hostids', _('Host')))
					->setMultiple(false)
			)
			->addField(
				(new CWidgetFieldTextBox('discovery_itemid', _('Database discovery item ID (optional)')))
					->setDefault('')
			)
			->addField(
				(new CWidgetFieldTextBox('default_db', _('Default database')))
					->setDefault('')
			)

			// ── Zabbix graph links ────────────────────────────────────────
			->addField(
				(new CWidgetFieldTextBox('zabbix_base_url', _('Zabbix base URL (voor graph links)')))
					->setDefault('')
					->setMaxLength(2048)
			)
			->addField(
				(new CWidgetFieldSelect('graph_period', _('Graph periode (klik op card)'), [
					'3600'   => _('1 uur'),
					'21600'  => _('6 uur'),
					'86400'  => _('24 uur'),
					'604800' => _('7 dagen'),
				]))->setDefault('86400')
			)

			// ── Trigger alerts ────────────────────────────────────────────
			->addField(
				(new CWidgetFieldSelect('alert_severity', _('Alert badge severity'), [
					'0' => _('Alle severities'),
					'3' => _('Average en hoger'),
					'4' => _('High en hoger'),
					'5' => _('Alleen Disaster'),
				]))->setDefault('3')
			)

			// ── CPU thresholds ────────────────────────────────────────────
			->addField(
				(new CWidgetFieldTextBox('cpu_warn_threshold', _('CPU warn threshold')))
					->setDefault('1.00')
			)
			->addField(
				(new CWidgetFieldTextBox('cpu_high_threshold', _('CPU high threshold')))
					->setDefault('2.00')
			)

			// ── Health score weights ──────────────────────────────────────
			->addField(
				(new CWidgetFieldTextBox('health_weight_connectivity', _('Health weight: Connectivity (%)')))
					->setDefault('25')
			)
			->addField(
				(new CWidgetFieldTextBox('health_weight_integriteit', _('Health weight: Integriteit (%)')))
					->setDefault('20')
			)
			->addField(
				(new CWidgetFieldTextBox('health_weight_stabiliteit', _('Health weight: Stabiliteit (%)')))
					->setDefault('20')
			)
			->addField(
				(new CWidgetFieldTextBox('health_weight_efficiency', _('Health weight: Efficiency (%)')))
					->setDefault('20')
			)
			->addField(
				(new CWidgetFieldTextBox('health_weight_replication', _('Health weight: Replication (%)')))
					->setDefault('10')
			)
			->addField(
				(new CWidgetFieldTextBox('health_weight_bloat', _('Health weight: Bloat (%)')))
					->setDefault('5')
			)

			// ── Host metrics: show + item key override ────────────────────
			->addField((new CWidgetFieldSelect('show_host_cpu_avg1', _('Show host CPU avg1'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg1_key', _('Item key: host CPU avg1')))
					->setDefault('system.cpu.load[all,avg1]')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_host_cpu_avg5', _('Show host CPU avg5'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg5_key', _('Item key: host CPU avg5')))
					->setDefault('system.cpu.load[all,avg5]')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_host_cpu_avg15', _('Show host CPU avg15'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg15_key', _('Item key: host CPU avg15')))
					->setDefault('system.cpu.load[all,avg15]')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_host_mem_total', _('Show host memory total'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('host_memory_total_key', _('Item key: host memory total')))
					->setDefault('vm.memory.size[total]')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_host_mem_available', _('Show host memory available'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('host_memory_available_key', _('Item key: host memory available')))
					->setDefault('vm.memory.size[available]')
					->setMaxLength(2048)
			)

			// ── Cluster metrics: show + item key override ─────────────────
			->addField((new CWidgetFieldSelect('show_active_connections', _('Show active connections (%)'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_active_connections', _('Item key: active connections')))
					->setDefault('pgsql.connections.sum.total_pct')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_wal_write', _('Show WAL write/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_wal_write', _('Item key: WAL write')))
					->setDefault('pgsql.wal.write')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_wal_receive', _('Show WAL receive/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_wal_receive', _('Item key: WAL receive')))
					->setDefault('pgsql.wal.receive')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_wal_count', _('Show WAL count'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_wal_count', _('Item key: WAL count')))
					->setDefault('pgsql.wal.count')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_cache_hit', _('Show cache hit ratio (%)'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_cache_hit', _('Item key: cache hit')))
					->setDefault('pgsql.cache.hit')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_replication_lag', _('Show replication lag (s)'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_replication_lag', _('Item key: replication lag (prefix)')))
					->setDefault('pgsql.replication.lag.sec')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_xid_age', _('Show oldest XID age'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_xid_age', _('Item key prefix: XID age')))
					->setDefault('pgsql.oldest.xid')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_idle_in_transaction', _('Show idle in transaction'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_idle_in_transaction', _('Item key: idle in transaction')))
					->setDefault('pgsql.connections.sum.idle_in_transaction')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_checkpoint_write_time', _('Show checkpoint write time'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_checkpoint_write_time', _('Item key: checkpoint write time (rate)')))
					->setDefault('pgsql.bgwriter.checkpoint_write_time.rate')
					->setMaxLength(2048)
			)

			// ── Per-DB metrics: show + item key prefix override ───────────
			->addField((new CWidgetFieldSelect('show_db_size', _('Show DB size'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_db_size', _('Item key prefix: DB size')))
					->setDefault('pgsql.db.size')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_backends', _('Show DB active connections'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_backends', _('Item key prefix: backends')))
					->setDefault('pgsql.dbstat.numbackends')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_temp_bytes', _('Show Temp bytes/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_temp_bytes', _('Item key prefix: temp bytes')))
					->setDefault('pgsql.dbstat.temp_bytes.rate')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_commit_rate', _('Show Commits/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_commit_rate', _('Item key prefix: commits')))
					->setDefault('pgsql.dbstat.xact_commit.rate')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_rollback_rate', _('Show Rollbacks/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_rollback_rate', _('Item key prefix: rollbacks')))
					->setDefault('pgsql.dbstat.xact_rollback.rate')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_locks_total', _('Show Locks total'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_locks_total', _('Item key prefix: locks')))
					->setDefault('pgsql.locks.total')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_deadlocks_rate', _('Show Deadlocks/s'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_deadlocks_rate', _('Item key prefix: deadlocks')))
					->setDefault('pgsql.dbstat.deadlocks.rate')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_slow_queries', _('Show Slow queries'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_slow_queries', _('Item key prefix: slow queries')))
					->setDefault('pgsql.queries.query.slow_count')
					->setMaxLength(2048)
			)

			->addField((new CWidgetFieldSelect('show_bloat', _('Show bloating tables'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_bloat', _('Item key prefix: bloat')))
					->setDefault('pgsql.db.bloating_tables')
					->setMaxLength(2048)
			);
	}
}
