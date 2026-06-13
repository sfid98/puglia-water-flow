import { Injectable } from '@angular/core';

export interface WeatherInfo {
  temp: number;
  humidity: number;
  windSpeed: number;
  code: number;
  description: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  
  // Mappa i codici WMO in descrizione in italiano ed emoji/classe icona
  private getWeatherDescription(code: number): { desc: string; icon: string } {
    if (code === 0) return { desc: 'Soleggiato', icon: '☀️' };
    if (code >= 1 && code <= 3) return { desc: 'Parzialmente Nuvoloso', icon: '⛅' };
    if (code === 45 || code === 48) return { desc: 'Nebbia', icon: '🌫️' };
    if (code >= 51 && code <= 55) return { desc: 'Pioggerellina', icon: '🌧️' };
    if (code >= 61 && code <= 65) return { desc: 'Pioggia', icon: '🌧️' };
    if (code >= 71 && code <= 75) return { desc: 'Neve', icon: '❄️' };
    if (code >= 80 && code <= 82) return { desc: 'Acquazzone', icon: '🌦️' };
    if (code >= 95 && code <= 99) return { desc: 'Temporale', icon: '⛈️' };
    return { desc: 'Variabile', icon: '🌤️' };
  }

  async getWeather(lat: number, lon: number): Promise<WeatherInfo> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Errore nel caricamento del meteo');
      }
      const data = await response.json();
      const current = data.current;
      const { desc, icon } = this.getWeatherDescription(current.weather_code);

      return {
        temp: Math.round(current.temperature_2m),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        code: current.weather_code,
        description: desc,
        icon: icon
      };
    } catch (error) {
      console.error('Meteo non disponibile:', error);
      // Ritorna dati mock di fallback realistici
      return {
        temp: 22,
        humidity: 60,
        windSpeed: 12,
        code: 0,
        description: 'Meteo non disponibile (Offline)',
        icon: '🌤️'
      };
    }
  }
}
