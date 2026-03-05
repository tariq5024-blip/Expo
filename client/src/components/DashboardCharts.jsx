import Chart from 'react-apexcharts';
import PropTypes from 'prop-types';
import { 
  Box, 
  CheckCircle, 
  LayoutGrid, 
  Trash2,
  TrendingUp,
  AlertCircle,
  Layers
} from 'lucide-react';

const themeChartMap = {
  default: { primary: '#3b82f6', secondary: '#f59e0b', tertiary: '#8b5cf6' },
  ocean: { primary: '#0284c7', secondary: '#0ea5e9', tertiary: '#22d3ee' },
  emerald: { primary: '#059669', secondary: '#10b981', tertiary: '#34d399' },
  sunset: { primary: '#ea580c', secondary: '#f97316', tertiary: '#fb923c' },
  midnight: { primary: '#38bdf8', secondary: '#6366f1', tertiary: '#22d3ee' },
  mono: { primary: '#374151', secondary: '#6b7280', tertiary: '#9ca3af' }
};

const statColorMap = {
  blue: 'text-blue-500 bg-blue-50 group-hover:bg-blue-100',
  emerald: 'text-emerald-500 bg-emerald-50 group-hover:bg-emerald-100',
  amber: 'text-amber-500 bg-amber-50 group-hover:bg-amber-100',
  red: 'text-red-500 bg-red-50 group-hover:bg-red-100',
  gray: 'text-slate-500 bg-slate-100 group-hover:bg-slate-200',
  violet: 'text-violet-500 bg-violet-50 group-hover:bg-violet-100'
};

const barColorMap = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-500',
  violet: 'bg-violet-500'
};

const StatCard = ({ title, value, icon: Icon, color, subText, onClick }) => {
  const iconClasses = statColorMap[color] || statColorMap.blue;
  const barClass = barColorMap[color] || barColorMap.blue;
  return (
  <div
    className="bg-app-card rounded-xl p-6 flex items-center justify-between relative overflow-hidden group hover:shadow-lg transition-all cursor-pointer"
    onClick={onClick}
  >
    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${barClass}`}></div>
    <div>
      <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      <div className="flex items-baseline space-x-2">
        <p className="text-3xl font-bold text-app-main">{value}</p>
        {subText && <span className="text-xs text-slate-400">{subText}</span>}
      </div>
    </div>
    <div className={`p-3 rounded-xl transition-colors ${iconClasses}`}>
      <Icon className="w-6 h-6" />
    </div>
  </div>
)};

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType.isRequired,
  color: PropTypes.string.isRequired,
  subText: PropTypes.string,
  onClick: PropTypes.func
};

const DashboardCharts = ({ stats }) => {
  if (!stats) return <div className="p-8 text-center text-gray-500">Loading dashboard data...</div>;

  const { overview, growth } = stats;
  
  const safeOverview = overview || {
    total: 0,
    inUse: 0,
    spare: 0,
    faulty: 0,
    disposed: 0,
    pendingReturns: 0,
    pendingRequests: 0,
    assetTypes: 0
  };

  const selectedTheme = document?.documentElement?.dataset?.theme || 'default';
  const palette = themeChartMap[selectedTheme] || themeChartMap.default;

  // Donut: In Use vs Not In Use (center shows Total)
  const donutOptions = {
    chart: {
      type: 'donut',
      fontFamily: 'inherit'
    },
    labels: ['In Use', 'Not In Use'],
    colors: [palette.primary, palette.secondary],
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              formatter: function () { return (overview?.total || 0); }
            }
          }
        }
      }
    },
    dataLabels: {
      enabled: false
    },
    legend: {
      position: 'bottom'
    }
  };

  const inUseCount = safeOverview.inUse || 0;
  const notInUseCount = Math.max((safeOverview.total || 0) - inUseCount, 0);
  const donutSeries = [inUseCount, notInUseCount];

  const navigateToAssets = (status) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const query = params.toString();
    const path = `/assets${query ? `?${query}` : ''}`;
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  // Bar: Spare / Faulty / Disposed (readings from stat cards)
  const barOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'inherit'
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        horizontal: true,
        barHeight: '60%',
        distributed: false
      }
    },
    dataLabels: {
      enabled: true,
      textAnchor: 'start',
      style: { colors: ['#fff'] },
      formatter: function (val) {
        return val || 0;
      },
      offsetX: 0,
    },
    colors: [palette.primary],
    xaxis: {
      categories: ['Spare', 'Faulty', 'Disposed'],
    },
    grid: {
      borderColor: '#e2e8f0',
      xaxis: { lines: { show: true } }
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: function (val) {
          return val
        }
      }
    }
  };

  const barSeries = [{
    name: 'Inventory Status',
    data: [safeOverview.spare || 0, safeOverview.faulty || 0, safeOverview.disposed || 0]
  }];

  // Growth Chart Options
  const growthOptions = {
    chart: {
      type: 'area',
      toolbar: { show: false },
      fontFamily: 'inherit',
      animations: { enabled: true }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: (growth || []).map(g => g.name),
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: { show: false },
    grid: { show: false, padding: { left: 0, right: 0 } },
    colors: [palette.primary],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100]
      }
    },
    tooltip: {
      y: { formatter: (val) => `${val} Assets` }
    }
  };

  const growthSeries = [{
    name: 'New Assets',
    data: (growth || []).map(g => g.value)
  }];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        <StatCard 
          title="Total Assets" 
          value={safeOverview.total} 
          icon={Box} 
          color="blue" 
          subText="In Inventory"
          onClick={() => navigateToAssets('')}
        />
        <StatCard 
          title="In Use" 
          value={safeOverview.inUse} 
          icon={CheckCircle} 
          color="emerald" 
          subText={`${safeOverview.total ? Math.round((safeOverview.inUse / safeOverview.total) * 100) : 0}% Utilization`}
          onClick={() => navigateToAssets('In Use')}
        />
        <StatCard 
          title="Spare" 
          value={safeOverview.spare} 
          icon={LayoutGrid} 
          color="amber" 
          subText="Ready to assign"
          onClick={() => navigateToAssets('Spare')}
        />
        <StatCard 
          title="Faulty" 
          value={safeOverview.faulty} 
          icon={AlertCircle} 
          color="red" 
          subText="Not issuable"
          onClick={() => navigateToAssets('Faulty')}
        />
        <StatCard 
          title="Disposed" 
          value={safeOverview.disposed} 
          icon={Trash2} 
          color="gray" 
          subText="Write-off history"
          onClick={() => navigateToAssets('Disposed')}
        />
        <StatCard 
          title="Asset Types" 
          value={safeOverview.assetTypes || 0} 
          icon={Layers} 
          color="violet" 
          subText="Unique products"
          onClick={() => window.open('/products', '_blank', 'noopener,noreferrer')}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-app-card p-6 rounded-xl">
          <h3 className="text-app-main font-bold mb-4">Total vs In Use</h3>
          <Chart options={donutOptions} series={donutSeries} type="donut" height={300} />
        </div>
        <div className="bg-app-card p-6 rounded-xl">
          <h3 className="text-app-main font-bold mb-4">Spare vs Faulty vs Disposed</h3>
          <Chart options={barOptions} series={barSeries} type="bar" height={300} />
        </div>
      </div>

      {/* Growth Trend Chart (Powerful Feature) */}
      {(growth || []).length > 0 && (
        <div className="bg-app-card p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-app-main font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-app-accent" />
                Asset Acquisition Trend (Last 6 Months)
             </h3>
          </div>
          <div className="h-[300px] w-full">
            <Chart options={growthOptions} series={growthSeries} type="area" height="100%" />
          </div>
        </div>
      )}
    </div>
  );
};

DashboardCharts.propTypes = {
  stats: PropTypes.object
};

export default DashboardCharts;
