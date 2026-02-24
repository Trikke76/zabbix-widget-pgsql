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
			->addField(
				(new CWidgetFieldSelect('show_optional', _('Show extra metrics'), [
					0 => _('No'),
					1 => _('Yes')
				]))->setDefault(1)
			)
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg1_key', _('Host CPU key (avg1)')))
					->setDefault('system.cpu.load[all,avg1]')
			)
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg5_key', _('Host CPU key (avg5)')))
					->setDefault('system.cpu.load[all,avg5]')
			)
			->addField(
				(new CWidgetFieldTextBox('host_cpu_load_avg15_key', _('Host CPU key (avg15)')))
					->setDefault('system.cpu.load[all,avg15]')
			)
			->addField(
				(new CWidgetFieldTextBox('host_memory_total_key', _('Host memory total key')))
					->setDefault('vm.memory.size[total]')
			)
			->addField(
				(new CWidgetFieldTextBox('host_memory_available_key', _('Host memory available key')))
					->setDefault('vm.memory.size[available]')
			)
			->addField((new CWidgetFieldSelect('show_host_cpu_avg1',       _('Show host CPU avg1'),           [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_host_cpu_avg5',       _('Show host CPU avg5'),           [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_host_cpu_avg15',      _('Show host CPU avg15'),          [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_host_mem_total',      _('Show host memory total'),       [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_host_mem_available',  _('Show host memory available'),   [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_active_connections',  _('Show active connections'),      [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_wal_write',           _('Show WAL write/s'),             [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_wal_receive',         _('Show WAL receive/s'),           [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_wal_count',           _('Show WAL count'),               [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_db_size',             _('Show DB size'),                 [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_backends',            _('Show DB active connections'),   [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_temp_bytes',          _('Show Temp bytes/s'),            [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_commit_rate',         _('Show Commits/s'),               [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_rollback_rate',       _('Show Rollbacks/s'),             [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_locks_total',         _('Show Locks total'),             [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_deadlocks_rate',      _('Show Deadlocks/s'),             [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_slow_queries',        _('Show Slow queries'),            [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField(
				(new CWidgetFieldTextBox('cpu_warn_threshold', _('CPU avg1 warn threshold')))
					->setDefault('1.00')
			)
			->addField(
				(new CWidgetFieldTextBox('cpu_high_threshold', _('CPU avg1 high threshold')))
					->setDefault('2.00')
			)
			// ── New metrics ──────────────────────────────────────────────────────
			->addField((new CWidgetFieldSelect('show_cache_hit',       _('Show cache hit ratio (%)'),  [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_replication_lag', _('Show replication lag (s)'),  [0 => _('No'), 1 => _('Yes')]))->setDefault(1))
			->addField((new CWidgetFieldSelect('show_bloat',           _('Show bloating tables'),      [0 => _('No'), 1 => _('Yes')]))->setDefault(1));
	}
}
