import { Component, ElementRef, ViewChild, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DamStatus } from '../services/dam-data.service';
import * as L from 'leaflet';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container-wrapper relative w-full h-[400px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div #mapContainer class="w-full h-full"></div>
      
      <!-- Sovrapposizione di controllo rapido -->
      <div class="absolute bottom-4 left-4 z-[1000] bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 text-xs text-slate-300 pointer-events-none">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>Dighe in Puglia</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `]
})
export class MapComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  
  @Input() dams: DamStatus[] = [];
  @Input() selectedDamName: string | null = null;
  @Output() damSelected = new EventEmitter<string>();

  private map!: L.Map;
  private markers: Record<string, L.Marker> = {};

  constructor(private zone: NgZone) {}

  ngOnInit() {
    this.zone.runOutsideAngular(() => {
      this.initMap();
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['dams'] && !changes['dams'].firstChange) {
      this.updateMarkers();
    }
    if (changes['selectedDamName'] && !changes['selectedDamName'].firstChange) {
      this.focusSelectedDam();
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap() {
    // Coordinate centrali della Puglia / Capitanata
    const defaultCenter: L.LatLngExpression = [41.38, 15.55];
    const defaultZoom = 8.5;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false, // Disabilitiamo per riposizionarlo
      scrollWheelZoom: true
    });

    // Aggiungi pulsanti dello zoom in basso a destra
    L.control.zoom({
      position: 'bottomright'
    }).addTo(this.map);

    // TileLayer con tema scuro per abbinarsi al Glassmorphism Dark Mode
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);

    this.updateMarkers();
  }

  private updateMarkers() {
    if (!this.map || !this.dams.length) return;

    // Rimuovi marker esistenti
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};

    this.dams.forEach(dam => {
      const { lat, lng } = dam.metadata;
      
      // Marker HTML personalizzato (glowing water droplet/dot)
      const isSelected = dam.name === this.selectedDamName;
      const markerClass = isSelected ? 'glowing-marker-selected' : 'glowing-marker-normal';

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="relative flex items-center justify-center w-6 h-6">
            <div class="absolute w-5 h-5 bg-cyan-500/30 rounded-full animate-ping"></div>
            <div class="w-3.5 h-3.5 bg-cyan-400 rounded-full border border-white shadow-[0_0_8px_#22d3ee] transition-all duration-300 ${isSelected ? 'scale-150 !bg-emerald-400 shadow-[0_0_12px_#34d399]' : ''}"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.map);
      
      // Popup personalizzato con Glassmorphism
      const formatNumber = (num: number) => new Intl.NumberFormat('it-IT').format(num);
      const percent = dam.percentFill.toFixed(1);

      const popupContent = `
        <div class="p-3 text-slate-100 font-sans min-w-[200px] bg-slate-950/90 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
          <h3 class="font-bold text-lg text-cyan-400 m-0 flex items-center gap-1.5">
            💧 Diga di ${dam.name}
          </h3>
          <p class="text-xs text-slate-400 m-0 mt-0.5">${dam.metadata.location} | Fiume ${dam.metadata.river}</p>
          
          <div class="mt-2.5 space-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-400">Capacità Corrente:</span>
              <span class="font-semibold text-slate-200">${formatNumber(dam.capacity)} m³</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Livello Idrico:</span>
              <span class="font-semibold text-slate-200">${dam.level.toFixed(2)} m</span>
            </div>
            <div class="flex justify-between items-center pt-1 border-t border-white/5">
              <span class="text-slate-400">Riempimento:</span>
              <span class="font-bold text-emerald-400">${percent}%</span>
            </div>
          </div>

          <button 
            id="popup-btn-${dam.name}" 
            class="w-full mt-3 py-1.5 px-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg cursor-pointer transition-all duration-300 border-0 text-center"
          >
            Visualizza Storico
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: false,
        className: 'glassmorphism-popup',
        minWidth: 220
      });

      // Gestione dell'evento di apertura popup per agganciare il click sul bottone
      marker.on('popupopen', () => {
        this.zone.run(() => {
          setTimeout(() => {
            const btn = document.getElementById(`popup-btn-${dam.name}`);
            if (btn) {
              btn.onclick = () => {
                this.zone.run(() => {
                  this.damSelected.emit(dam.name);
                  marker.closePopup();
                });
              };
            }
          }, 50);
        });
      });

      // Cliccando sul marker si seleziona la diga
      marker.on('click', () => {
        this.zone.run(() => {
          this.damSelected.emit(dam.name);
        });
      });

      this.markers[dam.name] = marker;
    });

    this.focusSelectedDam();
  }

  private focusSelectedDam() {
    if (!this.map || !this.selectedDamName) return;
    
    const marker = this.markers[this.selectedDamName];
    if (marker) {
      const latlng = marker.getLatLng();
      this.zone.runOutsideAngular(() => {
        this.map.setView(latlng, 10.5, {
          animate: true,
          duration: 1.2
        });
        // Apri il popup
        setTimeout(() => {
          marker.openPopup();
        }, 300);
      });
      
      // Rigenera i marker per aggiornare lo stile di quello selezionato
      this.updateMarkersStyle();
    }
  }

  private updateMarkersStyle() {
    this.dams.forEach(dam => {
      const marker = this.markers[dam.name];
      if (!marker) return;

      const isSelected = dam.name === this.selectedDamName;
      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="relative flex items-center justify-center w-6 h-6">
            <div class="absolute w-5 h-5 bg-cyan-500/30 rounded-full animate-ping"></div>
            <div class="w-3.5 h-3.5 bg-cyan-400 rounded-full border border-white shadow-[0_0_8px_#22d3ee] transition-all duration-300 ${isSelected ? 'scale-[1.35] !bg-emerald-400 shadow-[0_0_12px_#34d399]' : ''}"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      marker.setIcon(customIcon);
    });
  }
}
