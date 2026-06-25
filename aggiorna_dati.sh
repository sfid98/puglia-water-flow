#!/bin/bash

# Spostati nella cartella del progetto (permette di lanciare lo script da qualsiasi posizione)
cd "$(dirname "$0")"

echo "💧 Inizio aggiornamento dati dighe..."
python3 scripts/download_dam_levels.py --output dighe_project/public/data/dam_levels.csv

echo "🌧️ Inizio aggiornamento dati precipitazioni..."
python3 scripts/download_precipitation.py --output dighe_project/public/data/precipitation_data.csv

echo "🕒 Aggiornamento data di controllo..."
echo "{\"lastCheck\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" > dighe_project/public/data/update_info.json

echo "🚀 Caricamento su GitHub in corso..."
git add dighe_project/public/data/dam_levels.csv dighe_project/public/data/precipitation_data.csv dighe_project/public/data/update_info.json
git commit -m "Aggiornamento dati manuale da locale"
git pull --rebase
git push

echo "✅ Fatto! GitHub Action avvierà a breve il deploy del sito aggiornato."
