import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DamDataService } from './services/dam-data.service';
import { MapComponent } from './components/map.component';
import { ChartComponent } from './components/chart.component';
import { WeatherCardComponent } from './components/weather-card.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MapComponent,
    ChartComponent,
    WeatherCardComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly damService = inject(DamDataService);

  readonly selectedDamName = signal<string | null>(null);

  readonly selectedDamStatus = computed(() => {
    const name = this.selectedDamName();
    if (!name) return null;
    return this.damService.latestStatus().find(d => d.name === name) || null;
  });

  readonly selectedDamStats = computed(() => {
    const name = this.selectedDamName();
    if (!name) return null;
    return this.damService.getDamStats(name);
  });

  readonly occhitoStatus = computed(() => {
    return this.damService.getDamStatusByName('Occhito');
  });

  activeCustomWindow = signal<{start: string, end: string} | null>(null);

  selectDam(name: string) {
    this.selectedDamName.set(name);
    this.activeCustomWindow.set(null);
  }

  clearSelection() {
    this.selectedDamName.set(null);
    this.activeCustomWindow.set(null);
  }

  zoomToMonth(start: string, end: string) {
    this.activeCustomWindow.set({ start, end });
  }

  zoomToPeak(dateStr: string) {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const start = new Date(d);
    start.setDate(start.getDate() - 15);
    const end = new Date(d);
    end.setDate(end.getDate() + 15);
    this.activeCustomWindow.set({
      start: start.toISOString().substring(0, 10),
      end: end.toISOString().substring(0, 10)
    });
  }

  formatNumber(val: number): string {
    return new Intl.NumberFormat('it-IT').format(Math.round(val));
  }

  formatCompact(val: number): string {
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '+';
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k`;
    return `${sign}${Math.round(abs)}`;
  }

  formatCompactUnsigned(val: number): string {
    const abs = Math.abs(val);
    if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(abs / 1e3).toFixed(0)}k`;
    return `${Math.round(abs)}`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  formatDateTime(isoStr: string | null): string {
    if (!isoStr) return 'N/D';
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} alle ${h}:${m}`;
  }
}

