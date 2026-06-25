import urllib.request
import json
import csv
import argparse
from datetime import datetime

# Mappa dei nomi delle dighe alle rispettive coordinate, coerente con Angular
DAMS_COORDS = {
    "Occhito": {"lat": 41.614, "lon": 14.991},
    "Capaccio": {"lat": 41.139, "lon": 15.820},
    "Capacciotti": {"lat": 41.528, "lon": 15.191},
    "Osento": {"lat": 40.978, "lon": 16.033}
}

def download_historical_precipitation(output_file):
    # Raccogli tutte le latitudini e longitudini nello stesso ordine dei nomi
    dam_names = list(DAMS_COORDS.keys())
    lats = ",".join([str(DAMS_COORDS[name]["lat"]) for name in dam_names])
    lons = ",".join([str(DAMS_COORDS[name]["lon"]) for name in dam_names])
    
    start_date = "2019-01-01"
    end_date = datetime.now().strftime("%Y-%m-%d")
    
    url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lats}&longitude={lons}&start_date={start_date}&end_date={end_date}&daily=precipitation_sum&timezone=Europe%2FRome"
    
    print(f"Scarico i dati da: {url}")
    
    req = urllib.request.Request(url, headers={'User-Agent': 'PugliaWaterFlow-GitHubAction/1.0 (github.com/sfid98/puglia-water-flow)'})
    
    import time
    import urllib.error
    
    max_retries = 3
    data = None
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read().decode())
            break # Success, exit retry loop
        except urllib.error.HTTPError as e:
            print(f"Tentativo {attempt+1}/{max_retries} fallito con errore HTTP: {e.code} {e.reason}")
            if e.code == 403 or e.code == 429:
                # Rate limit or block, wait a bit longer
                time.sleep(2 ** attempt + 2)
            else:
                time.sleep(1)
        except Exception as e:
            print(f"Tentativo {attempt+1}/{max_retries} fallito: {e}")
            time.sleep(1)
            
    if data is None:
        print("Errore critico: Impossibile scaricare i dati meteo dopo vari tentativi.")
        return
        
    if not isinstance(data, list):
        data = [data] # se fosse una sola location
        
    print(f"Dati scaricati. Scrittura in {output_file}...")
    
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['date', 'dam', 'precipitation_mm'])
        
        for i, dam_name in enumerate(dam_names):
            location_data = data[i]
            if "daily" in location_data and "time" in location_data["daily"]:
                times = location_data["daily"]["time"]
                precipitations = location_data["daily"]["precipitation_sum"]
                
                for t, p in zip(times, precipitations):
                    # p può essere None se i dati non sono disponibili per quel giorno
                    precip_val = p if p is not None else 0.0
                    writer.writerow([t, dam_name, precip_val])
                    
    print("Download completato con successo.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Scarica lo storico precipitazioni.')
    parser.add_argument('--output', required=True, help='Percorso del file CSV di output')
    args = parser.parse_args()
    
    download_historical_precipitation(args.output)
