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

			// ── CPU thresholds (short width) ──────────────────────────────
			->addField(
				(new CWidgetFieldTextBox('cpu_warn_threshold', _('CPU warn threshold')))
					->setDefault('1.00')
			)
			->addField(
				(new CWidgetFieldTextBox('cpu_high_threshold', _('CPU high threshold')))
					->setDefault('2.00')
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
			->addField((new CWidgetFieldSelect('show_active_connections', _('Show active connections'), [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('key_active_connections', _('Item key: active connections')))
					->setDefault('pgsql.connections.sum.active')
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
