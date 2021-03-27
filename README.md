# griefergames-afk-bot

Bot basierend auf meiner [griefergames-bot](https://github.com/Neocraftr/griefergames-bot) Bibliothek für den CityBuild Server GrieferGames.net. Vorallem auf AFK-Farming (z.B. an Spawnern) ausgelegt.

## Funktionen
- Bukkit/Spigot ähnliches Konsoleninterface für Ingame und Bot Befahle
- Auto reconnect
- Chat und online Zeit logging
- Automatisch auf Private Nachrichten antworten
- Anzeige für erhaltenes Geld
- Mehrere einstellbare Profile für verschiedene Aufgaben
- Unterstützung für mehrere Accounts
- Unterstützung für MCLeaks Alts
- Steuerung per MSG

## Installation
- Projekt von GitHub klonen
```sh
git clone https://github.com/Neocraftr/griefergames-afk-bot.git
cd griefergames-afk-bot
```
- Bibliothek installieren und mit [TypeScript](https://www.typescriptlang.org/download) kompilieren
```sh
npm install
tsc
```
- Beispiel Konfigurationsdateien umbenennen
```sh
cp config.sample.json config.json
cp credentials.sample.json credentials.json
```
- Account Logindaten in die `credentials.json` eintragen und Profile in der `config.json` anlegen (**Das `default` profil darf nicht umbenannt oder gelöscht werden**)
- Bot starten
```sh
node index.js
```

## Befehle
Verfügbare Startoptionen können mit mit `node index.js --help` und verfügbare Konsolenbefehle mit `#help` aufgelistet werden.

## Disclamer
Die verwendung von Bots für das AFK-Farming oder CaseOpenings ist laut GrieferGames Regelwerk untersagt. Verwendung auf eigene Gefahr!