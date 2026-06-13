import { Component, ElementRef, ViewChild, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DamRecord } from '../services/dam-data.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="glass-card p-6 rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-2xl w-full">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            📉 Storico Livelli e Capacità
          </h2>
          <p class="text-xs text-slate-400 mt-1">
            Visualizzazione dei trend storici per la diga selezionata
          </p>
        </div>
        
        <!-- Controlli del Grafico -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Filtro Metrica -->
          <div class="flex bg-slate-950/60 p-1 rounded-lg border border-white/5">
            <button 
              (click)="setMetric('capacity')" 
              [class.active-tab]="selectedMetric === 'capacity'"
              class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer text-slate-400 hover:text-white transition-all duration-200 border-0"
            >
              Capacità (m³)
            </button>
            <button 
              (click)="setMetric('level')" 
              [class.active-tab]="selectedMetric === 'level'"
              class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer text-slate-400 hover:text-white transition-all duration-200 border-0"
            >
              Livello (m)
            </button>
          </div>

          <!-- Filtro Temporale -->
          <div class="flex bg-slate-950/60 p-1 rounded-lg border border-white/5">
            @for (w of timeWindows; track w.id) {
              <button 
                *ngIf="w.id !== 'custom' || selectedWindow === 'custom'"
                (click)="setWindow(w.id)" 
                [class.active-tab]="selectedWindow === w.id"
                [ngClass]="w.id === 'custom' ? 'text-indigo-400 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'text-slate-400 border-0'"
                class="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:text-white transition-all duration-200"
              >
                {{ w.label }}
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Area Grafico -->
      <div class="relative w-full h-[320px]">
        <canvas #chartCanvas></canvas>
      </div>

      <!-- Statistiche Generali Finestra Corrente -->
      <div *ngIf="filteredRecords.length > 0" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
          <span class="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Massimo Raggiunto</span>
          <span class="block text-base font-bold text-cyan-400 mt-1">{{ formatVal(currentStats.max) }}</span>
          <span class="block text-[10px] text-slate-400 mt-0.5">{{ formatDate(currentStats.maxDate) }}</span>
        </div>
        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
          <span class="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Minimo Raggiunto</span>
          <span class="block text-base font-bold text-rose-400 mt-1">{{ formatVal(currentStats.min) }}</span>
          <span class="block text-[10px] text-slate-400 mt-0.5">{{ formatDate(currentStats.minDate) }}</span>
        </div>
        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
          <span class="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Media Periodo</span>
          <span class="block text-base font-bold text-slate-200 mt-1">{{ formatVal(currentStats.avg) }}</span>
        </div>
        <div class="p-3 bg-white/5 rounded-xl border border-white/5">
          <span class="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider">Variazione Periodo</span>
          <span 
            [ngClass]="currentStats.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            class="block text-base font-bold mt-1"
          >
            {{ currentStats.delta >= 0 ? '+' : '' }}{{ formatVal(currentStats.delta) }}
          </span>
          <span class="block text-[10px] text-slate-400 mt-0.5">inizio vs fine periodo</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .glass-card {
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(12px);
    }
    .active-tab {
      background: rgba(6, 182, 212, 0.2);
      color: #22d3ee !important;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.15);
    }
  `]
})
export class ChartComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLCanvasElement>;
  
  @Input() records: DamRecord[] = [];
  @Input() damName: string | null = null;
  @Input() customWindow: {start: string, end: string} | null = null;
  @Output() customWindowCleared = new EventEmitter<void>();

  selectedMetric: 'capacity' | 'level' = 'capacity';
  selectedWindow: '30d' | '90d' | '1y' | 'all' | 'custom' = '90d';
  filteredRecords: DamRecord[] = [];
  
  readonly timeWindows = [
    { id: '30d' as const, label: '30g' },
    { id: '90d' as const, label: '90g' },
    { id: '1y' as const, label: '1 Anno' },
    { id: 'all' as const, label: 'Tutto' },
    { id: 'custom' as const, label: '🎯 Finestra' }
  ];

  private chart: Chart | null = null;

  currentStats = {
    min: 0,
    minDate: '',
    max: 0,
    maxDate: '',
    avg: 0,
    delta: 0
  };

  ngOnInit() {
    this.filterAndRender();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['customWindow'] && this.customWindow) {
      this.selectedWindow = 'custom';
      this.filterAndRender();
    } else if (changes['records'] || changes['damName'] || (changes['customWindow'] && !this.customWindow && this.selectedWindow === 'custom')) {
      if (!this.customWindow && this.selectedWindow === 'custom') {
        this.selectedWindow = '90d'; // fallback when custom is cleared externally
      }
      this.filterAndRender();
    }
  }

  ngOnDestroy() {
    this.destroyChart();
  }

  setMetric(metric: 'capacity' | 'level') {
    this.selectedMetric = metric;
    this.filterAndRender();
  }

  setWindow(windowId: '30d' | '90d' | '1y' | 'all' | 'custom') {
    this.selectedWindow = windowId;
    if (windowId !== 'custom' && this.customWindow !== null) {
      this.customWindowCleared.emit();
    }
    this.filterAndRender();
  }

  formatVal(val: number): string {
    const isLevel = this.selectedMetric === 'level';
    if (isLevel) {
      return val.toFixed(2) + ' m';
    }
    return new Intl.NumberFormat('it-IT').format(Math.round(val)) + ' m³';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  private destroyChart() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  private filterAndRender() {
    this.filterRecords();
    this.calculateStats();
    this.renderChart();
  }

  private filterRecords() {
    if (!this.records.length) {
      this.filteredRecords = [];
      return;
    }

    let filtered: DamRecord[];

    if (this.damName) {
      filtered = this.records.filter(r => r.dam === this.damName);
    } else {
      const dateMap: Record<string, { capacity: number; levelSum: number; count: number }> = {};
      this.records.forEach(r => {
        if (!dateMap[r.date]) {
          dateMap[r.date] = { capacity: 0, levelSum: 0, count: 0 };
        }
        dateMap[r.date].capacity += r.capacity_m3;
        dateMap[r.date].levelSum += r.level_m;
        dateMap[r.date].count += 1;
      });

      filtered = Object.entries(dateMap)
        .map(([date, val]) => ({
          date,
          dam: 'Aggregato',
          level_m: val.levelSum / val.count,
          capacity_m3: val.capacity
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    if (filtered.length === 0) {
      this.filteredRecords = [];
      return;
    }

    const lastDateStr = filtered[filtered.length - 1].date;
    const referenceDate = new Date(lastDateStr);

    let thresholdDate = new Date(referenceDate);

    if (this.selectedWindow === 'custom' && this.customWindow) {
      this.filteredRecords = filtered.filter(r => r.date >= this.customWindow!.start && r.date <= this.customWindow!.end);
      return;
    } else if (this.selectedWindow === '30d') {
      thresholdDate.setDate(referenceDate.getDate() - 30);
    } else if (this.selectedWindow === '90d') {
      thresholdDate.setDate(referenceDate.getDate() - 90);
    } else if (this.selectedWindow === '1y') {
      thresholdDate.setFullYear(referenceDate.getFullYear() - 1);
    } else {
      thresholdDate = new Date('2000-01-01');
    }

    const thresholdIso = thresholdDate.toISOString().substring(0, 10);
    this.filteredRecords = filtered.filter(r => r.date >= thresholdIso);
  }

  private calculateStats() {
    const records = this.filteredRecords;
    if (records.length === 0) return;

    const isLevel = this.selectedMetric === 'level';
    const getValue = (r: DamRecord) => isLevel ? r.level_m : r.capacity_m3;

    let minVal = getValue(records[0]);
    let minDate = records[0].date;
    let maxVal = getValue(records[0]);
    let maxDate = records[0].date;
    let sum = 0;

    records.forEach(r => {
      const val = getValue(r);
      sum += val;
      if (val < minVal) {
        minVal = val;
        minDate = r.date;
      }
      if (val > maxVal) {
        maxVal = val;
        maxDate = r.date;
      }
    });

    const firstVal = getValue(records[0]);
    const lastVal = getValue(records[records.length - 1]);

    this.currentStats = {
      min: minVal,
      minDate,
      max: maxVal,
      maxDate,
      avg: sum / records.length,
      delta: lastVal - firstVal
    };
  }

  private renderChart() {
    this.destroyChart();

    if (this.filteredRecords.length === 0) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = this.filteredRecords.map(r => this.formatDate(r.date));
    const isLevel = this.selectedMetric === 'level';
    const data = this.filteredRecords.map(r => isLevel ? r.level_m : r.capacity_m3);
    const metricLabel = isLevel ? 'Livello (m)' : 'Capacità (m³)';

    const lineGradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    lineGradient.addColorStop(0, '#06b6d4'); // Cyan
    lineGradient.addColorStop(1, '#6366f1'); // Indigo

    const fillGradient = ctx.createLinearGradient(0, 0, 0, 300);
    fillGradient.addColorStop(0, 'rgba(6, 182, 212, 0.25)'); // Cyan con opacità
    fillGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');  // Svanisce

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: metricLabel,
          data: data,
          borderColor: lineGradient,
          borderWidth: 2.5,
          backgroundColor: fillGradient,
          fill: true,
          tension: 0.3,
          pointRadius: this.filteredRecords.length > 100 ? 0 : 2,
          pointHoverRadius: 6,
          pointBackgroundColor: '#22d3ee',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#e2e8f0',
            bodyColor: '#22d3ee',
            titleFont: { family: 'Inter', size: 11, weight: 'bold' },
            bodyFont: { family: 'Inter', size: 12, weight: 'bold' },
            padding: 10,
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: (context) => {
                let value = context.parsed.y;
                return ` ${metricLabel}: ${this.formatVal(value ?? 0)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 10 },
              maxTicksLimit: 8
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 10 },
              callback: (value) => {
                const num = Number(value);
                if (isLevel) return num.toFixed(1) + ' m';
                if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M m³';
                if (num >= 1e3) return (num / 1e3).toFixed(0) + 'k m³';
                return num;
              }
            }
          }
        }
      }
    });
  }
}
