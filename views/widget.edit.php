<?php

declare(strict_types = 1);

/** @var array $data */

$form = new CWidgetFormView($data);

$form->addField(new CWidgetFieldMultiSelectHostView($data['fields']['hostids']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['discovery_itemid']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['default_db']));

// CPU thresholds
$form->addField(new CWidgetFieldTextBoxView($data['fields']['cpu_warn_threshold']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['cpu_high_threshold']));

// Host metrics
$form->addField(new CWidgetFieldSelectView($data['fields']['show_host_cpu_avg1']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['host_cpu_load_avg1_key']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_host_cpu_avg5']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['host_cpu_load_avg5_key']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_host_cpu_avg15']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['host_cpu_load_avg15_key']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_host_mem_total']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['host_memory_total_key']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_host_mem_available']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['host_memory_available_key']));

// Cluster metrics
$form->addField(new CWidgetFieldSelectView($data['fields']['show_active_connections']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_active_connections']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_wal_write']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_wal_write']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_wal_receive']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_wal_receive']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_wal_count']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_wal_count']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_cache_hit']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_cache_hit']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_replication_lag']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_replication_lag']));

// Per-DB metrics
$form->addField(new CWidgetFieldSelectView($data['fields']['show_db_size']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_db_size']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_backends']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_backends']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_temp_bytes']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_temp_bytes']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_commit_rate']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_commit_rate']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_rollback_rate']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_rollback_rate']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_locks_total']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_locks_total']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_deadlocks_rate']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_deadlocks_rate']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_slow_queries']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_slow_queries']));

$form->addField(new CWidgetFieldSelectView($data['fields']['show_bloat']));
$form->addField(new CWidgetFieldTextBoxView($data['fields']['key_bloat']));

$form->show();
