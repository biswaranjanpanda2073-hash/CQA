import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables);

if (typeof window !== 'undefined') {
  window.Chart = Chart;
  window.ChartDataLabels = ChartDataLabels;
}

export { Chart, ChartDataLabels };
