# Dashboard dighe Puglia

Script per costruire un dataset CSV giornaliero dei livelli delle dighe usando
l'endpoint pubblico:

```bash
https://gesi.bonificacapitanata.it/api/v1/open_data/levels?date=YYYY-MM-DD
```

## Scaricare l'ultimo anno

```bash
python3 scripts/download_dam_levels.py
```

Output predefinito:

```bash
data/dam_levels.csv
```

## Partire da una data specifica

```bash
python3 scripts/download_dam_levels.py --start-date 2025-06-13
```

## Scaricare un intervallo specifico

```bash
python3 scripts/download_dam_levels.py --start-date 2026-06-01 --end-date 2026-06-09
```

## Riprendere un download interrotto

Lo script riprende automaticamente dal CSV esistente: se una data e' gia'
presente, viene saltata.

```bash
python3 scripts/download_dam_levels.py --start-date 2025-06-13 --output data/dam_levels.csv
```

## Evitare limiti dell'endpoint

Lo script fa una richiesta alla volta, aspetta tra una richiesta e l'altra e
ritenta con backoff esponenziale in caso di errori temporanei o HTTP 429.

Opzioni utili:

```bash
python3 scripts/download_dam_levels.py --delay 3 --max-retries 8
```

## Riscrivere il CSV

```bash
python3 scripts/download_dam_levels.py --overwrite
```

## Colonne CSV

- `date`: data richiesta in formato ISO `YYYY-MM-DD`
- `dam`: nome diga
- `level_m`: livello numerico in metri
- `capacity_m3`: capacita' numerica in metri cubi
- `api_date`: data restituita dall'API
- `level_raw`: valore livello originale
- `capacity_raw`: valore capacita' originale
