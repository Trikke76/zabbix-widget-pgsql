<?php

declare(strict_types = 1);

namespace Modules\PgsqlClusterWidget;

use Zabbix\Core\CWidget;

class Widget extends CWidget {

	public function getDefaultName(): string {
		return _('PostgreSQL Cluster Overview');
	}
}
