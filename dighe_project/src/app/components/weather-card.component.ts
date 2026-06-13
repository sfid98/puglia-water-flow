import { Component, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherService, WeatherInfo } from '../services/weather.service';

@Component({
  selector: 'app-weather-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="weather-card glass-card p-4 rounded-xl border border-white/10 bg-slate-900/40 backdrop-blur-md shadow-lg h-full flex flex-col justify-between transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
      
      <!-- Stato di Caricamento -->
      <div *ngIf="loading" class="animate-pulse flex flex-col justify-between h-full space-y-3">
        <div class="flex justify-between items-start">
          <div class="h-4 bg-white/10 rounded w-2/3"></div>
          <div class="w-8 h-8 bg-white/10 rounded-full"></div>
        </div>
        <div class="h-8 bg-white/10 rounded w-1/3 my-2"></div>
        <div class="flex gap-4">
          <div class="h-3 bg-white/10 rounded w-1/4"></div>
          <div class="h-3 bg-white/10 rounded w-1/4"></div>
        </div>
      </div>

      <!-- Contenuto Meteo Effettivo -->
      <div *ngIf="!loading && weather" class="flex flex-col h-full justify-between">
        <div class="flex justify-between items-start">
          <div>
            <span class="block text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Meteo Località</span>
            <h4 class="font-bold text-sm text-slate-100 mt-0.5 truncate">{{ locationName }}</h4>
          </div>
          <span class="text-3xl filter drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)] select-none">
            {{ weather.icon }}
          </span>
        </div>

        <div class="my-3 flex items-baseline gap-1.5">
          <span class="text-2xl font-black text-white leading-none tracking-tight">
            {{ weather.temp }}°C
          </span>
          <span class="text-xs text-cyan-400 font-medium truncate">
            {{ weather.description }}
          </span>
        </div>

        <div class="flex gap-4 text-[10px] text-slate-400 border-t border-white/5 pt-2">
          <div class="flex items-center gap-1">
            <span>💧</span>
            <span>Umidità: <strong>{{ weather.humidity }}%</strong></span>
          </div>
          <div class="flex items-center gap-1">
            <span>💨</span>
            <span>Vento: <strong>{{ weather.windSpeed }} km/h</strong></span>
          </div>
        </div>
      </div>
      
    </div>
  `,
  styles: [`
    .glass-card {
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(12px);
    }
  `]
})
export class WeatherCardComponent implements OnInit {
  @Input() lat!: number;
  @Input() lng!: number;
  @Input() locationName!: string;

  loading = true;
  weather: WeatherInfo | null = null;

  constructor(private weatherService: WeatherService, private cdr: ChangeDetectorRef) { }

  async ngOnInit() {
    if (this.lat !== undefined && this.lng !== undefined) {
      this.weather = await this.weatherService.getWeather(this.lat, this.lng);
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
