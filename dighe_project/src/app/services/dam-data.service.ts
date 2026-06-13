import { Injectable, signal, computed } from '@angular/core';

export interface DamRecord {
  date: string;       // YYYY-MM-DD
  dam: string;        // Capaccio, Capacciotti, Occhito, Osento
  level_m: number;
  capacity_m3: number;
}

export interface DamMetadata {
  name: string;
  lat: number;
  lng: number;
  location: string;
  river: string;
  nominalCapacity: number; // in m³
}

export const DAMS_METADATA: Record<string, DamMetadata> = {
  'Occhito': {
    name: 'Occhito',
    lat: 41.614,
    lng: 14.991,
    location: 'Carlantino (FG)',
    river: 'Fortore',
    nominalCapacity: 250000000 // 250M m³
  },
  'Capacciotti': {
    name: 'Capacciotti',
    lat: 41.139,
    lng: 15.820,
    location: 'Cerignola (FG)',
    river: 'Marana Capacciotti',
    nominalCapacity: 48200000 // 48.2M m³
  },
  'Capaccio': {
    name: 'Capaccio',
    lat: 41.528,
    lng: 15.191,
    location: 'Lucera (FG)',
    river: 'Celone',
    nominalCapacity: 16800000 // 19.2M m³
  },
  'Osento': {
    name: 'Osento',
    lat: 40.978,
    lng: 16.033,
    location: 'Spinazzola (BT)',
    river: 'Osento',
    nominalCapacity: 17100000 // 14.6M m³
  }
};

export interface DamStatus {
  name: string;
  metadata: DamMetadata;
  date: string;
  level: number;
  capacity: number;
  percentFill: number;
  change7d: number;      // Variazione in m³ rispetto a 7 giorni fa
  change24h: number;     // Variazione in m³ rispetto al giorno prima
  trend: 'up' | 'down' | 'stable';
}

export interface HistoricalStats {
  maxCapacity: { date: string; value: number };
  minCapacity: { date: string; value: number };
  maxLevel: { date: string; value: number };
  minLevel: { date: string; value: number };
  bestPeriod: { start: string; end: string; avgCapacity: number; desc: string }; // Mese migliore
  worstPeriod: { start: string; end: string; avgCapacity: number; desc: string }; // Mese peggiore
}

@Injectable({
  providedIn: 'root'
})
export class DamDataService {
  readonly records = signal<DamRecord[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.loadData();
  }

  private async loadData() {
    try {
      this.loading.set(true);
      const response = await fetch('data/dam_levels.csv');
      if (!response.ok) {
        throw new Error('Impossibile caricare i dati delle dighe');
      }
      const csvText = await response.text();
      const parsed = this.parseCSV(csvText);

      parsed.sort((a, b) => a.date.localeCompare(b.date));

      this.records.set(parsed);
      this.loading.set(false);
    } catch (err: any) {
      console.error(err);
      this.error.set(err.message || 'Errore imprevisto durante il caricamento');
      this.loading.set(false);
    }
  }

  private parseCSV(csvText: string): DamRecord[] {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const records: DamRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const tokens = line.split(',');
      if (tokens.length < 4) continue;

      const date = tokens[0];
      const dam = tokens[1];
      const level_m = parseFloat(tokens[2]);
      const capacity_m3 = parseInt(tokens[3], 10);

      if (isNaN(level_m) || isNaN(capacity_m3)) continue;

      records.push({
        date,
        dam,
        level_m,
        capacity_m3
      });
    }
    return records;
  }

  readonly damNames = computed(() => {
    return Object.keys(DAMS_METADATA);
  });

  readonly latestDate = computed(() => {
    const all = this.records();
    if (all.length === 0) return '';
    return all[all.length - 1].date;
  });

  readonly latestStatus = computed<DamStatus[]>(() => {
    const all = this.records();
    const names = this.damNames();
    const latestDateStr = this.latestDate();
    if (all.length === 0 || !latestDateStr) return [];

    return names.map(name => {
      const metadata = DAMS_METADATA[name];

      const damRecords = all.filter(r => r.dam === name);
      if (damRecords.length === 0) {
        return {
          name,
          metadata,
          date: '',
          level: 0,
          capacity: 0,
          percentFill: 0,
          change7d: 0,
          change24h: 0,
          trend: 'stable' as const
        };
      }

      const latestRecord = damRecords[damRecords.length - 1];
      const index = damRecords.length - 1;

      const prevRecord = index > 0 ? damRecords[index - 1] : latestRecord;
      const change24h = latestRecord.capacity_m3 - prevRecord.capacity_m3;

      const prev7dRecord = index >= 7 ? damRecords[index - 7] : damRecords[0];
      const change7d = latestRecord.capacity_m3 - prev7dRecord.capacity_m3;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      const threshold = 10000; // 10,000 m³ di soglia per considerare una variazione significativa
      if (change7d > threshold) {
        trend = 'up';
      } else if (change7d < -threshold) {
        trend = 'down';
      }

      const percentFill = (latestRecord.capacity_m3 / metadata.nominalCapacity) * 100;

      return {
        name,
        metadata,
        date: latestRecord.date,
        level: latestRecord.level_m,
        capacity: latestRecord.capacity_m3,
        percentFill: Math.min(100, Math.max(0, percentFill)),
        change24h,
        change7d,
        trend
      };
    });
  });

  readonly totalCurrentCapacity = computed(() => {
    return this.latestStatus().reduce((acc, dam) => acc + dam.capacity, 0);
  });

  readonly totalNominalCapacity = computed(() => {
    return Object.values(DAMS_METADATA).reduce((acc, dam) => acc + dam.nominalCapacity, 0);
  });

  readonly totalPercentFill = computed(() => {
    const nominal = this.totalNominalCapacity();
    if (nominal === 0) return 0;
    return (this.totalCurrentCapacity() / nominal) * 100;
  });

  getDamStatusByName(name: string): DamStatus | undefined {
    return this.latestStatus().find(d => d.name === name);
  }

  readonly aggregatedHistoryMax = computed(() => {
    const history = this.aggregatedHistory();
    if (history.length === 0) return { date: '', value: 0 };
    let max = history[0];
    history.forEach(h => {
      if (h.capacity > max.capacity) max = h;
    });
    return { date: max.date, value: max.capacity };
  });

  readonly aggregatedHistoryMin = computed(() => {
    const history = this.aggregatedHistory();
    if (history.length === 0) return { date: '', value: 0 };
    let min = history[0];
    history.forEach(h => {
      if (h.capacity < min.capacity) min = h;
    });
    return { date: min.date, value: min.capacity };
  });

  readonly averageDailyNetFlow7d = computed(() => {
    const history = this.aggregatedHistory();
    if (history.length < 2) return 0;
    const last = history[history.length - 1];
    const prev7 = history.length >= 8 ? history[history.length - 8] : history[0];
    const days = Math.max(1, this.daysBetween(prev7.date, last.date));
    return (last.capacity - prev7.capacity) / days;
  });

  readonly globalTrend = computed<'up' | 'down' | 'stable'>(() => {
    const flow = this.averageDailyNetFlow7d();
    if (flow > 50000) return 'up';
    if (flow < -50000) return 'down';
    return 'stable';
  });

  private daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA);
    const b = new Date(dateB);
    return Math.round(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  getDamStats(damName: string): HistoricalStats | null {
    const all = this.records().filter(r => r.dam === damName);
    if (all.length === 0) return null;

    let maxCap = all[0];
    let minCap = all[0];
    let maxLev = all[0];
    let minLev = all[0];

    all.forEach(r => {
      if (r.capacity_m3 > maxCap.capacity_m3) maxCap = r;
      if (r.capacity_m3 < minCap.capacity_m3) minCap = r;
      if (r.level_m > maxLev.level_m) maxLev = r;
      if (r.level_m < minLev.level_m) minLev = r;
    });

    const monthlyGroups: Record<string, { total: number; count: number }> = {};
    all.forEach(r => {
      const monthKey = r.date.substring(0, 7); // YYYY-MM
      if (!monthlyGroups[monthKey]) {
        monthlyGroups[monthKey] = { total: 0, count: 0 };
      }
      monthlyGroups[monthKey].total += r.capacity_m3;
      monthlyGroups[monthKey].count += 1;
    });

    let bestMonth = '';
    let bestAvg = -1;
    let worstMonth = '';
    let worstAvg = Infinity;

    const monthNamesIt: Record<string, string> = {
      '01': 'Gennaio', '02': 'Febbraio', '03': 'Marzo', '04': 'Aprile',
      '05': 'Maggio', '06': 'Giugno', '07': 'Luglio', '08': 'Agosto',
      '09': 'Settembre', '10': 'Ottobre', '11': 'Novembre', '12': 'Dicembre'
    };

    const getMonthDesc = (key: string) => {
      const [year, month] = key.split('-');
      return `${monthNamesIt[month]} ${year}`;
    };

    Object.entries(monthlyGroups).forEach(([key, val]) => {
      const avg = val.total / val.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestMonth = key;
      }
      if (avg < worstAvg) {
        worstAvg = avg;
        worstMonth = key;
      }
    });

    return {
      maxCapacity: { date: maxCap.date, value: maxCap.capacity_m3 },
      minCapacity: { date: minCap.date, value: minCap.capacity_m3 },
      maxLevel: { date: maxLev.date, value: maxLev.level_m },
      minLevel: { date: minLev.date, value: minLev.level_m },
      bestPeriod: {
        start: `${bestMonth}-01`,
        end: `${bestMonth}-31`, // approssimativo
        avgCapacity: bestAvg,
        desc: getMonthDesc(bestMonth)
      },
      worstPeriod: {
        start: `${worstMonth}-01`,
        end: `${worstMonth}-31`, // approssimativo
        avgCapacity: worstAvg,
        desc: getMonthDesc(worstMonth)
      }
    };
  }

  readonly aggregatedHistory = computed(() => {
    const all = this.records();
    if (all.length === 0) return [];

    const dateMap: Record<string, { date: string; capacity: number; levelSum: number; count: number }> = {};

    all.forEach(r => {
      if (!dateMap[r.date]) {
        dateMap[r.date] = { date: r.date, capacity: 0, levelSum: 0, count: 0 };
      }
      dateMap[r.date].capacity += r.capacity_m3;
      dateMap[r.date].levelSum += r.level_m;
      dateMap[r.date].count += 1;
    });

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  });
}
