![Logo](admin/solarmanpv.png)
# ioBroker.solarmanpv

[![NPM version](https://img.shields.io/npm/v/iobroker.solarmanpv.svg)](https://www.npmjs.com/package/iobroker.solarmanpv)
[![Downloads](https://img.shields.io/npm/dm/iobroker.solarmanpv.svg)](https://www.npmjs.com/package/iobroker.solarmanpv)
![Number of Installations](https://iobroker.live/badges/solarmanpv-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/solarmanpv-stable.svg)
[![Dependency Status](https://img.shields.io/david/raschy/iobroker.solarmanpv.svg)](https://david-dm.org/raschy/iobroker.solarmanpv)

[![NPM](https://nodei.co/npm/iobroker.solarmanpv.png?downloads=true)](https://nodei.co/npm/iobroker.solarmanpv/)

**Tests:** ![Test and Release](https://github.com/raschy/ioBroker.solarmanpv/workflows/Test%20and%20Release/badge.svg)

## solarmanpv adapter for ioBroker

Reading data from balcony power plant


### Getting started

== EN ==

This adapter is used to display data of a balcony power plant, which 
is provided by a inverter "Bosswerk MI600" in ioBroker.

I assume that the plant is monitored by the app "Solarman" so far. 
This adapter gets the data from this cloud.

First you have to ask Solarman support <service@solarmanpv.com> for 
the needed Credentials (app_id & app_secret) must be requested.
There may still be a query of the type, "I need to ask what platform 
are you using? What is your role? Are you an individual, O&M provider, 
manufacturer, or distributor? Can you give me your email address for 
the API?". In my case, another query then came: "Why are you applying 
for API?". I politely answered this question as well and was sent the 
necessary data the next day.

On the admin page the 4 fields  have to be according to the description. 
This adapter is created as a "scheduled" adapter. 
Since the data in the cloud is updated only about every 6 minutes, 
it does not make to start the adapter more frequently.


== DE ==

Dieser Adapter dient dazu, Daten eines Balkonkraftwerks, das durch einen 
Wechselrichter "Bosswerk MI600" bereit gestellt werden, in ioBroker darzustellen.

Ich gehe davon aus, dass die Anlage bisher durch die App "Solarman" beobachtet 
wird. Dieser Adapter holt die Daten aus dieser Cloud.

Zunächst muss beim Solarman-Support <service@solarmanpv.com> die benötigten 
Credentials (app_id & app_secret) beantragt werden.
Möglicherweise kommt noch eine Rückfrage der Art: "Ich muss fragen, welche 
Plattform Sie verwenden? Welche Rolle spielen Sie? Sind Sie Einzelperson, 
OEM-Anbieter, Hersteller oder Distributor? Können Sie mir Ihre E-Mail-Adresse 
für die API mitteilen?". Bei mir kam dann noch eine weitere Rückfrage: 
"Warum bewerben Sie sich für API?". Auch diese Frage habe ich höflich 
beantwortet und bekam dann am nächsten Tag die notwendigen Daten zugesendet.

Auf der Admin-Seite müssen die 4 Felder der Beschreibung entsprechend aus-
gefüllt werden. Dieser Adapter ist als "scheduled" Adapter angelegt. Da die 
Daten in der Cloud nur ca. alle 6 Minuten aktualisiert werden, ist es nicht 
sinnvoll, den Adapter häufiger starten zu lassen.


## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
* (raschy) Crypto version corrected

### 0.0.5 (2022-06-19)
* (raschy) Crypto version changed

### 0.0.4 (2022-06-19)

* (raschy) Dependecies addet

### 0.0.3 (2022-06-19)

* (raschy) ReadMe changed

### 0.0.2 (2022-06-19)

* (raschy) changed to jsonConfig

### 0.0.1 (2022-06-16

* (raschy) initial release

## License
MIT License

Copyright (c) 2022 raschy <raschy@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.