import { InteractiveChart } from '../charts/InteractiveChart';
import { BarChart } from '../charts/BarChart';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { DateRange } from '../components/DateRange';
import { Overlay } from '../components/Overlay';
import { Field, money, type API } from '../operations/UI';

type Metric =
  | 'orders.count'
  | 'customers.count'
  | 'crm.leads'
  | 'sales.quotations'
  | 'inventory.movements'
  | 'inventory.low_stock'
  | 'financial.collections'
  | 'financial.expenses'
  | 'financial.net_movement'
  | 'financial.receivables'
  | 'automations.rules'
  | 'automations.runs';
type Group = 'day' | 'month' | 'status' | 'currency' | 'snapshot';
type Source = 'orders' | 'customers' | 'crm' | 'sales' | 'inventory' | 'financial' | 'automations';
type Widget = {
  id: string;
  metric: Metric;
  title: string;
  chart: 'kpi' | 'line' | 'bar' | 'pie' | 'table';
  group_by: Group;
  color?: string;
  span?: 'normal' | 'wide';
};
type Query = {
  from?: string;
  to?: string;
  range?: 'all';
  currency: string;
  status?: string;
  source?: Source;
};

const metricNames: Record<Metric, string> = {
  'orders.count': 'Orders created',
  'customers.count': 'Customers created',
  'crm.leads': 'CRM leads',
  'sales.quotations': 'Quotations',
  'inventory.movements': 'Stock movement rows',
  'inventory.low_stock': 'Low stock products',
  'financial.collections': 'Confirmed collections',
  'financial.expenses': 'Recorded expenses',
  'financial.net_movement': 'Net movement',
  'financial.receivables': 'Outstanding receivables',
  'automations.rules': 'Automation rules',
  'automations.runs': 'Automation runs',
};
function financeCoverage(financial: any) {
  const quality = financial?.quality;
  if (!quality) return 'Financial source coverage is unavailable.';
  return `${quality.history_days} days of recorded history · ${quality.unreconciled_count} unreconciled exceptions · ${quality.unallocated_confirmations} unallocated confirmations${quality.limited_history ? ' · limited history' : ''}`;
}
function statusOptionsFor(source: Source | undefined, registry: any): string[] {
  return source ? registry?.filters?.find((filter: any) => filter.id === 'status')?.options_by_source?.[source] || [] : [];
}
const groupLabels: Record<Group, string> = {
  day: 'Day',
  month: 'Month',
  status: 'Status',
  currency: 'Currency',
  snapshot: 'Current snapshot',
};
const chartLabels: Record<Widget['chart'], string> = {
  kpi: 'KPI',
  line: 'Line',
  bar: 'Bar',
  pie: 'Pie',
  table: 'Table',
};
const queryString = (input: Record<string, unknown>) => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
};
function dateAtZone(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function shiftDate(date: string, amount: number) {
  const [year, month, day] = date.split('-').map(Number),
    value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}
function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}
function matchingPreset(query: Query, today: string) {
  if (query.range === 'all') return 'all';
  const from = query.from || shiftDate(today, -89),
    to = query.to || today,
    days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (from === today && to === today) return 'today';
  const yesterday = shiftDate(today, -1);
  if (from === yesterday && to === yesterday) return 'yesterday';
  if (from === monthStart(today) && to === today) return 'mtd';
  const previousMonthEnd = shiftDate(monthStart(today), -1);
  if (from === monthStart(previousMonthEnd) && to === previousMonthEnd) return 'previous-month';
  if (from === `${today.slice(0, 4)}-01-01` && to === today) return 'ytd';
  if ([7, 30, 90, 365].includes(days) && to === today) return String(days);
  return 'custom';
}
function defaultWidgets(metrics: any[]): Widget[] {
  const has = (metric: Metric) => metrics.some((entry) => entry.id === metric && entry.available),
    list: Widget[] = [];
  if (has('financial.collections'))
    list.push({
      id: 'collections',
      metric: 'financial.collections',
      title: 'Confirmed collections',
      chart: 'kpi',
      group_by: 'month',
    });
  if (has('financial.net_movement'))
    list.push({
      id: 'net-movement',
      metric: 'financial.net_movement',
      title: 'Net movement',
      chart: 'kpi',
      group_by: 'month',
    });
  if (has('orders.count'))
    list.push({
      id: 'orders',
      metric: 'orders.count',
      title: 'Orders created',
      chart: 'line',
      group_by: 'month',
    });
  if (has('customers.count'))
    list.push({
      id: 'customers',
      metric: 'customers.count',
      title: 'Customers created',
      chart: 'line',
      group_by: 'month',
    });
  if (has('inventory.movements'))
    list.push({
      id: 'stock-movements',
      metric: 'inventory.movements',
      title: 'Stock movement rows',
      chart: 'bar',
      group_by: 'month',
    });
  return list;
}
function templateWidgets(template: string, metrics: any[]): Widget[] {
  const available = new Set(
      metrics.filter((entry) => entry.available).map((entry) => entry.id as Metric),
    ),
    presets: Record<string, Metric[]> = {
      blank: [],
      overview: [
        'financial.collections',
        'financial.net_movement',
        'orders.count',
        'customers.count',
      ],
      sales: ['orders.count', 'sales.quotations', 'crm.leads'],
      finance: [
        'financial.collections',
        'financial.expenses',
        'financial.net_movement',
        'financial.receivables',
      ],
      customers: ['customers.count', 'crm.leads'],
      inventory: ['inventory.low_stock', 'inventory.movements'],
      automations: ['automations.rules', 'automations.runs'],
    };
  return (presets[template] || [])
    .filter((metric) => available.has(metric))
    .map((metric, index) => {
      const definition = metrics.find((entry) => entry.id === metric),
        allowedCharts = definition?.allowed_charts || ['kpi', 'line', 'bar', 'pie', 'table'],
        preferredChart = metric.startsWith('financial.') ? 'kpi' : index < 2 ? 'line' : 'bar';
      return {
        id: `widget-${Date.now()}-${index}`,
        metric,
        title: metricNames[metric],
        chart: (allowedCharts.includes(preferredChart) ? preferredChart : allowedCharts[0] || 'kpi') as Widget['chart'],
        group_by: (definition?.groups?.includes('month') ? 'month' : definition?.groups?.[0] || 'month') as Group,
      };
    });
}

export function AnalyticsWorkspace({
  api,
  scope,
  section = 'dashboard',
  kind = 'business',
  manager = false,
  navigate,
  openRecord,
}: {
  api: API;
  scope: string;
  section?: string;
  kind?: string;
  manager?: boolean;
  navigate?: (tab: string) => void;
  openRecord?: (tab: string, id: string) => void;
}) {
  const [query, setQuery] = useState<Query>({ currency: 'KES' });
  const [data, setData] = useState<any>(null),
    [registry, setRegistry] = useState<any>(null),
    [dashboards, setDashboards] = useState<any[]>([]),
    [savedReports, setSavedReports] = useState<any[]>([]),
    [activeDashboardId, setActiveDashboardId] = useState(''),
    [reports, setReports] = useState<Record<string, any>>({}),
    [reportErrors, setReportErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [loadErrors, setLoadErrors] = useState<Record<string, string>>({}),
    [revision, setRevision] = useState(0),
    [filterOpen, setFilterOpen] = useState(false),
    [filterDraft, setFilterDraft] = useState<Query>({ currency: 'KES' }),
    [search, setSearch] = useState(''),
    [favorite, setFavorite] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [template, setTemplate] = useState('overview'),
    [builder, setBuilder] = useState(false),
    [builderTab, setBuilderTab] = useState<'configuration' | 'design'>('configuration'),
    [selectedWidgetId, setSelectedWidgetId] = useState(''),
    [editingDashboard, setEditingDashboard] = useState<any>(null),
    [draftName, setDraftName] = useState(''),
    [draftFilters, setDraftFilters] = useState<Query>({ currency: 'KES' }),
    [draftWidgets, setDraftWidgets] = useState<Widget[]>([]),
    [widgetMetric, setWidgetMetric] = useState<Metric>('orders.count'),
    [widgetSource, setWidgetSource] = useState<Source>('orders'),
    [widgetGroup, setWidgetGroup] = useState<Group>('month'),
    [widgetChart, setWidgetChart] = useState<Widget['chart']>('bar'),
    [builderPreview, setBuilderPreview] = useState<any>(null),
    [builderPreviewError, setBuilderPreviewError] = useState(''),
    [builderBusy, setBuilderBusy] = useState(false),
    [reportMetric, setReportMetric] = useState<Metric>('orders.count'),
    [reportGroup, setReportGroup] = useState<Group>('month'),
    [reportChart, setReportChart] = useState<'kpi' | 'line' | 'bar' | 'pie' | 'table'>('line'),
    [reportView, setReportView] = useState<'graph' | 'pivot' | 'table'>('graph'),
    [reportData, setReportData] = useState<any>(null),
    [reportName, setReportName] = useState(''),
    [reportSaveError, setReportSaveError] = useState(''),
    [reportSaving, setReportSaving] = useState(false),
    [pivotData, setPivotData] = useState<any>(null),
    [pivotExpanded, setPivotExpanded] = useState<Record<string, any>>({}),
    [pivotRows, setPivotRows] = useState<Group>('month'),
    [pivotColumns, setPivotColumns] = useState<Group>('status'),
    [activityDrillKind, setActivityDrillKind] = useState<'orders' | 'customers'>('orders'),
    [reportPage, setReportPage] = useState(0),
    [drill, setDrill] = useState<any>(null);
  const loadGate = useRef(0),
    reportGate = useRef(0),
    pivotGate = useRef(0),
    drillGate = useRef(0),
    previewGate = useRef(0);
  const queryKey = JSON.stringify(query),
    activeDashboard = dashboards.find((dashboard) => dashboard.id === activeDashboardId) || null,
    availableMetrics = registry?.metrics || [],
    availableSources: Source[] = Array.from(
      new Set<Source>(
        availableMetrics
          .filter((item: any) => item.available)
          .map((item: any) => item.source as Source),
      ),
    ),
    fallbackWidgets = useMemo(() => defaultWidgets(availableMetrics), [registry]),
    dashboardWidgets: Widget[] = activeDashboard?.configuration?.widgets?.length
      ? activeDashboard.configuration.widgets
      : fallbackWidgets,
    selectedMetric = availableMetrics.find((item: any) => item.id === reportMetric),
    selectedWidgetMetric = availableMetrics.find((item: any) => item.id === widgetMetric),
    selectedWidget =
      draftWidgets.find((widget) => widget.id === selectedWidgetId) || draftWidgets[0],
    today = dateAtZone(registry?.timezone || 'Africa/Nairobi');

  useEffect(() => {
    const gate = ++loadGate.current;
    setLoading(true);
    setLoadErrors({});
    setData(null);
    const request = (key: string, path: string, accept: (value: any) => void) =>
      api(path, 'GET', undefined, { 'Cache-Control': 'no-cache' })
        .then((value) => {
          if (gate === loadGate.current) accept(value);
        })
        .catch((error) => {
          if (gate === loadGate.current)
            setLoadErrors((current) => ({
              ...current,
              [key]: error.message || 'Could not load this section.',
            }));
        });
    Promise.allSettled([
      request('dashboard', '/business/analytics?' + queryString(query), setData),
      request('registry', '/business/analytics/registry', setRegistry),
      request('dashboards', '/business/analytics/dashboards', (result) =>
        setDashboards(result.data || []),
      ),
      request('saved', '/business/saved-reports', (result) => setSavedReports(result.data || [])),
    ]).then(() => {
      if (gate === loadGate.current) setLoading(false);
    });
    return () => {
      loadGate.current++;
    };
  }, [api, scope, queryKey, revision]);

  useEffect(() => {
    if (dashboards.length && !activeDashboardId) setActiveDashboardId(dashboards[0].id);
  }, [dashboards, activeDashboardId]);
  useEffect(() => {
    if (!activeDashboard) return;
    setQuery({ currency: 'KES', ...activeDashboard.configuration.filters });
    setDraftName(activeDashboard.name);
    setDraftFilters({ currency: 'KES', ...activeDashboard.configuration.filters });
    setDraftWidgets(activeDashboard.configuration.widgets || []);
  }, [activeDashboardId]);
  useEffect(() => {
    setFavorite(
      localStorage.getItem(
        `africore.analytics.favorite.${scope}.${activeDashboardId || 'default'}`,
      ) === 'true',
    );
  }, [scope, activeDashboardId]);
  useEffect(() => {
    const metric = availableMetrics.find((item: any) => item.available)?.id;
    const source = availableMetrics.find((item: any) => item.available)?.source as Source | undefined;
    if (metric && !availableMetrics.some((item: any) => item.id === reportMetric && item.available))
      setReportMetric(metric);
    if (metric && !availableMetrics.some((item: any) => item.id === widgetMetric && item.available))
      setWidgetMetric(metric);
    if (source && !availableSources.includes(widgetSource)) setWidgetSource(source);
  }, [registry]);
  useEffect(() => {
    const source = availableMetrics.find((item: any) => item.id === widgetMetric)?.source as Source | undefined;
    if (source) setWidgetSource(source);
  }, [widgetMetric, registry]);
  useEffect(() => {
    if (section === 'explore') setReportView('pivot');
    if (section === 'reporting') setReportView('graph');
  }, [section]);
  useEffect(() => {
    const groups: Group[] = selectedMetric?.groups || [];
    if (groups.length) {
      if (!groups.includes(pivotRows)) setPivotRows(groups[0]);
      if (!groups.includes(pivotColumns) || pivotColumns === pivotRows)
        setPivotColumns(groups.find((group: Group) => group !== pivotRows) || groups[0]);
      if (!groups.includes(reportGroup)) setReportGroup(groups[0]);
    }
  }, [selectedMetric?.id]);
  useEffect(() => {
    const groups: Group[] = selectedWidgetMetric?.groups || [];
    if (groups.length && !groups.includes(widgetGroup)) setWidgetGroup(groups[0]);
    if (
      selectedWidgetMetric?.allowed_charts?.length &&
      (!selectedWidgetMetric.allowed_charts.includes(widgetChart) ||
        (widgetChart === 'line' && !['day', 'month'].includes(widgetGroup)))
    )
      setWidgetChart(
        (selectedWidgetMetric.allowed_charts.includes('bar')
          ? 'bar'
          : selectedWidgetMetric.allowed_charts[0]) as Widget['chart'],
      );
  }, [selectedWidgetMetric?.id, widgetGroup, widgetChart]);
  useEffect(() => {
    if (
      selectedMetric?.allowed_charts?.length &&
      (!selectedMetric.allowed_charts.includes(reportChart) ||
        (reportChart === 'line' && !['day', 'month'].includes(reportGroup)))
    )
      setReportChart(
        (selectedMetric.allowed_charts.includes('bar')
          ? 'bar'
          : selectedMetric.allowed_charts[0]) as typeof reportChart,
      );
  }, [selectedMetric?.id, reportGroup, reportChart]);
  useEffect(() => {
    const active = dashboardWidgets.filter(
      (widget) => !search || widget.title.toLowerCase().includes(search.toLowerCase()),
    );
    if (!registry || !active.length || !['dashboard', 'saved-dashboards'].includes(section)) return;
    const gate = ++reportGate.current;
    setReports({});
    setReportErrors({});
    active.forEach((widget) => {
      const path =
        '/business/analytics/report?' +
        queryString({ ...query, metric: widget.metric, group_by: widget.group_by });
      api(path, 'GET', undefined, { 'Cache-Control': 'no-cache' })
        .then((result) => {
          if (gate === reportGate.current)
            setReports((current) => ({ ...current, [widget.id]: result }));
        })
        .catch((error) => {
          if (gate === reportGate.current)
            setReportErrors((current) => ({
              ...current,
              [widget.id]: error.message || 'Report unavailable.',
            }));
        });
    });
    return () => {
      reportGate.current++;
    };
  }, [
    api,
    registry,
    queryKey,
    section,
    search,
    activeDashboardId,
    JSON.stringify(dashboardWidgets),
  ]);
  useEffect(() => {
    if (!registry || !['reporting', 'explore'].includes(section)) return;
    const gate = ++reportGate.current;
    setReportData(null);
    api(
      '/business/analytics/report?' +
        queryString({ ...query, metric: reportMetric, group_by: reportGroup }),
      'GET',
      undefined,
      { 'Cache-Control': 'no-cache' },
    )
      .then((result) => {
        if (gate === reportGate.current) setReportData(result);
      })
      .catch((error) => {
        if (gate === reportGate.current)
          setLoadErrors((current) => ({
            ...current,
            report: error.message || 'Report unavailable.',
          }));
      });
    return () => {
      reportGate.current++;
    };
  }, [api, registry, queryKey, section, reportMetric, reportGroup]);
  useEffect(() => {
    if (!registry || section !== 'explore' || reportView !== 'pivot') return;
    const gate = ++pivotGate.current;
    setPivotData(null);
    setPivotExpanded({});
    api(
      '/business/analytics/pivot?' +
        queryString({ ...query, metric: reportMetric, row_by: pivotRows, column_by: pivotColumns }),
      'GET',
      undefined,
      { 'Cache-Control': 'no-cache' },
    )
      .then((result) => {
        if (gate === pivotGate.current) setPivotData(result);
      })
      .catch((error) => {
        if (gate === pivotGate.current)
          setLoadErrors((current) => ({
            ...current,
            pivot: error.message || 'Pivot unavailable.',
          }));
      });
    return () => {
      pivotGate.current++;
    };
  }, [api, registry, queryKey, section, reportView, reportMetric, pivotRows, pivotColumns]);
  useEffect(() => {
    if (!builder || !registry || !draftWidgets.length) {
      setBuilderPreview(null);
      return;
    }
    const widget = selectedWidget,
      gate = ++previewGate.current;
    setBuilderPreviewError('');
    api(
      '/business/analytics/report?' +
        queryString({ ...draftFilters, metric: widget.metric, group_by: widget.group_by }),
      'GET',
      undefined,
      { 'Cache-Control': 'no-cache' },
    )
      .then((value) => {
        if (gate === previewGate.current) setBuilderPreview(value);
      })
      .catch((error) => {
        if (gate === previewGate.current) {
          setBuilderPreview(null);
          setBuilderPreviewError(error.message || 'Preview unavailable.');
        }
      });
    return () => {
      previewGate.current++;
    };
  }, [api, registry, builder, JSON.stringify(draftFilters), JSON.stringify(selectedWidget)]);
  useEffect(() => {
    drillGate.current++;
    setDrill(null);
    setReportPage(0);
  }, [scope, queryKey]);

  async function inspect(filter: any) {
    const gate = ++drillGate.current;
    setDrill({ filter, loading: true });
    try {
      const result = await api(
        '/business/analytics/records?' + queryString({ ...query, ...filter }),
      );
      if (gate === drillGate.current) setDrill({ filter, data: result, loading: false });
    } catch (error) {
      if (gate === drillGate.current)
        setDrill({ filter, error: (error as Error).message, loading: false });
    }
  }
  async function saveExploration() {
    const name = reportName.trim();
    if (name.length < 2 || !selectedMetric) return;
    setReportSaving(true);
    setReportSaveError('');
    try {
      const result = await api('/business/saved-reports', 'POST', {
        name,
        configuration: {
          query,
          widgets: [legacyWidgetForSource(selectedMetric.source as Source)],
          exploration: {
            metric: reportMetric,
            group_by: reportGroup,
            chart: reportChart,
            view: reportView,
            source: selectedMetric.source,
            ...(reportView === 'pivot' ? { row_by: pivotRows, column_by: pivotColumns } : {}),
          },
        },
      });
      setSavedReports((current) => [result, ...current.filter((entry) => entry.id !== result.id)]);
      setReportName('');
    } catch (error) {
      setReportSaveError((error as Error).message || 'Could not save this exploration.');
    } finally {
      setReportSaving(false);
    }
  }
  function inspectReportRow(row: any) {
    if (row?.drilldown) void inspect(row.drilldown);
  }
  function inspectPivotCell(rowKey: string, columnKey: string) {
    if (!['orders.count', 'customers.count'].includes(reportMetric)) return;
    if (pivotRows === 'currency' || pivotColumns === 'currency') return;
    const filter: any = { kind: reportMetric === 'orders.count' ? 'orders' : 'customers' };
    if (query.from) filter.from = query.from;
    if (query.to) filter.to = query.to;
    for (const [dimension, key] of [[pivotRows, rowKey], [pivotColumns, columnKey]] as [Group, string][]) {
      if (dimension === 'day') filter.date = key;
      if (dimension === 'month') {
        filter.from = query.from && query.from > `${key}-01` ? query.from : `${key}-01`;
        filter.to = query.to && query.to < monthLastDay(key) ? query.to : monthLastDay(key);
      }
      if (dimension === 'status') filter.status = key === 'Unclassified' ? '__unclassified__' : key;
    }
    void inspect(filter);
  }
  async function togglePivotMonth(month: string) {
    if (pivotExpanded[month]) {
      setPivotExpanded((current) => {
        const next = { ...current };
        delete next[month];
        return next;
      });
      return;
    }
    const from = query.from && query.from > `${month}-01` ? query.from : `${month}-01`,
      to = query.to && query.to < monthLastDay(month) ? query.to : monthLastDay(month);
    try {
      const result = await api(
        '/business/analytics/pivot?' +
          queryString({
            ...query,
            range: undefined,
            from,
            to,
            metric: reportMetric,
            row_by: 'day',
            column_by: pivotColumns,
          }),
      );
      setPivotExpanded((current) => ({ ...current, [month]: result }));
    } catch (error) {
      setLoadErrors((current) => ({
        ...current,
        pivot: (error as Error).message || 'Could not expand this period.',
      }));
    }
  }
  function closeDrill() {
    drillGate.current++;
    setDrill(null);
  }
  function applyPreset(days: number | 'all') {
    if (days === 'all') {
      setQuery((current) => ({ ...current, from: undefined, to: undefined, range: 'all' }));
      return;
    }
    const to = dateAtZone(registry?.timezone || 'Africa/Nairobi');
    setQuery((current) => ({
      currency: current.currency,
      from: shiftDate(to, -days + 1),
      to,
      ...(current.status ? { status: current.status } : {}),
      ...(current.source ? { source: current.source } : {}),
    }));
  }
  function applyDatePreset(preset: string) {
    const todayValue = dateAtZone(registry?.timezone || 'Africa/Nairobi');
    if (preset === 'custom') {
      setFilterOpen(true);
      return;
    }
    if (preset === 'all') {
      setQuery((current) => ({ ...current, from: undefined, to: undefined, range: 'all' }));
      return;
    }
    if (preset === 'today') {
      setQuery((current) => ({ ...current, range: undefined, from: todayValue, to: todayValue }));
      return;
    }
    if (preset === 'yesterday') {
      const yesterday = shiftDate(todayValue, -1);
      setQuery((current) => ({ ...current, range: undefined, from: yesterday, to: yesterday }));
      return;
    }
    if (preset === '7' || preset === '30' || preset === '90' || preset === '365') {
      applyPreset(Number(preset));
      return;
    }
    const start = monthStart(todayValue);
    if (preset === 'mtd') {
      setQuery((current) => ({ ...current, range: undefined, from: start, to: todayValue }));
      return;
    }
    if (preset === 'previous-month') {
      const end = shiftDate(start, -1);
      setQuery((current) => ({ ...current, range: undefined, from: monthStart(end), to: end }));
      return;
    }
    if (preset === 'ytd') {
      setQuery((current) => ({ ...current, range: undefined, from: `${todayValue.slice(0, 4)}-01-01`, to: todayValue }));
    }
  }
  function shiftPeriod(direction: number) {
    const to = query.to || today,
      from = query.from || shiftDate(to, -89),
      span = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1),
      nextFrom = shiftDate(from, span * direction),
      nextTo = shiftDate(to, span * direction);
    setQuery((current) => ({ ...current, range: undefined, from: nextFrom, to: nextTo }));
  }
  function openBuilder(dashboard?: any, chosenTemplate = 'blank') {
    const widgets =
      dashboard?.configuration?.widgets || templateWidgets(chosenTemplate, availableMetrics);
    const requestedName = draftName.trim();
    setEditingDashboard(dashboard ? { id: dashboard.id, version: dashboard.version } : null);
    setDraftName(
      dashboard?.name ||
        requestedName ||
        (chosenTemplate === 'blank'
          ? 'New Dashboard'
          : `${chosenTemplate[0].toUpperCase()}${chosenTemplate.slice(1)} Dashboard`),
    );
    setDraftFilters({ currency: 'KES', ...(dashboard?.configuration?.filters || query) });
    setDraftWidgets(widgets);
    setSelectedWidgetId(widgets[0]?.id || '');
    setBuilderTab('configuration');
    setBuilder(true);
    setCreateOpen(false);
  }
  function addWidget() {
    const label =
      availableMetrics.find((item: any) => item.id === widgetMetric)?.label ||
      metricNames[widgetMetric];
    const id = `widget-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    setSelectedWidgetId(id);
    setDraftWidgets((current) => [
      ...current,
      {
        id,
        metric: widgetMetric,
        title: label,
        chart: widgetMetric.startsWith('financial.') ? 'kpi' : widgetChart,
        group_by: widgetGroup,
        color: palette[current.length % palette.length],
        span: 'normal',
      },
    ]);
  }
  function selectMetricForWidget(widgetId: string, metric: Metric) {
    const definition = availableMetrics.find((item: any) => item.id === metric),
      groups: Group[] = definition?.groups || ['month'];
    setDraftWidgets((current) =>
      current.map((item) =>
        item.id === widgetId
          ? {
              ...item,
              metric,
              title: metricNames[metric],
              group_by: groups[0] || 'month',
              chart: definition?.allowed_charts?.includes(item.chart)
                ? item.chart
                : (definition?.allowed_charts?.[0] as Widget['chart']) || 'kpi',
            }
          : item,
      ),
    );
  }
  async function saveDashboard() {
    setBuilderBusy(true);
    try {
      const body = {
          name: draftName,
          configuration: { filters: draftFilters, widgets: draftWidgets },
        },
        result = editingDashboard
          ? await api(`/business/analytics/dashboards/${editingDashboard.id}`, 'PATCH', {
              ...body,
              expected_version: editingDashboard.version,
            })
          : await api('/business/analytics/dashboards', 'POST', { ...body, template: template });
      setBuilder(false);
      setQuery({ currency: 'KES', ...result.configuration.filters });
      setActiveDashboardId(result.id);
      setRevision((value) => value + 1);
    } catch (error) {
      setBuilderPreviewError((error as Error).message || 'Dashboard could not be saved.');
    } finally {
      setBuilderBusy(false);
    }
  }
  async function removeDashboard() {
    if (!activeDashboard) return;
    if (!window.confirm(`Delete “${activeDashboard.name}”?`)) return;
    try {
      await api(`/business/analytics/dashboards/${activeDashboard.id}`, 'DELETE', {});
      setActiveDashboardId('');
      setRevision((value) => value + 1);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, dashboards: (error as Error).message }));
    }
  }
  async function duplicateDashboard() {
    if (!activeDashboard) return;
    try {
      const copy = await api(
        `/business/analytics/dashboards/${activeDashboard.id}/duplicate`,
        'POST',
        {},
      );
      setActiveDashboardId(copy.id);
      setRevision((value) => value + 1);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, dashboards: (error as Error).message }));
    }
  }
  function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    localStorage.setItem(
      `africore.analytics.favorite.${scope}.${activeDashboardId || 'default'}`,
      String(next),
    );
  }
  async function exportReport(metric = reportMetric, groupBy = reportGroup) {
    try {
      const result = await api(
          '/business/analytics/report/export-data?' +
            queryString({ ...query, metric, group_by: groupBy }),
        ),
        url = URL.createObjectURL(
          new Blob([result.content], { type: result.content_type || 'text/csv' }),
        ),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename || 'africore-analytics-report.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, export: (error as Error).message }));
    }
  }
  async function exportDashboard() {
    try {
      const result = await api(
          '/business/analytics/export-data?' + queryString(query),
          'GET',
          undefined,
          { 'Cache-Control': 'no-cache' },
        ),
        url = URL.createObjectURL(
          new Blob([result.content], { type: result.content_type || 'text/csv' }),
        ),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename || 'africore-analytics-dashboard.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, export: (error as Error).message }));
    }
  }
  async function exportPivot() {
    try {
      const result = await api(
          '/business/analytics/pivot/export-data?' +
            queryString({ ...query, metric: reportMetric, row_by: pivotRows, column_by: pivotColumns }),
          'GET',
          undefined,
          { 'Cache-Control': 'no-cache' },
        ),
        url = URL.createObjectURL(
          new Blob([result.content], { type: result.content_type || 'text/csv' }),
        ),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename || 'africore-analytics-pivot.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setLoadErrors((current) => ({ ...current, export: (error as Error).message }));
    }
  }
  const queryLabels = [
    query.from || query.range === 'all'
      ? `${query.from || 'All history'} → ${query.to || 'today'}`
      : 'Last 90 days',
    query.status
      ? `Status: ${query.status === '__unclassified__' ? 'Unclassified' : query.status}`
      : '',
    query.source ? `Source: ${registry?.sources?.[query.source]?.label || query.source}` : '',
    query.currency ? `Currency: ${query.currency}` : '',
  ].filter(Boolean);
  const summary = useMemo(() => {
    const series = data?.series || [],
      sum = (name: string) =>
        series
          .filter((row: any) => row.kind === name)
          .reduce((total: number, row: any) => total + Number(row.count || 0), 0);
    return { orders: sum('orders'), customers: sum('customers') };
  }, [data]);
  const activityPoints = useMemo(() => {
    const byDate: Record<string, any> = {};
    for (const row of data?.series || []) {
      const current =
        byDate[row.date] || (byDate[row.date] = { date: row.date, orders: 0, customers: 0 });
      if (row.kind === 'orders' || row.kind === 'customers')
        current[row.kind] = Number(row.count || 0);
    }
    return Object.values(byDate);
  }, [data]);
  const activitySeries = [
      ...(data?.sources?.orders && (!query.source || query.source === 'orders')
        ? [{ key: 'orders', label: 'Orders', color: '#52a6e8' }]
        : []),
      ...(data?.sources?.customers && (!query.source || query.source === 'customers')
        ? [{ key: 'customers', label: 'Customers', color: '#44bdab' }]
        : []),
    ],
    searchResults = dashboardWidgets.filter(
      (widget) => !search || widget.title.toLowerCase().includes(search.toLowerCase()),
    ),
    reportRows = reportData?.rows || [],
    reportPages = Math.max(1, Math.ceil(reportRows.length / 25));

  function renderWidget(widget: Widget) {
    const result = reports[widget.id],
      error = reportErrors[widget.id];
    if (error)
      return (
        <article className="analytics-widget panel" key={widget.id}>
          <h3>{widget.title}</h3>
          <p className="alert error">{error}</p>
        </article>
      );
    if (!result)
      return (
        <article className="analytics-widget panel" key={widget.id}>
          <h3>{widget.title}</h3>
          <p role="status">Loading authorized metric…</p>
        </article>
      );
    if (result.excluded_by_source_filter)
      return (
        <article className="analytics-widget panel" key={widget.id}>
          <h3>{widget.title}</h3>
          <p className="analytics-excluded">Excluded by the selected record-source filter.</p>
        </article>
      );
    const isMoney = widget.metric.startsWith('financial.'),
      value = Number(result.value || 0),
      rows = result.rows || [],
      title = widget.title || result.label;
    return (
      <article
        className={`analytics-widget panel ${widget.span === 'wide' || widget.chart === 'line' ? 'analytics-widget-wide' : ''}`}
        key={widget.id}
      >
        <header>
          <div>
            <h3>{title}</h3>
            <small>{result.definition}</small>
          </div>
          <span>{result.source}</span>
        </header>
        {widget.chart === 'kpi' ? (
          <div className="analytics-widget-kpi">
            <strong className="analytics-widget-value">
              {isMoney ? money(value, result.currency || query.currency) : value.toLocaleString('en-KE')}
            </strong>
            <small>
              {widget.metric === 'inventory.low_stock'
                ? `As of ${result.refreshed_at}`
                : `${result.period.from} – ${result.period.to}`}
              {result.currency ? ` · ${result.currency}` : ''}
              {result.timezone ? ` · ${result.timezone}` : ''}
            </small>
            {result.coverage && <small>{result.coverage}</small>}
            <small>Refreshed: {result.refreshed_at}</small>
          </div>
        ) : widget.chart === 'line' && ['day', 'month'].includes(widget.group_by) ? (
          <InteractiveChart
            compact
            headingLevel={3}
            title={`${title} by ${groupLabels[widget.group_by].toLowerCase()}`}
            points={rows.map((row: any) => ({
              date: widget.group_by === 'month' ? `${row.key}-01` : row.key,
              count: row.value,
            }))}
            series={[{ key: 'count', label: title, color: widget.color || '#52a6e8' }]}
            description={result.definition}
            onPointSelect={result.drilldown ? (point: any) => {
              const item = rows.find(
                (entry: any) =>
                  (widget.group_by === 'month' ? `${entry.key}-01` : entry.key) === point.date,
              );
              inspectReportRow(item);
            } : undefined}
          />
        ) : widget.chart === 'pie' ? (
          <div className="analytics-pie-wrap">
            <div
              className="analytics-pie"
              style={{ background: pieGradient(rows) }}
              aria-label={`${title} distribution`}
            >
              <span>{value.toLocaleString('en-KE')}</span>
            </div>
            <div className="analytics-pie-legend">
              {rows.map((row: any, index: number) => (
                <span key={row.key}>
                  <i style={{ background: pieColor(index) }} />
                  {row.drilldown ? (
                    <button className="analytics-pie-drill" onClick={() => inspectReportRow(row)}>
                      {row.label} <b>{Number(row.value).toLocaleString('en-KE')}</b>
                    </button>
                  ) : (
                    <>{row.label} <b>{Number(row.value).toLocaleString('en-KE')}</b></>
                  )}
                </span>
              ))}
            </div>
          </div>
        ) : widget.chart === 'table' ? (
          <DataTable>
            <thead>
              <tr>
                <th>{groupLabels[widget.group_by]}</th>
                <th>Records</th>
                {result.drilldown && <th>Inspect</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                  {result.drilldown && <td>{row.drilldown ? <button className="quiet-button" onClick={() => inspectReportRow(row)}>View records</button> : '—'}</td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={result.drilldown ? 3 : 2}>No observations in the selected period.</td></tr>}
            </tbody>
          </DataTable>
        ) : (
          <BarChart
            title={`${title} by ${groupLabels[widget.group_by].toLowerCase()}`}
            rows={rows.map((row: any) => ({
              key: row.key,
              label: row.label,
              value: Number(row.value),
            }))}
            color={widget.color || '#426900'}
            onInspect={result.drilldown ? (key) => inspectReportRow(rows.find((row: any) => String(row.key) === key)) : undefined}
          />
        )}
        {!!result.ignored_filters?.length && (
          <p className="analytics-filter-note">
            These filters do not apply to this measure: {result.ignored_filters.join(', ')}.
          </p>
        )}
        {widget.chart !== 'kpi' && (
          <footer>
            <span>
              {result.period.from} – {result.period.to} · {result.timezone}
            </span>
            <button
              className="quiet-button"
              onClick={() => void exportReport(widget.metric, widget.group_by)}
            >
              Export CSV
            </button>
          </footer>
        )}
      </article>
    );
  }

  return (
    <div className="apps-workspace analytics-workspace">
      <div className="analytics-toolbar">
        <label className="analytics-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search this dashboard"
            placeholder="Search dashboard…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            aria-label="Open filters"
            onClick={() => {
              setFilterDraft(query);
              setFilterOpen((value) => !value);
            }}
          >
            ▾
          </button>
        </label>
        <div className="analytics-period-controls">
          <select
            aria-label="Reporting period"
            value={matchingPreset(query, today)}
            onChange={(event) => applyDatePreset(event.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last 365 Days</option>
            <option value="mtd">Month to Date</option>
            <option value="previous-month">Previous Month</option>
            <option value="ytd">Year to Date</option>
            <option value="all">All History</option>
            <option value="custom">Custom…</option>
          </select>
          <button aria-label="Previous period" onClick={() => shiftPeriod(-1)}>
            ‹
          </button>
          <button
            aria-label="Next period"
            disabled={!query.to || query.to >= today}
            onClick={() => shiftPeriod(1)}
          >
            ›
          </button>
          <button
            className="analytics-toolbar-action"
            onClick={() => setRevision((value) => value + 1)}
            aria-label="Refresh analytics"
            title="Refresh analytics from authorized sources"
          >
            Refresh
          </button>
          <button className="analytics-toolbar-action" onClick={() => void exportDashboard()}>
            Export CSV
          </button>
        </div>
        <button
          className="analytics-star"
          aria-label={favorite ? 'Remove favorite dashboard' : 'Add favorite dashboard'}
          aria-pressed={favorite}
          onClick={toggleFavorite}
        >
          {favorite ? '★' : '☆'}
        </button>
        {manager && (
          <button className="secondary-button" onClick={() => setCreateOpen(true)}>
            New Dashboard
          </button>
        )}
        {filterOpen && (
          <div className="analytics-filter-popover" role="dialog" aria-label="Dashboard filters">
            <header>
              <strong>Filters</strong>
              <button className="quiet-button" onClick={() => setFilterOpen(false)}>
                ×
              </button>
            </header>
            <DateRange
              applyLabel="Set range"
              from={filterDraft.from || ''}
              to={filterDraft.to || ''}
              onApply={(from, to) => {
                const next = {
                  ...filterDraft,
                  range: undefined,
                  from: from || undefined,
                  to: to || undefined,
                };
                setFilterDraft(next);
              }}
            >
              <Field label="Date preset">
                <select
                  value="custom"
                  onChange={(event) => {
                    const current = filterDraft,
                      todayValue = dateAtZone(registry?.timezone || 'Africa/Nairobi');
                    let next = { ...current, range: undefined } as Query;
                    switch (event.target.value) {
                      case 'today':
                        next = { ...next, from: todayValue, to: todayValue };
                        break;
                      case 'yesterday':
                        next = { ...next, from: shiftDate(todayValue, -1), to: shiftDate(todayValue, -1) };
                        break;
                      case '7':
                      case '30':
                      case '90':
                      case '365':
                        next = { ...next, from: shiftDate(todayValue, -Number(event.target.value) + 1), to: todayValue };
                        break;
                      case 'mtd':
                        next = { ...next, from: monthStart(todayValue), to: todayValue };
                        break;
                      case 'previous-month': {
                        const end = shiftDate(monthStart(todayValue), -1);
                        next = { ...next, from: monthStart(end), to: end };
                        break;
                      }
                      case 'ytd':
                        next = { ...next, from: `${todayValue.slice(0, 4)}-01-01`, to: todayValue };
                        break;
                      case 'all':
                        next = { currency: current.currency, source: current.source, range: 'all' };
                        break;
                      default:
                        break;
                    }
                    setFilterDraft(next);
                  }}
                >
                  <option value="custom">Custom range</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="7">Last 7 Days</option>
                  <option value="30">Last 30 Days</option>
                  <option value="90">Last 90 Days</option>
                  <option value="mtd">Month to Date</option>
                  <option value="previous-month">Previous Month</option>
                  <option value="ytd">Year to Date</option>
                  <option value="all">All Recorded History</option>
                </select>
              </Field>
              <Field label="Record source">
                <select
                  value={filterDraft.source || ''}
                  onChange={(event) =>
                    setFilterDraft((current) => ({
                      ...current,
                      source: (event.target.value || undefined) as Source | undefined,
                      status: undefined,
                    }))
                  }
                >
                  <option value="">All authorized sources</option>
                  {Object.entries(registry?.sources || {}).map(([id, source]: [string, any]) =>
                    source.readable ? <option key={id} value={id}>{source.label}</option> : null,
                  )}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={filterDraft.status || ''}
                  disabled={!filterDraft.source || !statusOptionsFor(filterDraft.source, registry).length}
                  onChange={(event) =>
                    setFilterDraft((current) => ({
                      ...current,
                      status: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{filterDraft.source ? 'All statuses' : 'Choose a source first'}</option>
                  {statusOptionsFor(filterDraft.source, registry).map((status) => (
                    <option key={status} value={status}>
                      {status === '__unclassified__' ? 'Unclassified' : status}
                    </option>
                  ))}
                </select>
                {filterDraft.source && !statusOptionsFor(filterDraft.source, registry).length && (
                  <small>This source has no status dimension.</small>
                )}
              </Field>
              <Field label="Reporting currency">
                <select
                  value={filterDraft.currency || 'KES'}
                  onChange={(event) =>
                    setFilterDraft((current) => ({ ...current, currency: event.target.value }))
                  }
                >
                  {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
            </DateRange>
            <div className="analytics-filter-actions">
              <button
                className="button"
                onClick={() => {
                  setQuery({
                    ...filterDraft,
                    status: filterDraft.source ? filterDraft.status : undefined,
                  });
                  setFilterOpen(false);
                }}
              >
                Apply
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setFilterDraft({ currency: 'KES' });
                  setQuery({ currency: 'KES' });
                  setFilterOpen(false);
                }}
              >
                Reset
              </button>
              <button
                className="quiet-button"
                onClick={() => {
                  setFilterDraft(query);
                  setFilterOpen(false);
                }}
              >
                Discard
              </button>
            </div>
            <p>
              Source, currency, and status filters are evaluated by the server. A filter that does
              not apply to a selected measure is called out in that report.
            </p>
          </div>
        )}
      </div>
      <div className="analytics-filter-chips">
        {queryLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="analytics-layout">
        <aside className="analytics-sidebar" aria-label="Analytics navigation">
          <button
            className={section === 'dashboard' ? 'selected' : ''}
            onClick={() => navigate?.('dashboard')}
          >
            Dashboards
          </button>
          {activeDashboard && (
            <button className="analytics-subnav" onClick={() => navigate?.('dashboard')}>
              {activeDashboard.name}
            </button>
          )}
          <h3>FAVORITES</h3>
          {favorite && (
            <button className="selected" onClick={() => navigate?.('dashboard')}>
              {activeDashboard?.name || 'Overview'}
            </button>
          )}
          <h3>REPORTING</h3>
          <button
            className={section === 'reporting' ? 'selected' : ''}
            onClick={() => {
              setReportView('graph');
              navigate?.('reporting');
            }}
          >
            Graph Analysis
          </button>
          <button
            className={section === 'explore' ? 'selected' : ''}
            onClick={() => navigate?.('explore')}
          >
            Pivot & Explore
          </button>
          <h3>MANAGE</h3>
          <button
            className={section === 'saved-dashboards' ? 'selected' : ''}
            onClick={() => navigate?.('saved-dashboards')}
          >
            Saved Dashboards
          </button>
          <button
            className={section === 'coverage' ? 'selected' : ''}
            onClick={() => navigate?.('coverage')}
          >
            Data Quality
          </button>
          <button
            className={section === 'configuration' ? 'selected' : ''}
            onClick={() => navigate?.('configuration')}
          >
            Configuration
          </button>
          <button
            className={section === 'Intelligence' ? 'selected' : ''}
            onClick={() => navigate?.('Intelligence')}
          >
            Financial Patterns
          </button>
        </aside>
        <main className="analytics-main">
          {(loading || Object.keys(loadErrors).length > 0) && (
            <div className="analytics-load-status">
              {loading && <p role="status">Loading authorized analytics sources…</p>}
              {Object.entries(loadErrors).map(([key, message]) => (
                <p className="alert error" role="alert" key={key}>
                  {key}: {message}{' '}
                  <button
                    className="quiet-button"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Retry
                  </button>
                </p>
              ))}
            </div>
          )}
          {builder ? (
            <section className="analytics-builder">
              <header className="analytics-page-heading">
                <div>
                  <p>Dashboard Builder</p>
                  <h1>{draftName || 'New Dashboard'}</h1>
                </div>
                <div>
                  <button className="secondary-button" onClick={() => setBuilder(false)}>
                    Cancel
                  </button>
                  <button
                    className="button"
                    disabled={builderBusy || !draftName.trim()}
                    onClick={() => void saveDashboard()}
                  >
                    {builderBusy ? 'Saving…' : 'Save Dashboard'}
                  </button>
                </div>
              </header>
              <div className="analytics-builder-body">
                <section className="analytics-builder-preview">
                  <div className="analytics-preview-toolbar">
                    <span>Live preview</span>
                    <span>
                      {draftFilters.from || 'Last 90 days'} – {draftFilters.to || today}
                    </span>
                  </div>
                  {builderPreviewError && <p className="alert error">{builderPreviewError}</p>}
                      {builderPreview?.excluded_by_source_filter && (
                        <p className="analytics-excluded">Excluded by the selected record-source filter.</p>
                      )}
                  {builderPreview && !builderPreview.excluded_by_source_filter ? (
                    <>
                      <h2>{selectedWidget?.title || builderPreview.label}</h2>
                      {selectedWidget?.chart === 'kpi' ? (
                        <strong className="analytics-widget-value">
                          {selectedWidget?.metric.startsWith('financial.')
                            ? money(builderPreview.value, draftFilters.currency)
                            : builderPreview.value}
                        </strong>
                      ) : selectedWidget?.chart === 'line' &&
                        ['day', 'month'].includes(selectedWidget.group_by) ? (
                        <InteractiveChart
                          title={builderPreview.label}
                          points={(builderPreview.rows || []).map((row: any) => ({
                            date: selectedWidget.group_by === 'month' ? `${row.key}-01` : row.key,
                            value: Number(row.value),
                          }))}
                          series={[
                            {
                              key: 'value',
                              label: builderPreview.label,
                              color: selectedWidget.color || '#52a6e8',
                            },
                          ]}
                          description={builderPreview.definition}
                        />
                      ) : selectedWidget?.chart === 'pie' ? (
                        <div className="analytics-pie-wrap">
                          <div
                            className="analytics-pie"
                            style={{ background: pieGradient(builderPreview.rows || []) }}
                          >
                            <span>{Number(builderPreview.value || 0).toLocaleString('en-KE')}</span>
                          </div>
                          <div className="analytics-pie-legend">
                            {(builderPreview.rows || []).map((row: any, index: number) => (
                              <span key={row.key}>
                                <i style={{ background: pieColor(index) }} />
                                {row.label} <b>{Number(row.value).toLocaleString('en-KE')}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : selectedWidget?.chart === 'table' ? (
                        <ReportTable rows={builderPreview.rows || []} group={selectedWidget.group_by} />
                      ) : (
                        <BarChart
                          title={`${builderPreview.label} · ${groupLabels[selectedWidget?.group_by || 'month']}`}
                          rows={(builderPreview.rows || []).map((row: any) => ({
                            key: row.key,
                            label: row.label,
                            value: Number(row.value),
                          }))}
                          color={selectedWidget?.color || '#426900'}
                        />
                      )}
                    </>
                  ) : (
                    <p>Select an authorized data source to preview its results.</p>
                  )}
                </section>
                <aside className="analytics-builder-config">
                  <h2>Chart</h2>
                  <nav>
                    <button
                      className={builderTab === 'configuration' ? 'selected' : ''}
                      onClick={() => setBuilderTab('configuration')}
                    >
                      Configuration
                    </button>
                    <button
                      className={builderTab === 'design' ? 'selected' : ''}
                      onClick={() => setBuilderTab('design')}
                    >
                      Design
                    </button>
                  </nav>
                  {builderTab === 'configuration' ? (
                    <>
                      <Field label="Dashboard name">
                        <input
                          value={draftName}
                          maxLength={120}
                          onChange={(event) => setDraftName(event.target.value)}
                        />
                      </Field>
                      <Field label="Date range">
                        <select
                          value={draftFilters.range === 'all' ? 'all' : '90'}
                          onChange={(event) =>
                            setDraftFilters((current) =>
                              event.target.value === 'all'
                                ? { currency: current.currency, range: 'all' }
                                : {
                                    ...current,
                                    range: undefined,
                                    from: shiftDate(today, -89),
                                    to: today,
                                  },
                            )
                          }
                        >
                          <option value="90">Last 90 Days</option>
                          <option value="all">All History</option>
                        </select>
                      </Field>
                      <Field label="Currency">
                        <select
                          value={draftFilters.currency || 'KES'}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              currency: event.target.value,
                            }))
                          }
                        >
                          {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((currency) => (
                            <option key={currency}>{currency}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Record source">
                        <select
                          value={draftFilters.source || ''}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              source: (event.target.value || undefined) as Source | undefined,
                              status: undefined,
                            }))
                          }
                        >
                          <option value="">All authorized sources</option>
                          {availableSources.map((source) => (
                            <option key={source} value={source}>
                              {registry?.sources?.[source]?.label || source}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Status">
                        <select
                          value={draftFilters.status || ''}
                          disabled={!draftFilters.source || !statusOptionsFor(draftFilters.source, registry).length}
                          onChange={(event) =>
                            setDraftFilters((current) => ({
                              ...current,
                              status: event.target.value || undefined,
                            }))
                          }
                        >
                          <option value="">{draftFilters.source ? 'All statuses' : 'Choose a source first'}</option>
                          {statusOptionsFor(draftFilters.source, registry).map((status) => (
                            <option key={status} value={status}>
                              {status === '__unclassified__' ? 'Unclassified' : status}
                            </option>
                          ))}
                        </select>
                        {draftFilters.source && !statusOptionsFor(draftFilters.source, registry).length && (
                          <small>This source has no status dimension.</small>
                        )}
                      </Field>
                      <hr />
                      <h3>Data series</h3>
                      <Field label="Data source">
                        <select
                          value={widgetSource}
                          onChange={(event) => {
                            const source = event.target.value as Source,
                              metric = availableMetrics.find((entry: any) => entry.available && entry.source === source)?.id as Metric | undefined;
                            setWidgetSource(source);
                            if (metric) setWidgetMetric(metric);
                          }}
                        >
                          {availableSources.map((source) => (
                            <option key={source} value={source}>{registry?.sources?.[source]?.label || source}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Add a metric">
                        <select
                          value={widgetMetric}
                          onChange={(event) => setWidgetMetric(event.target.value as Metric)}
                        >
                          {availableMetrics
                            .filter((entry: any) => entry.available && entry.source === widgetSource)
                            .map((entry: any) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.label}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Group by">
                        <select
                          value={widgetGroup}
                          onChange={(event) => setWidgetGroup(event.target.value as Group)}
                        >
                          {(selectedWidgetMetric?.groups || ['month']).map((group: Group) => (
                            <option key={group} value={group}>
                              {groupLabels[group]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Chart type">
                        <select
                          value={widgetChart}
                          onChange={(event) =>
                            setWidgetChart(event.target.value as Widget['chart'])
                          }
                        >
                          {(selectedWidgetMetric?.allowed_charts || ['kpi', 'line', 'bar', 'pie', 'table'])
                            .filter((chart: string) => chart in chartLabels && (chart !== 'line' || ['day', 'month'].includes(widgetGroup)))
                            .map((chart: Widget['chart']) => (
                              <option value={chart} key={chart}>{chartLabels[chart]}</option>
                            ))}
                        </select>
                      </Field>
                      <button className="secondary-button" onClick={addWidget}>
                        Add to dashboard
                      </button>
                      <hr />
                      <h3>Dashboard widgets</h3>
                      {draftWidgets.map((widget, index) => (
                        <div
                          className={`analytics-widget-edit ${selectedWidgetId === widget.id ? 'selected' : ''}`}
                          key={widget.id}
                        >
                          <Field label="Data source">
                            <select
                              value={availableMetrics.find((entry: any) => entry.id === widget.metric)?.source || ''}
                              onFocus={() => setSelectedWidgetId(widget.id)}
                              onChange={(event) => {
                                const metric = availableMetrics.find((entry: any) => entry.available && entry.source === event.target.value)?.id as Metric | undefined;
                                if (metric) selectMetricForWidget(widget.id, metric);
                              }}
                            >
                              {availableSources.map((source) => (
                                <option key={source} value={source}>{registry?.sources?.[source]?.label || source}</option>
                              ))}
                            </select>
                          </Field>
                          <button
                            className="quiet-button analytics-widget-select"
                            onClick={() => setSelectedWidgetId(widget.id)}
                          >
                            {widget.title}
                          </button>
                          <Field label={`Title ${index + 1}`}>
                            <input
                              value={widget.title}
                              onFocus={() => setSelectedWidgetId(widget.id)}
                              onChange={(event) =>
                                setDraftWidgets((current) =>
                                  current.map((item) =>
                                    item.id === widget.id
                                      ? { ...item, title: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field label="Metric">
                            <select
                              value={widget.metric}
                              onFocus={() => setSelectedWidgetId(widget.id)}
                              onChange={(event) => selectMetricForWidget(widget.id, event.target.value as Metric)}
                            >
                              {availableMetrics
                                .filter((entry: any) => entry.available && entry.source === (availableMetrics.find((entry: any) => entry.id === widget.metric)?.source || 'orders'))
                                .map((entry: any) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.label}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <Field label="Group by">
                            <select
                              value={widget.group_by}
                              onFocus={() => setSelectedWidgetId(widget.id)}
                              onChange={(event) =>
                                setDraftWidgets((current) =>
                                  current.map((item) =>
                                    item.id === widget.id
                                      ? { ...item, group_by: event.target.value as Group }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {(
                                availableMetrics.find((entry: any) => entry.id === widget.metric)
                                  ?.groups || []
                              ).map((group: Group) => (
                                <option key={group} value={group}>
                                  {groupLabels[group]}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Chart type">
                            <select
                              value={widget.chart}
                              onFocus={() => setSelectedWidgetId(widget.id)}
                              onChange={(event) =>
                                setDraftWidgets((current) =>
                                  current.map((item) =>
                                    item.id === widget.id
                                      ? { ...item, chart: event.target.value as Widget['chart'] }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {(availableMetrics.find((entry: any) => entry.id === widget.metric)?.allowed_charts || ['kpi', 'line', 'bar', 'pie', 'table'])
                                .filter((chart: string) => ['kpi', 'line', 'bar', 'pie', 'table'].includes(chart))
                                .map((chart: Widget['chart']) => (
                                <option key={chart} value={chart}>{chartLabels[chart]}</option>
                                ))}
                            </select>
                          </Field>
                          <div>
                            <button
                              className="quiet-button"
                              disabled={!index}
                              onClick={() =>
                                setDraftWidgets((current) => moveWidget(current, index, -1))
                              }
                            >
                              ↑
                            </button>
                            <button
                              className="quiet-button"
                              disabled={index === draftWidgets.length - 1}
                              onClick={() =>
                                setDraftWidgets((current) => moveWidget(current, index, 1))
                              }
                            >
                              ↓
                            </button>
                            <button
                              className="quiet-button"
                              onClick={() => {
                                const remaining = draftWidgets.filter(
                                  (item) => item.id !== widget.id,
                                );
                                setDraftWidgets(remaining);
                                if (selectedWidgetId === widget.id)
                                  setSelectedWidgetId(remaining[0]?.id || '');
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <p>
                        Style the selected series. Layout and color apply to the saved dashboard
                        preview and chart.
                      </p>
                      {selectedWidget ? (
                        <>
                          <h3>{selectedWidget.title}</h3>
                          <Field label="Chart color">
                            <select
                              value={selectedWidget.color || '#52a6e8'}
                              onChange={(event) =>
                                setDraftWidgets((current) =>
                                  current.map((item) =>
                                    item.id === selectedWidget.id
                                      ? { ...item, color: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {palette.map((color) => (
                                <option value={color} key={color}>
                                  {color}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Widget width">
                            <select
                              value={selectedWidget.span || 'normal'}
                              onChange={(event) =>
                                setDraftWidgets((current) =>
                                  current.map((item) =>
                                    item.id === selectedWidget.id
                                      ? { ...item, span: event.target.value as 'normal' | 'wide' }
                                      : item,
                                  ),
                                )
                              }
                            >
                              <option value="normal">Half width</option>
                              <option value="wide">Full width</option>
                            </select>
                          </Field>
                          <div className="analytics-design-swatch">
                            <span style={{ backgroundColor: selectedWidget.color || '#52a6e8' }} />
                            {selectedWidget.chart} preview color
                          </div>
                        </>
                      ) : (
                        <p>Add a widget to configure its design.</p>
                      )}
                    </>
                  )}
                </aside>
              </div>
            </section>
          ) : section === 'reporting' || section === 'explore' ? (
            <>
              <header className="analytics-page-heading">
                <div>
                  <p>{section === 'reporting' ? 'Reporting' : 'Explore'}</p>
                  <h1>{section === 'reporting' ? 'Graph Analysis' : 'Pivot Analysis'}</h1>
                </div>
                <div className="analytics-view-switch">
                  <button
                    className={reportView === 'graph' ? 'selected' : ''}
                    onClick={() => {
                      setReportView('graph');
                      navigate?.('reporting');
                    }}
                  >
                    Graph
                  </button>
                <button
                  disabled={!selectedMetric?.allowed_charts?.includes('pivot')}
                    className={reportView === 'pivot' ? 'selected' : ''}
                    onClick={() => {
                      setReportView('pivot');
                      navigate?.('explore');
                    }}
                  >
                    Pivot
                  </button>
                  <button
                    className={reportView === 'table' ? 'selected' : ''}
                    onClick={() => setReportView('table')}
                  >
                    List
                  </button>
                </div>
              </header>
              <div className="analytics-report-toolbar">
                <Field label="Measure">
                  <select
                    value={reportMetric}
                    onChange={(event) => setReportMetric(event.target.value as Metric)}
                  >
                    {availableMetrics
                      .filter((entry: any) => entry.available)
                      .map((entry: any) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                  </select>
                </Field>
                {reportView !== 'pivot' && (selectedMetric?.groups?.length || 0) > 1 && (
                  <Field label="Group by">
                    <select
                      value={reportGroup}
                      onChange={(event) => setReportGroup(event.target.value as Group)}
                    >
                      {(selectedMetric?.groups || ['month']).map((group: Group) => (
                        <option key={group} value={group}>
                          {groupLabels[group]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {reportView === 'graph' && (
                  <Field label="Chart">
                    <select
                      value={reportChart}
                      onChange={(event) => setReportChart(event.target.value as any)}
                    >
                      {(selectedMetric?.allowed_charts || ['line', 'bar', 'pie', 'table'])
                        .filter((chart: string) => ['kpi', 'line', 'bar', 'pie', 'table'].includes(chart) && (chart !== 'line' || ['day', 'month'].includes(reportGroup)))
                        .map((chart: any) => <option value={chart} key={chart}>{chartLabels[chart as Widget['chart']]}</option>)}
                    </select>
                  </Field>
                )}
                <button className="secondary-button" onClick={() => void exportReport()}>
                  Export CSV
                </button>
                <Field label="Saved exploration name">
                  <input
                    value={reportName}
                    onChange={(event) => setReportName(event.target.value)}
                    placeholder={`${metricNames[reportMetric]} report`}
                    minLength={2}
                    maxLength={120}
                  />
                </Field>
                <button
                  className="secondary-button"
                  disabled={reportSaving || reportName.trim().length < 2}
                  onClick={() => void saveExploration()}
                >
                  {reportSaving ? 'Saving…' : 'Save exploration'}
                </button>
              </div>
              {reportSaveError && <p role="alert" className="alert error">{reportSaveError}</p>}
          {reportView === 'pivot' && !selectedMetric?.allowed_charts?.includes('pivot') ? (
            <section className="panel"><h2>Pivot unavailable for this measure</h2><p>This source provides a snapshot measure without compatible historical dimensions. Choose an authorized operational measure to build a pivot.</p></section>
          ) : reportView === 'pivot' ? (
                <>
                  <div className="analytics-pivot-toolbar">
                    <Field label="Rows">
                      <select
                        value={pivotRows}
                        onChange={(event) => setPivotRows(event.target.value as Group)}
                      >
                        {(selectedMetric?.groups || []).filter((group: Group) => group !== pivotColumns).map((group: Group) => (
                          <option key={group}>{group}</option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="secondary-button"
                      aria-label="Swap pivot axes"
                      onClick={() => {
                        setPivotRows(pivotColumns);
                        setPivotColumns(pivotRows);
                      }}
                    >
                      ⇄ Swap axes
                    </button>
                    <Field label="Columns">
                      <select
                        value={pivotColumns}
                        onChange={(event) => setPivotColumns(event.target.value as Group)}
                      >
                        {(selectedMetric?.groups || []).filter((group: Group) => group !== pivotRows).map((group: Group) => (
                          <option key={group}>{group}</option>
                        ))}
                      </select>
                    </Field>
                    <button className="secondary-button" onClick={() => void exportPivot()}>
                      Export pivot CSV
                    </button>
                  </div>
                  {loadErrors.pivot && (
                    <p role="alert" className="alert error">
                      {loadErrors.pivot}
                    </p>
                  )}
                  {!pivotData && <p role="status">Loading pivot aggregates…</p>}
                  {pivotData?.excluded_by_source_filter ? (
                    <p className="analytics-excluded">Excluded by the selected record-source filter.</p>
                  ) : pivotData && (
                    <div className="analytics-pivot-scroll">
                      <DataTable>
                        <thead>
                          <tr>
                            <th>{groupLabels[pivotData.row_by as Group]}</th>
                            {pivotData.columns.map((column: string) => (
                              <th key={column}>{column}</th>
                            ))}
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pivotData.rows.map((row: any) => (
                            <Fragment key={row.key}>
                              <tr>
                                <th>
                                  {pivotRows === 'month' && pivotColumns !== 'day' && (
                                    <button
                                      className="analytics-pivot-expand"
                                      aria-label={pivotExpanded[row.key] ? `Collapse ${row.label}` : `Expand ${row.label} by day`}
                                      aria-expanded={!!pivotExpanded[row.key]}
                                      onClick={() => void togglePivotMonth(row.key)}
                                    >
                                      {pivotExpanded[row.key] ? '−' : '+'}
                                    </button>
                                  )}
                                  {row.label}
                                </th>
                                {pivotData.columns.map((column: string) => (
                                  <td key={column}>
                                    {['orders.count', 'customers.count'].includes(reportMetric) && pivotRows !== 'currency' && pivotColumns !== 'currency' ? (
                                      <button className="analytics-pivot-cell" onClick={() => inspectPivotCell(row.key, column)}>
                                        {Number(row.values[column] || 0).toLocaleString('en-KE')}
                                      </button>
                                    ) : Number(row.values[column] || 0).toLocaleString('en-KE')}
                                  </td>
                                ))}
                                <td>
                                  <strong>{row.total.toLocaleString('en-KE')}</strong>
                                </td>
                              </tr>
                              {pivotExpanded[row.key]?.rows?.map((child: any) => (
                                <tr className="analytics-pivot-child" key={`${row.key}-${child.key}`}>
                                  <th>↳ {child.label}</th>
                                  {pivotData.columns.map((column: string) => (
                                    <td key={column}>{Number(child.values[column] || 0).toLocaleString('en-KE')}</td>
                                  ))}
                                  <td><strong>{child.total.toLocaleString('en-KE')}</strong></td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                          <tr>
                            <th>Total</th>
                            {pivotData.columns.map((column: string) => (
                              <td key={column}>
                                <strong>
                                  {Number(pivotData.totals.columns[column] || 0).toLocaleString(
                                    'en-KE',
                                  )}
                                </strong>
                              </td>
                            ))}
                            <td>
                              <strong>{pivotData.totals.overall.toLocaleString('en-KE')}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </DataTable>
                    </div>
                  )}
                </>
              ) : reportData?.excluded_by_source_filter ? (
                <section className="panel analytics-excluded" role="status">
                  <h2>Measure excluded by filter</h2>
                  <p>{reportData.definition}</p>
                  {!!reportData.ignored_filters?.length && (
                    <p className="analytics-filter-note">
                      These filters do not apply to this measure: {reportData.ignored_filters.join(', ')}.
                    </p>
                  )}
                </section>
              ) : reportView === 'table' || reportChart === 'table' ? (
              <ReportTable
                  rows={reportRows.slice(reportPage * 25, reportPage * 25 + 25)}
                  group={reportGroup}
                onInspect={reportData?.drilldown ? inspectReportRow : undefined}
                />
              ) : !reportData ? (
                <p role="status">Loading authorized aggregate…</p>
              ) : (
                <section className="analytics-report-chart panel">
                  <h2>
                    {reportData.label} by {groupLabels[reportGroup].toLowerCase()}
                  </h2>
                  <p>{reportData.definition}</p>
                  {reportChart === 'kpi' ? (
                    <MetricCard
                      label={reportData.label}
                      value={selectedMetric?.unit === 'records' || selectedMetric?.unit === 'products'
                        ? Number(reportData.value || 0).toLocaleString('en-KE')
                        : money(Number(reportData.value || 0), query.currency)}
                      tint={0}
                      source={reportData.source}
                      period={reportMetric === 'inventory.low_stock'
                        ? `As of ${reportData.refreshed_at}`
                        : `${reportData.period.from} – ${reportData.period.to}`}
                      currency={reportData.currency || undefined}
                      definition={reportData.definition}
                      coverage={reportData.coverage}
                      refreshedAt={reportData.refreshed_at}
                    />
                  ) : reportChart === 'line' && ['day', 'month'].includes(reportGroup) ? (
                    <InteractiveChart
                      title={reportData.label}
                      points={reportRows.map((row: any) => ({
                        date: reportGroup === 'month' ? `${row.key}-01` : row.key,
                        value: row.value,
                      }))}
                      series={[{ key: 'value', label: reportData.label, color: '#52a6e8' }]}
                      description={reportData.definition}
                      onPointSelect={reportData.drilldown ? (point: any) =>
                        inspectReportRow(
                          reportRows.find(
                            (row: any) =>
                              (reportGroup === 'month' ? `${row.key}-01` : row.key) === point.date,
                          ),
                        ) : undefined}
                    />
                  ) : reportChart === 'pie' ? (
                    <div className="analytics-pie-wrap">
                      <div
                        className="analytics-pie"
                        style={{ background: pieGradient(reportRows) }}
                      >
                        <span>{Number(reportData.value || 0).toLocaleString('en-KE')}</span>
                      </div>
                      <div className="analytics-pie-legend">
                        {reportRows.map((row: any, index: number) => (
                          <span key={row.key}>
                            <i style={{ background: pieColor(index) }} />
                            {row.drilldown ? (
                              <button className="analytics-pie-drill" onClick={() => inspectReportRow(row)}>
                                {row.label} <b>{Number(row.value).toLocaleString('en-KE')}</b>
                              </button>
                            ) : (
                              <>{row.label} <b>{Number(row.value).toLocaleString('en-KE')}</b></>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <BarChart
                      title={reportData.label}
                      rows={reportRows.map((row: any) => ({
                        key: row.key,
                        label: row.label,
                        value: Number(row.value),
                      }))}
                      onInspect={reportData.drilldown ? (key) =>
                        inspectReportRow(reportRows.find((row: any) => String(row.key) === key))
                      : undefined}
                    />
                  )}
                </section>
              )}
              <div className="analytics-report-pagination">
                <button
                  className="secondary-button"
                  disabled={reportPage === 0}
                  onClick={() => setReportPage((page) => page - 1)}
                >
                  Previous
                </button>
                <span>
                  {reportPage + 1} / {reportPages}
                </span>
                <button
                  className="secondary-button"
                  disabled={reportPage + 1 >= reportPages}
                  onClick={() => setReportPage((page) => page + 1)}
                >
                  Next
                </button>
              </div>
              {reportData?.definition && (
                <details className="analytics-definition panel">
                  <summary>Metric definition and source</summary>
                  <p>{reportData.definition}</p>
                  <p>
                    {reportData.period.from} – {reportData.period.to} · {reportData.timezone}
                  </p>
                </details>
              )}
            </>
          ) : section === 'coverage' ? (
            <>
              <header className="analytics-page-heading">
                <div>
                  <p>Source Health</p>
                  <h1>Data Quality</h1>
                </div>
              </header>
              <p className="panel">
                {data?.classification ||
                  'Authorized sources are evaluated separately. Missing sources are identified and never replaced with sample values.'}{' '}
                Time zone: {registry?.timezone || data?.timezone || 'Loading'}.
              </p>
              <div className="analytics-source-grid">
                {Object.entries(registry?.sources || {}).map(([key, value]: [string, any]) => (
                  <article className="panel" key={key}>
                    <div>
                      <h2>{value.label}</h2>
                      <span className={`analytics-source-status status-${value.status}`}>
                        {value.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p>{value.reason}</p>
                    <small>Source: {key} · Environment scoped</small>
                    {value.records !== null && (
                      <small>{Number(value.records).toLocaleString('en-KE')} records</small>
                    )}
                    {value.covered_from && value.covered_to && (
                      <small>
                        Observed records: {value.covered_from} – {value.covered_to} ({registry.timezone})
                      </small>
                    )}
                    {value.refreshed_at && <small>Checked: {value.refreshed_at}</small>}
                  </article>
                ))}
              </div>
              {data?.inventory && (
                <section className="panel analytics-quality-detail">
                  <h2>Inventory snapshot coverage</h2>
                  <p>
                    {data.inventory.covered_products} of {data.inventory.total_products} products
                    were included in the current snapshot.
                    {data.inventory.truncated ? ' The 1,000 product service limit truncated this snapshot.' : ' The current product set was fully covered.'}
                  </p>
                  <p>{data.inventory.valuation_note}</p>
                  <small>Snapshot refreshed: {data.refreshed_at}</small>
                </section>
              )}
              {data?.financial?.quality && (
                <section className="panel analytics-quality-detail">
                  <h2>Financial coverage and assurance</h2>
                  <p>{financeCoverage(data.financial)}</p>
                  <p>
                    {data.financial.quality.last_sync
                      ? `Last connector sync: ${data.financial.quality.last_sync}`
                      : 'No connector sync is recorded.'}
                    {' · '}
                    {data.financial.quality.source_count} synchronized source(s).
                  </p>
                  <p>
                    {data.financial.quality.missing_expense_data
                      ? 'No recorded outflows are present in this period; this does not establish zero operating expenses.'
                      : 'Recorded expense data is present for this period.'}
                    {' '}
                    Bank balance and profit are not available from this measure set.
                  </p>
                  {!!data.financial.quality.unknown_provider_occurrence_dates && (
                    <p>
                      {data.financial.quality.unknown_provider_occurrence_dates} provider event(s)
                      lack a confirmed occurrence date and use observed confirmation time.
                    </p>
                  )}
                  <small>Financial snapshot refreshed: {data.financial.refreshed_at}</small>
                </section>
              )}
              <section className="panel">
                <h2>Metric definitions</h2>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Source</th>
                      <th>Unit</th>
                      <th>Groups</th>
                      <th>Filters</th>
                      <th>Views</th>
                      <th>Access</th>
                      <th>Definition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableMetrics.map((metric: any) => (
                      <tr key={metric.id}>
                        <td>{metric.label}</td>
                        <td>{metric.source}</td>
                        <td>{metric.unit}</td>
                        <td>
                          {metric.groups.map((group: Group) => groupLabels[group]).join(', ') ||
                            'Summary'}
                        </td>
                        <td>{metric.filters.join(', ')}</td>
                        <td>{metric.allowed_charts.join(', ')}</td>
                        <td>
                          {metric.available ? 'Available' : 'Restricted / service setup required'}
                        </td>
                        <td>{metric.definition}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </section>
            </>
          ) : section === 'configuration' ? (
            <>
              <header className="analytics-page-heading">
                <div>
                  <p>Configuration</p>
                  <h1>Dashboard Defaults</h1>
                </div>
              </header>
              <section className="panel analytics-config-panel">
                <p>
                  These settings are stored with each private workspace dashboard. They do not grant
                  access to restricted data sources.
                </p>
                <Field label="Default date range">
                  <select
                    value={draftFilters.range === 'all' ? 'all' : '90'}
                    onChange={(event) =>
                      setDraftFilters((current) =>
                        event.target.value === 'all'
                          ? { currency: current.currency, range: 'all' }
                          : {
                              ...current,
                              range: undefined,
                              from: shiftDate(today, -89),
                              to: today,
                            },
                      )
                    }
                  >
                    <option value="90">Last 90 Days</option>
                    <option value="all">All History</option>
                  </select>
                </Field>
                <Field label="Reporting currency">
                  <select
                    value={draftFilters.currency || 'KES'}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, currency: event.target.value }))
                    }
                  >
                    {['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF'].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </Field>
                <button
                  className="button"
                  disabled={!manager || !activeDashboard}
                  onClick={() =>
                    activeDashboard &&
                    void (async () => {
                      await api(`/business/analytics/dashboards/${activeDashboard.id}`, 'PATCH', {
                        expected_version: activeDashboard.version,
                        name: activeDashboard.name,
                        configuration: {
                          filters: draftFilters,
                          widgets: activeDashboard.configuration.widgets,
                        },
                      });
                      setRevision((value) => value + 1);
                    })()
                  }
                >
                  {activeDashboard
                    ? 'Save defaults to selected dashboard'
                    : 'Select a saved dashboard first'}
                </button>
                {!manager && (
                  <p>Your role can view workspace defaults but cannot change dashboards.</p>
                )}
              </section>
            </>
          ) : section === 'saved-dashboards' ? (
            <>
              <header className="analytics-page-heading">
                <div>
                  <p>Dashboards</p>
                  <h1>Saved Dashboards</h1>
                </div>
                {manager && (
                  <button className="button" onClick={() => setCreateOpen(true)}>
                    New Dashboard
                  </button>
                )}
              </header>
              <div className="analytics-saved-grid">
                {dashboards.map((dashboard) => (
                  <article className="panel" key={dashboard.id}>
                    <h2>{dashboard.name}</h2>
                    <p>
                      {dashboard.configuration.widgets.length} widgets · Updated{' '}
                      {new Date(dashboard.updated_at).toLocaleDateString()}
                    </p>
                    <div>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setActiveDashboardId(dashboard.id);
                          navigate?.('dashboard');
                        }}
                      >
                        Open
                      </button>
                      {manager && (
                        <button className="secondary-button" onClick={() => openBuilder(dashboard)}>
                          Edit
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!dashboards.length && <p className="panel">No saved dashboards yet.</p>}
              </div>
            </>
          ) : section === 'saved-reports' ? (
            <SavedViews
              api={api}
              query={query}
              saved={savedReports}
            exploration={{
              metric: reportMetric,
              group_by: reportGroup,
              chart: reportChart,
              view: reportView,
              source: (selectedMetric?.source || 'orders') as Source,
                ...(reportView === 'pivot' ? { row_by: pivotRows, column_by: pivotColumns } : {}),
            }}
              onRefresh={() => setRevision((value) => value + 1)}
            onLoad={(configuration) => {
              setQuery(configuration.query);
              if (configuration.exploration) {
                setReportMetric(configuration.exploration.metric);
                setReportGroup(configuration.exploration.group_by);
                setReportChart(configuration.exploration.chart);
                setReportView(configuration.exploration.view);
                  if (configuration.exploration.row_by) setPivotRows(configuration.exploration.row_by);
                  if (configuration.exploration.column_by) setPivotColumns(configuration.exploration.column_by);
                navigate?.(configuration.exploration.view === 'pivot' ? 'explore' : 'reporting');
              }
            }}
            />
          ) : section === 'Intelligence' ? (
            <>
              <header className="analytics-page-heading">
                <div>
                  <p>Finance</p>
                  <h1>Financial Patterns</h1>
                </div>
              </header>
              {data?.financial ? (
                <>
                  <div className="analytics-kpis">
                    {[
                      ['Confirmed collections', data.financial.totals.confirmed_inflows_minor, data.financial.definitions.confirmed_inflows],
                      ['Recorded expenses', data.financial.totals.recorded_outflows_minor, data.financial.definitions.recorded_outflows],
                      ['Net movement', data.financial.totals.net_movement_minor, data.financial.definitions.net_movement],
                      ['Outstanding receivables', data.financial.totals.outstanding_minor, data.financial.definitions.receivables],
                    ].map(([label, value, definition], index) => (
                      <MetricCard
                        key={String(label)}
                        label={String(label)}
                        value={money(Number(value), query.currency)}
                        tint={index}
                        source="Finance"
                        period={`${data.financial.period.from} – ${data.financial.period.to}`}
                        currency={data.financial.currency}
                        definition={String(definition)}
                        coverage={financeCoverage(data.financial)}
                        refreshedAt={data.financial.refreshed_at}
                      />
                    ))}
                  </div>
                  <p className="panel">
                    {data.financial.definitions.net_movement ||
                      'Authorized canonical financial snapshot. Net movement is not profit or cash balance.'}
                  </p>
                </>
              ) : (
                <p className="panel">
                  Financial patterns require a permitted finance role and the Intelligence service.
                </p>
              )}
            </>
          ) : (
            <>
              <header className="analytics-dashboard-heading">
                <div>
                  <p>Dashboards</p>
                  <h1>
                    {activeDashboard?.name ||
                      (kind === 'personal' ? 'Personal Overview' : 'Business Overview')}
                  </h1>
                </div>
                <div className="analytics-dashboard-actions">
                  <select
                    aria-label="Choose dashboard"
                    value={activeDashboardId}
                    onChange={(event) => setActiveDashboardId(event.target.value)}
                  >
                    <option value="">
                      {kind === 'personal' ? 'Personal Overview' : 'Business Overview'}
                    </option>
                    {dashboards.map((dashboard) => (
                      <option key={dashboard.id} value={dashboard.id}>
                        {dashboard.name}
                      </option>
                    ))}
                  </select>
                  {manager && activeDashboard && (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => openBuilder(activeDashboard)}
                      >
                        Edit
                      </button>
                      <button className="quiet-button" onClick={() => void duplicateDashboard()}>
                        Duplicate
                      </button>
                      <button className="quiet-button" onClick={() => void removeDashboard()}>
                        Delete
                      </button>
                    </>
                  )}
                  {manager && activeDashboard && (
                    <button className="quiet-button" onClick={() => void exportDashboard()}>
                      Export CSV
                    </button>
                  )}
                </div>
              </header>
              {data && (
                <>
                  <div className="analytics-kpis">
                    {data.financial && (
                      <MetricCard
                        label="Confirmed collections"
                        value={money(data.financial.totals.confirmed_inflows_minor, data.currency)}
                        tint={0}
                        source="Finance"
                        period={`${data.period.from} – ${data.period.to}`}
                        currency={data.currency}
                        definition={data.financial.definitions.confirmed_inflows}
                        coverage={financeCoverage(data.financial)}
                        refreshedAt={data.financial.refreshed_at}
                      />
                    )}
                    {data.financial && (
                      <MetricCard
                        label="Net movement"
                        value={money(data.financial.totals.net_movement_minor, data.currency)}
                        tint={1}
                        source="Finance"
                        period={`${data.period.from} – ${data.period.to}`}
                        currency={data.currency}
                        definition={data.financial.definitions.net_movement}
                        coverage={financeCoverage(data.financial)}
                        refreshedAt={data.financial.refreshed_at}
                      />
                    )}
                    {data.sources?.orders && (!query.source || query.source === 'orders') && (
                      <MetricCard
                        label="Orders created"
                        value={summary.orders.toLocaleString('en-KE')}
                        tint={2}
                        source="Orders"
                        period={`${data.period.from} – ${data.period.to}`}
                        definition="Canonical order records created in the selected local-date window; not revenue."
                        refreshedAt={data.refreshed_at}
                        coverage={`${registry?.sources?.orders?.records ?? 'Unknown'} records in this environment`}
                      />
                    )}
                    {data.sources?.customers && (!query.source || query.source === 'customers') && (
                      <MetricCard
                        label="Customers created"
                        value={summary.customers.toLocaleString('en-KE')}
                        tint={3}
                        source="Customers"
                        period={`${data.period.from} – ${data.period.to}`}
                        definition="Canonical customer records created in the selected local-date window."
                        refreshedAt={data.refreshed_at}
                        coverage={`${registry?.sources?.customers?.records ?? 'Unknown'} records in this environment`}
                      />
                    )}
                    {data.financial && (
                      <MetricCard
                        label="Recorded outflows"
                        value={money(data.financial.totals.recorded_outflows_minor, data.currency)}
                        tint={4}
                        source="Finance"
                        period={`${data.period.from} – ${data.period.to}`}
                        currency={data.currency}
                        definition={data.financial.definitions.recorded_outflows}
                        coverage={financeCoverage(data.financial)}
                        refreshedAt={data.financial.refreshed_at}
                      />
                    )}
                    {data.financial && (
                      <MetricCard
                        label="Outstanding receivables"
                        value={money(data.financial.totals.outstanding_minor, data.currency)}
                        tint={5}
                        source="Finance"
                        period={`${data.period.from} – ${data.period.to}`}
                        currency={data.currency}
                        definition={data.financial.definitions.receivables}
                        coverage={financeCoverage(data.financial)}
                        refreshedAt={data.financial.refreshed_at}
                      />
                    )}
                  </div>
                  <section className="analytics-primary-chart panel">
                    <div className="analytics-section-title">
                      <h2>Activity by Date</h2>
                      <span>
                        {data.period.from} — {data.period.to}
                      </span>
                    </div>
                    {activitySeries.length ? (
                      <>
                        {!query.source && activitySeries.length > 1 && (
                          <Field label="Drill into">
                            <select
                              value={activityDrillKind}
                              onChange={(event) => setActivityDrillKind(event.target.value as 'orders' | 'customers')}
                            >
                              <option value="orders">Orders</option>
                              <option value="customers">Customers</option>
                            </select>
                          </Field>
                        )}
                        <InteractiveChart
                          compact
                          title={activitySeries.map((series) => series.label).join(' and ') + ' created'}
                          points={activityPoints}
                          series={activitySeries}
                          description={`Canonical record creation counts by local workspace date (${data.timezone}). Counts are not revenue.`}
                          onPointSelect={(point: any) => {
                            const selected = query.source === 'customers' || (!query.source && activityDrillKind === 'customers')
                              ? 'customers'
                              : 'orders';
                            void inspect({ kind: selected, date: point.date });
                          }}
                        />
                      </>
                    ) : (
                      <p className="analytics-excluded">
                        Creation trends are available for Orders and Customers. The selected source has no compatible time-series measure.
                      </p>
                    )}
                    <footer>Values come from authorized saved records · {data.timezone}</footer>
                  </section>
                  <div className="analytics-lower-grid">
                    <section className="analytics-panel panel">
                      <div className="analytics-section-title">
                        <h2>Orders by Status</h2>
                        <button className="quiet-button" onClick={() => navigate?.('reporting')}>
                          Open report
                        </button>
                      </div>
                      {data.orders ? (
                        <BarChart
                          title="Orders created in the selected period"
                          rows={data.orders.map((row: any) => ({
                            key: row.status === null ? '__unclassified__' : row.status || 'empty',
                            label: row.status || 'Unclassified',
                            value: Number(row.count),
                          }))}
                          onInspect={(key) =>
                            void inspect({
                              kind: 'orders',
                              status: key === '__unclassified__' ? '__unclassified__' : key,
                            })
                          }
                        />
                      ) : (
                        <p>Orders source is not available to this workspace.</p>
                      )}
                    </section>
                    <section className="analytics-panel panel">
                      <div className="analytics-section-title">
                        <h2>Data Sources</h2>
                        <button className="quiet-button" onClick={() => navigate?.('coverage')}>
                          Data quality
                        </button>
                      </div>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Source</th>
                            <th>Availability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(registry?.sources || {}).map(
                            ([key, value]: [string, any]) => (
                              <tr key={key}>
                                <td>{value.label}</td>
                                <td>{value.status.replaceAll('_', ' ')}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </DataTable>
                    </section>
                  </div>
                  {dashboardWidgets.length > 0 && (
                    <section className="analytics-widgets-section">
                      <div className="analytics-section-title">
                        <h2>Dashboard Widgets</h2>
                        <span>{dashboardWidgets.length} configured</span>
                      </div>
                      <div className="analytics-widget-grid">{searchResults.map(renderWidget)}</div>
                      {!searchResults.length && <p>No dashboard widgets match “{search}”.</p>}
                    </section>
                  )}
                  {!dashboardWidgets.length && (
                    <section className="panel">
                      <p>This dashboard has no widgets yet.</p>
                      {manager && (
                        <button className="button" onClick={() => openBuilder(activeDashboard)}>
                          Add widgets
                        </button>
                      )}
                    </section>
                  )}
                  {data.inventory && (
                    <section className="panel">
                      <h2>Inventory snapshot</h2>
                      <p>
                        {data.inventory.total_products} products · {data.inventory.low_stock} low
                        stock · {data.inventory.out_of_stock} out of stock.
                      </p>
                      <p>{data.inventory.valuation_note}</p>
                    </section>
                  )}
                </>
              )}
              {!data && !loading && (
                <section className="panel">
                  <h2>Dashboard sources unavailable</h2>
                  <p>Retry the authorized dashboard request or inspect source readiness.</p>
                  <button
                    className="secondary-button"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Retry
                  </button>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {createOpen && (
        <Overlay onClose={() => setCreateOpen(false)}>
          <section
            className="panel analytics-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analytics-create-title"
          >
            <header>
              <h2 id="analytics-create-title">Create a Dashboard or select a template</h2>
              <button
                className="quiet-button"
                aria-label="Close"
                onClick={() => setCreateOpen(false)}
              >
                ×
              </button>
            </header>
            <Field label="Dashboard name">
              <input
                value={draftName || ''}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="e.g. Sales Overview"
                maxLength={120}
              />
            </Field>
            <div className="analytics-template-grid">
              {[
                ['blank', 'Blank dashboard'],
                ['overview', 'Business overview'],
                ['sales', 'Sales dashboard'],
                ['finance', 'Finance summary'],
                ['customers', 'Customer activity'],
                ['inventory', 'Inventory movement'],
                ['automations', 'Automation activity'],
              ].map(([key, label]) => (
                <button
                  type="button"
                  className={template === key ? 'selected' : ''}
                  key={key}
                  onClick={() => {
                    setTemplate(key);
                    setDraftWidgets(templateWidgets(key, availableMetrics));
                    setDraftName(key === 'blank' ? 'New Dashboard' : `${label}`);
                  }}
                >
                  <span>
                    {key === 'blank'
                      ? '▦'
                      : key === 'sales'
                        ? '↗'
                        : key === 'finance'
                          ? '$'
                          : key === 'inventory'
                            ? '▤'
                            : '◷'}
                  </span>
                  <strong>{label}</strong>
                  <small>
                    {key === 'blank'
                      ? 'Start with no widgets'
                      : `${templateWidgets(key, availableMetrics).length} authorized measures`}
                  </small>
                </button>
              ))}
            </div>
            <footer>
              <button className="secondary-button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="button" onClick={() => openBuilder(null, template)}>
                Configure Dashboard
              </button>
            </footer>
          </section>
        </Overlay>
      )}
      {drill && (
        <Overlay onClose={closeDrill}>
          <section
            className="panel analytics-drill-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analytics-drill-title"
          >
            <header>
              <div>
                <p>Drill-down</p>
                <h2 id="analytics-drill-title">Matching {drill.filter.kind}</h2>
              </div>
              <button className="quiet-button" onClick={closeDrill}>
                Close
              </button>
            </header>
            {drill.loading && <p role="status">Loading authorized record headers…</p>}
            {drill.error && (
              <p className="alert error" role="alert">
                {drill.error}
              </p>
            )}
            {drill.data && (
              <>
                <p>{drill.data.definition}</p>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Current status</th>
                      <th>Created ({drill.data.timezone})</th>
                      <th>Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.data.data.map((record: any) => (
                      <tr key={record.id}>
                        <td>{record.name}</td>
                        <td>{record.status}</td>
                        <td>
                          {new Intl.DateTimeFormat('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: drill.data.timezone,
                          }).format(new Date(record.created_at))}
                        </td>
                        <td>
                          <button
                            className="secondary-button"
                            onClick={() => {
                              const tab = drill.data.kind === 'orders' ? 'Orders' : 'Customers';
                              closeDrill();
                              if (openRecord) openRecord(tab, record.id);
                              else navigate?.(tab);
                            }}
                          >
                            Open record
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                <div className="analytics-report-pagination">
                  <button
                    className="secondary-button"
                    disabled={!drill.data.offset}
                    onClick={() =>
                      void inspect({
                        ...drill.filter,
                        offset: Math.max(0, drill.data.offset - 100),
                      })
                    }
                  >
                    Previous
                  </button>
                  <span>{drill.data.total} matching records</span>
                  <button
                    className="secondary-button"
                    disabled={drill.data.offset + 100 >= drill.data.total}
                    onClick={() =>
                      void inspect({ ...drill.filter, offset: drill.data.offset + 100 })
                    }
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </section>
        </Overlay>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tint,
  source,
  period,
  currency,
  definition,
  coverage,
  refreshedAt,
}: {
  label: string;
  value: string;
  tint: number;
  source?: string;
  period?: string;
  currency?: string;
  definition?: string;
  coverage?: string;
  refreshedAt?: string;
}) {
  return (
    <article className={`analytics-kpi analytics-kpi-${tint}`}>
      <strong>{label}</strong>
      <span>{value}</span>
      <small>{period || 'Selected period'}{currency ? ` · ${currency}` : ''}</small>
      {(source || definition || coverage || refreshedAt) && (
        <details>
          <summary>Source & definition</summary>
          {source && <small>Source: {source}</small>}
          {definition && <small>{definition}</small>}
          {coverage && <small>Coverage: {coverage}</small>}
          {refreshedAt && <small>Refreshed: {refreshedAt}</small>}
        </details>
      )}
    </article>
  );
}
function ReportTable({
  rows,
  group,
  onInspect,
}: {
  rows: any[];
  group: Group;
  onInspect?: (row: any) => void;
}) {
  return (
    <section className="panel">
      <DataTable>
        <thead>
          <tr>
            <th>{groupLabels[group]}</th>
            <th>Value</th>
            {onInspect && <th>Inspect</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.value}</td>
              {onInspect && <td>
                {row.drilldown ? (
                  <button className="quiet-button" onClick={() => onInspect(row)}>
                    View records
                  </button>
                ) : (
                  '—'
                )}
              </td>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={onInspect ? 3 : 2}>No observations in the selected period.</td></tr>}
        </tbody>
      </DataTable>
    </section>
  );
}
function SavedViews({
  api,
  query,
  saved,
  exploration,
  onRefresh,
  onLoad,
}: {
  api: API;
  query: Query;
  saved: any[];
  exploration: {
    metric: Metric;
    group_by: Group;
    chart: Widget['chart'];
    view: 'graph' | 'pivot' | 'table';
    source: Source;
    row_by?: Group;
    column_by?: Group;
  };
  onRefresh: () => void;
  onLoad: (configuration: any) => void;
}) {
  const [error, setError] = useState(''),
    [name, setName] = useState('');
  async function save() {
    setError('');
    try {
      await api('/business/saved-reports', 'POST', {
        name,
        configuration: {
          query,
          widgets: [legacyWidgetForSource(exploration.source)],
          exploration,
        },
      });
      setName('');
      onRefresh();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <>
      <header className="analytics-page-heading">
        <div>
          <p>Reporting</p>
          <h1>Saved Report Views</h1>
        </div>
      </header>
      <section className="panel analytics-saved-views">
        <p>
          Legacy report views are kept separately and remain private to the creator, workspace, and
          environment.
        </p>
        <Field label="Report name">
          <input
            value={name}
            minLength={2}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <button className="button" disabled={name.trim().length < 2} onClick={() => void save()}>
          Save current exploration
        </button>
        {error && <p className="alert error">{error}</p>}
        <div className="analytics-saved-list">
          {saved.map((entry) => (
            <article key={entry.id}>
              <strong>{entry.name}</strong>
              <button className="quiet-button" onClick={() => onLoad(entry.configuration)}>
                Load view
              </button>
              <button
                className="quiet-button"
                onClick={() =>
                  void api('/business/saved-reports/' + entry.id, 'DELETE', {})
                    .then(onRefresh)
                    .catch((reason) => setError((reason as Error).message))
                }
              >
                Remove
              </button>
            </article>
          ))}
          {!saved.length && <p>No saved report views yet.</p>}
        </div>
      </section>
    </>
  );
}
function moveWidget(items: Widget[], index: number, direction: number) {
  const next = [...items],
    target = index + direction;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
function monthLastDay(month: string) {
  const [year, number] = month.split('-').map(Number), last = new Date(Date.UTC(year, number, 0));
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
}
function legacyWidgetForSource(source: Source): 'financial' | 'sales' | 'customers' | 'inventory' | 'automations' {
  if (source === 'financial') return 'financial';
  if (source === 'customers') return 'customers';
  if (source === 'inventory') return 'inventory';
  if (source === 'automations') return 'automations';
  return 'sales';
}
const palette = [
  '#52a6e8',
  '#e55a70',
  '#44bdab',
  '#f0a05a',
  '#8b73c8',
  '#e1c84c',
  '#657b91',
  '#ce74ac',
];
function pieColor(index: number) {
  return palette[index % palette.length];
}
function pieGradient(rows: any[]) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0);
  if (!total) return '#e5e7eb';
  let start = 0;
  const stops = rows.map((row, index) => {
    const end = start + (Math.max(0, Number(row.value || 0)) / total) * 100,
      stop = `${pieColor(index)} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return stop;
  });
  return `conic-gradient(${stops.join(',')})`;
}
