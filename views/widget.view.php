<?php

declare(strict_types = 1);

/** @var array $data */

$payload = [
	'databases' => $data['databases'] ?? [],
	'cluster_metrics' => $data['cluster_metrics'] ?? [],
	'host_metrics' => $data['host_metrics'] ?? [],
	'visibility' => $data['visibility'] ?? [],
	'visible_metric_keys' => $data['visible_metric_keys'] ?? [],
	'visible_host_metric_keys' => $data['visible_host_metric_keys'] ?? [],
	'cpu_warn_threshold' => $data['cpu_warn_threshold'] ?? 1.00,
	'cpu_high_threshold' => $data['cpu_high_threshold'] ?? 2.00,
	'default_db' => $data['default_db'] ?? '',
	'show_optional' => (bool) ($data['show_optional'] ?? true),
	'error' => $data['error'] ?? null,
	'icon_url' => $data['icon_url'] ?? 'modules/pgsql_cluster_widget/assets/img/postgres-icon-24.svg'
];

$root = (new CDiv())
	->addClass('pgdb-widget js-pgdb-widget')
	->setAttribute('data-model', json_encode($payload, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT));

$header = (new CDiv())->addClass('pgdb-widget__header');
$visual = (new CDiv())->addClass('pgdb-widget__visual');
$primary_icon = 'modules/pgsql_cluster_widget/assets/img/postgres-icon-24.png';
$icon = (new CTag('img'))
	->addClass('pgdb-widget__icon')
	->setAttribute('src', $primary_icon)
	->setAttribute('data-fallback-src', $payload['icon_url'])
	->setAttribute('alt', 'PostgreSQL')
	->setAttribute('loading', 'lazy');
$rings = (new CTag('ul', true))
	->addClass('pgdb-widget__rings js-pgdb-rings');
$visual->addItem([$icon, $rings]);

$host_metrics = (new CDiv())->addClass('pgdb-widget__host-metrics js-pgdb-host-metrics');
$header->addItem([$visual, $host_metrics]);

$error = (new CDiv())->addClass('pgdb-widget__error js-pgdb-error');
$cards = (new CDiv())->addClass('pgdb-widget__cards js-pgdb-cards');

$root->addItem([$header, $error, $cards]);

$view = new CWidgetView($data);
$view->addItem($root);
$view->show();
