// ==UserScript==
// @name         [LW] True Level Calculator
// @namespace    leekwars
// @version      2025-08-29_14-30
// @description  Affiche le niveau des poireaux/éleveur équivalent en capital et colore le talent.
// @author       WhiteSlash
// @match        https://leekwars.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leekwars.com
// @grant        none
// @downloadURL  https://github.com/whiteslash/leekwars_v2/raw/whiteslash-true-level/leekwars_true_level.user.js
// @updateURL    https://github.com/whiteslash/leekwars_v2/raw/whiteslash-true-level/leekwars_true_level.user.js
// @supportURL   https://github.com/jogalaxy/leekwars_v2/issues
// ==/UserScript==

(function() {
    'use strict';
    const LOCAL_STORAGE_KEY = 'true_level_cache';
    const LOCAL_STORAGE_SETTINGS_KEY = 'true_level_settings';

    var SETTINGS = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    var saveSettings = function() {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(SETTINGS));
    }
    if (SETTINGS === null) {
        SETTINGS = {
            'use_cores': true,
            'use_ram' : true,
            'use_frequency': true
        };
        saveSettings();
    } else {
        SETTINGS = JSON.parse(SETTINGS);
    }

    var saveToLocalStorage = function(key, value) {
        var cache = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cache === null) {
            cache = {};
        } else {
            cache = JSON.parse(cache);
        }
        cache[key] = value;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cache));
    }
    var getFromLocalStorage = function(key) {
        var cache = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cache === null) {
            cache = {};
        } else {
            cache = JSON.parse(cache);
        }
        return cache[key];
    }
    var clearLocalStorage = function(all) {
        var cache = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cache === null) {
            return;
        }
        if (all) {
            cache = {};
        } else {
            cache = JSON.parse(cache);
        }
        // on clean toutes les vieilles valeurs inutiles moches du cul
        const now = (new Date()).getTime();
        const oneWeekAgo = 7 * 24 * 60 * 60 * 1000;
        var newCache = {};
        for (var id in cache) {
            if (cache[id].d >= now - oneWeekAgo) {
                newCache[id] = cache[id];
            }
        }
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newCache));
    }
    // Cache par ID avec capital, level estimé et date d'update.
    var leeksCache = {
        0: {'c': 10000, 'l': 305, 'd': (new Date()).getTime()}
    };
    var farmersCache = {};

    // Leek a charger avec leur ID, et l'element à mettre à jour, et le prefix.
    var leeksToLoad = {
        1: {'el':null, 'prefix': null},
        127840: {'el':null, 'prefix': null},
    };
    var farmersToLoad = {
        121579: null,
    };
    var resetAllToLoad = function() {
        leeksToLoad = {};
        farmersToLoad = {};
    };

    var formatNumber = function(number) {
        return number.toLocaleString('fr-FR');
    }

    var addLeekToLoad = function (id, el, prefix) {
        leeksToLoad[id] = {'el':el, 'prefix':prefix};
    }
    var addFarmerToLoad = function (id, el) {
        farmersToLoad[id] = el;
    }

    const GRIS = '#878787'; // gris fréquence;
    const ORANGE = '#ff7f01'; // orange TP
    const VIOLET = '#ce00c7'; // violet ram
    const BLEU = '#0080f7';// bleu agi
    const VERT = '#5ebe00'; // vert MP
    var maximumLevelWithTheseSettings = 700;
    if (SETTINGS.use_cores) {maximumLevelWithTheseSettings += 150;}
    if (SETTINGS.use_ram) {maximumLevelWithTheseSettings += 250;}
    if (SETTINGS.use_frequency) {maximumLevelWithTheseSettings += 100;}

    var LEVEL_COLOR_CONFIGS = [
        {'min':0, 'max': 0, 'd': GRIS, 'u': VERT},
        {'min':0, 'max': 0, 'd': VERT, 'u': BLEU},
        {'min':0, 'max': 0, 'd': BLEU, 'u': VIOLET},
        {'min':0, 'max': 0, 'd': VIOLET, 'u': ORANGE}
    ];
    var step = maximumLevelWithTheseSettings / 4;
    for (var i = 0; i < 4; i++) {
        LEVEL_COLOR_CONFIGS[i].min = i * step;
        LEVEL_COLOR_CONFIGS[i].max = (i+1) * step;
    }

    LEVEL_COLOR_CONFIGS.push({'min':maximumLevelWithTheseSettings, 'max': 10000, 'd': ORANGE, 'u': ORANGE});

    var getLevelFromCapital = function(capital) {
        var capitalPerLevel = 5;
        var bonuses = {
            1: 45,
            100: 45,
            200: 45,
            300: 45,
            301: 95,
            400: 45,
            500: 45,
            600: 45,
            700: 45,
            800: 45,
            900: 45,
            1000: 95,
            1100: 45,
            1200: 45,
            1300: 45,
            1400: 45,
        };
        var currentLevel = 0;
        while (capital > 0) {
            currentLevel++;
            capital -= capitalPerLevel;
            if (typeof bonuses[currentLevel] !== 'undefined') {
                capital -= bonuses[currentLevel];
            }
        }
        return currentLevel;
    }

    // Les seuils sont sous le format [ [pallier, capital, gain], [...] ]
    const LIFE_SEUILS = [
        [1000, 1, 4],
        [2000, 1, 3],
        [99999, 1, 2],
    ];
    const GENERIC_STAT_SEUILS = [
        [200, 1, 2],
        [400, 1, 1],
        [600, 2, 1],
        [99999, 3, 1],
    ];
    // D'autres ont des formules mathématiques plutôt comme des suites min(c, a + b * x); avec [a, b, c]
    const PT_RULES = [30, 5, 100];
    const PM_RULES = [20, 20, 180];
    const CORES_RULES = [20, 10, 100];
    const RAM_RULES = [20, 10, 100];
    const FREQUENCY_RULES = [1, 0, 1];
    var getCapitalFromSeuil = function(valeur, seuils) {
        var capital = 0;
        var currentValeur = 0;
        for (var i in seuils) {
            var seuil = seuils[i];
            while (currentValeur < seuil[0] && currentValeur < valeur) {
                capital += seuil[1];
                currentValeur += seuil[2];
            }
        }
        return capital;
    }
    var getCapitalFromRule = function(valeur, rule) {
        var capital = 0;
        var currentValeur = 0;
        while (currentValeur < valeur) {
            capital += Math.min(rule[2], rule[0] + currentValeur * rule[1]);
            currentValeur++;
        }
        return capital;
    }
    var getCapitalFromJson = function(json) {
        var capital = 0;
        // Reset des stats pour enlever celles liées au niveau du joueur.
        json.total_life -= 100 + (json.level-1) * 3;
        json.total_cores -= 1;
        json.total_ram -= 6;
        json.total_tp -= 10;
        json.total_mp -= 3;
        json.total_frequency -= 100;

        capital += getCapitalFromSeuil(json.total_agility, GENERIC_STAT_SEUILS);
        capital += getCapitalFromSeuil(json.total_magic, GENERIC_STAT_SEUILS);
        capital += getCapitalFromSeuil(json.total_life, LIFE_SEUILS);
        capital += getCapitalFromSeuil(json.total_resistance, GENERIC_STAT_SEUILS);
        capital += getCapitalFromSeuil(json.total_science, GENERIC_STAT_SEUILS);
        capital += getCapitalFromSeuil(json.total_strength, GENERIC_STAT_SEUILS);
        capital += getCapitalFromSeuil(json.total_wisdom, GENERIC_STAT_SEUILS);
        capital += getCapitalFromRule(json.total_mp, PM_RULES);
        capital += getCapitalFromRule(json.total_tp, PT_RULES);

        if (SETTINGS.use_frequency) {
            console.log('avec la frequence');
            capital += json.total_frequency;
        }
        if (SETTINGS.use_cores) {
            console.log('avec le core');
            capital += getCapitalFromRule(json.total_cores, CORES_RULES);
        }
        if (SETTINGS.use_ram) {
            console.log('avec la ram');
            capital += getCapitalFromRule(json.total_ram, RAM_RULES);
        }

        return capital;

    }

    var displayLeekLevel = function (id, el, prefix) {
        if (typeof leeksCache[id] === 'undefined') {
            addLeekToLoad(id, el, prefix);
            // on affiche TMP la valeur du local storage
            var cachedValue = getFromLocalStorage('l'+id);
            if (cachedValue) {
                leeksCache[id] = cachedValue;
                displayLeekLevel(id, el, prefix);
            }
            return;
        }
        saveToLocalStorage('l'+id, leeksCache[id]);

        var level = leeksCache[id].l;
        var colorUp = GRIS;
        var colorDown = GRIS;
        var percent = 50;
        for (var i in LEVEL_COLOR_CONFIGS) {
            var config = LEVEL_COLOR_CONFIGS[i];
            if (level > config.min && level <= config.max) {
                colorUp = config.u;
                colorDown = config.d;
                percent = Math.ceil((level - config.min) / (config.max - config.min) * 100);
            }
        }
        var color = 'color-mix(in srgb, '+colorDown+', '+colorUp+' '+percent+'%)';
        if (el.querySelector('span') && el.querySelector('span').getAttribute('data-original-value')) {
            el.innerHTML = el.querySelector('span').getAttribute('data-original-value');
        }
        el.innerHTML = (prefix?prefix:'')+'<span data-original-value="'+el.innerText+'" style="color:'+color+'" title="'+el.innerText+'">'+formatNumber(level)+'</span>';
    }

    var displayFarmerLevel = function (id, el) {
        if (typeof farmersCache[id] === 'undefined') {
            addFarmerToLoad(id, el);
            // on affiche TMP la valeur du local storage
            var cachedValue = getFromLocalStorage('f'+id);
            if (cachedValue) {
                farmersCache[id] = cachedValue;
                displayFarmerLevel(id, el);
            }
            return;
        }
        saveToLocalStorage('f'+id, farmersCache[id]);
        var level = farmersCache[id].l;
        var colorUp = GRIS;
        var colorDown = GRIS;
        var percent = 50;
        var leekCount = 4;
        for (var i in LEVEL_COLOR_CONFIGS) {
            var config = LEVEL_COLOR_CONFIGS[i];
            if (level > config.min * leekCount && level <= config.max * leekCount) {
                colorUp = config.u;
                colorDown = config.d;
                percent = Math.ceil((level - config.min * leekCount) / (config.max * leekCount - config.min * leekCount) * 100);
            }
        }
        var color = 'color-mix(in srgb, '+colorDown+', '+colorUp+' '+percent+'%)';
        if (el.querySelector('span') && el.querySelector('span').getAttribute('data-original-value')) {
            el.innerHTML = el.querySelector('span').getAttribute('data-original-value');
        }
        el.innerHTML = '<span data-original-value="'+el.innerHTML+'" style="color:'+color+'" title="'+el.innerHTML+'">'+formatNumber(level)+'</span>';
    }

    var colorTalent = function(el, configs) {
        var talent = parseInt(el.innerHTML.replace('&nbsp;', ''));
        var colorUp = GRIS;
        var colorDown = GRIS;
        var percent = 50;
        for (var i in configs) {
            var config = configs[i];
            if (talent > config.min && talent <= config.max) {
                colorUp = config.u;
                colorDown = config.d;
                percent = Math.ceil((talent - config.min) / (config.max - config.min) * 100);
            }
        }
        var color = 'color-mix(in srgb, '+colorDown+', '+colorUp+' '+percent+'%)';
        el.style.color = color;
    }
    var colorLeekTalent = function(el) {
        colorTalent(el, [
            {'min':0, 'max': 100, 'd': GRIS, 'u': GRIS},
            {'min':100, 'max': 1000, 'd': GRIS, 'u': VERT},
            {'min':1000, 'max': 2000, 'd': VERT, 'u': BLEU},
            {'min':2000, 'max': 3000, 'd': BLEU, 'u': VIOLET},
            {'min':3000, 'max': 3500, 'd': VIOLET, 'u': ORANGE},
            {'min':3500, 'max': 10000, 'd': ORANGE, 'u': ORANGE},
        ]);
    }
    var colorFarmerTalent = function(el) {
        colorTalent(el, [
            {'min':0, 'max': 100, 'd': GRIS, 'u': GRIS},
            {'min':100, 'max': 1000, 'd': GRIS, 'u': VERT},
            {'min':1000, 'max': 3000, 'd': VERT, 'u': BLEU},
            {'min':3000, 'max': 5000, 'd': BLEU, 'u': VIOLET},
            {'min':5000, 'max': 8000, 'd': VIOLET, 'u': ORANGE},
            {'min':8000, 'max': 10000, 'd': ORANGE, 'u': ORANGE},
        ]);
    }

    // Boucle de chargement asynchrone de poireaux et éleveurs
    setInterval(function() {
        var el;
        var prefix;
        for (var id in leeksToLoad) {
            el = leeksToLoad[id].el;
            prefix = leeksToLoad[id].prefix;
            fetch('https://leekwars.com/api/leek/get/'+id)
            .then(function(response) {
                return response.json();
            })
                .then(function(myJson) {
                var capital = getCapitalFromJson(myJson);
                var level = getLevelFromCapital(capital);
                leeksCache[id] = {'c': capital, 'l': level, 'd': (new Date()).getTime()}
                if (el) {
                    displayLeekLevel(id, el, prefix);
                }
            });
            // interrupt
            delete leeksToLoad[id];
            return;
        }
        for (id in farmersToLoad) {
            el = farmersToLoad[id];
            fetch('	https://leekwars.com/api/farmer/get/'+id)
            .then(function(response) {
                return response.json();
            })
                .then(function(myJson) {
                var totalCapital = 0;
                var totalLevel = 0;
                for (var idLeek in myJson.farmer.leeks) {
                    var leek = myJson.farmer.leeks[idLeek];
                    var subCapital = getCapitalFromJson(leek);
                    totalCapital += subCapital;
                    totalLevel += getLevelFromCapital(subCapital);
                }
                farmersCache[id] = {'c': totalCapital, 'l': totalLevel, 'd': (new Date()).getTime()}
                if (el) {
                    displayFarmerLevel(id, el);
                }
            });
            // interrupt
            delete farmersToLoad[id];
            return;
        }
        // Si on fait rien, on regarde si on doit clean du local storage
        clearLocalStorage();
    }, 1000);


    var lastUrl = '';

    // boucle de verif d'update d'url + lancement selon la page
    setTimeout(function(){
        lastUrl = '';
        setInterval(function() {
            var newUrl = location.href;
            if (lastUrl !== newUrl)
            {
                lastUrl = newUrl;
                const regexRankingPaginationSolo = /ranking\/page-\d+/;
                const regexRankingPaginationSoloLeek = /ranking\/leek/;
                const regexRankingSoloLevel = /ranking\/level\-/;
                if (newUrl === 'https://leekwars.com/ranking' || regexRankingPaginationSolo.exec(newUrl) || regexRankingPaginationSoloLeek.exec(newUrl) || regexRankingSoloLevel.exec(newUrl)) {
                    console.log('Starting SOLO RANKING update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        document.querySelectorAll('table.ranking tr:not(.header)').forEach(function(row) {
                            var nameEl = row.querySelector('td:nth-child(2)');
                            var regexp = /="\/leek\/(\d+)/;
                            var id = regexp.exec(nameEl.innerHTML)[1];
                            var levelEl = row.querySelector('td:nth-child(4)');
                            displayLeekLevel(id, levelEl);
                            colorLeekTalent(row.querySelector('td:nth-child(3)'));
                        });
                    }, 1000);
                    return;
                }
                const regexRankingFarmer = /ranking\/farmer/;
                if (regexRankingFarmer.exec(newUrl)) {
                    console.log('Starting FARMER RANKING update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        document.querySelectorAll('table.ranking tr:not(.header)').forEach(function(row) {
                            var nameEl = row.querySelector('td:nth-child(2)');
                            var regexp = /="\/farmer\/(\d+)/;
                            var id = regexp.exec(nameEl.innerHTML)[1];
                            var levelEl = row.querySelector('td:nth-child(5)');
                            displayFarmerLevel(id, levelEl);
                            colorFarmerTalent(row.querySelector('td:nth-child(3)'));
                        });
                    }, 1000);
                    return;
                }
                const regexLeek = /leek\/(\d+)/;
                const regexFarmer = /\/farmer\/?(\d?)/;
                if (regexLeek.exec(newUrl)) {
                    var id = regexLeek.exec(newUrl)[1];
                    console.log('Starting LEEK '+id+' update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        document.querySelectorAll('h4.level').forEach(function(el) {
                            var levelRegex = /([^\d]+)(\d+)/;
                            var prefix = levelRegex.exec(el.innerText)[1];
                            displayLeekLevel(id, el, prefix);
                            colorLeekTalent(document.querySelector('.talent .value'));
                        });
                    }, 1000);
                    return;
                }
                const regexReport = /\/report\/(\d+)/;
                if (regexReport.exec(newUrl)) {
                    console.log('Starting REPORT update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        document.querySelectorAll('table.report tr').forEach(function(el) {
                            var link = el.querySelector('td.name a');
                            if (!link) return;
                            var id = regexLeek.exec(link.getAttribute('href'));
                            if (!id) return;
                            id = id[1];
                            displayLeekLevel(id, el.querySelector('.level'));
                        });
                        document.querySelectorAll('table.report tr.total').forEach(function(el) {
                            el.querySelector('.level').innerText = '---';
                        });
                    }, 1000);
                    return;
                }

                const regexTeam = /\/team/;
                if (regexTeam.exec(newUrl)) {
                    console.log('Starting TEAM update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        const button = document.querySelector('.load-rankings button');
                        if (button) {
                            var evObj = document.createEvent('Events');
                            evObj.initEvent('click', true, false);
                            button.dispatchEvent(evObj);
                        }
                        setTimeout(function() {
                            document.querySelectorAll('.rankings .column4:nth-child(1) .ranking > div:not(.header)').forEach(function(row) {
                                var link = row.querySelector('.p50 a');
                                if (!link) return;
                                var id = regexLeek.exec(link.getAttribute('href'));
                                if (!id) return;
                                id = id[1];
                                displayLeekLevel(id, row.querySelector('.p20:nth-child(4)'));
                                colorLeekTalent(row.querySelector('.p20:nth-child(3)'));
                            });

                            document.querySelectorAll('.rankings .column4:nth-child(2) .ranking > div:not(.header)').forEach(function(row) {
                                var link = row.querySelector('.p50 a');
                                if (!link) return;
                                var id = regexFarmer.exec(link.getAttribute('href'));
                                if (!id) return;
                                id = id[1];
                                colorFarmerTalent(row.querySelector('.p20:nth-child(3)'));
                            });

                            document.querySelectorAll('.leeks .leek').forEach(function(el) {
                                colorLeekTalent(el.querySelector('.talent .value'));
                            });
                            document.querySelectorAll('.members .farmer').forEach(function(el) {
                                colorFarmerTalent(el.querySelector('.talent .value'));
                            });
                        }, 500);
                    }, 1000);
                    return;
                }
                const gardenLeek = /garden\/solo/;
                const gardenFarmer = /garden\/farmer/;
                 if (gardenLeek.exec(newUrl) || gardenFarmer.exec(newUrl)) {
                    console.log('Starting GARDEN update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        setTimeout(function() {
                            document.querySelectorAll('.content .leek').forEach(function(el) {
                                console.log(el);
                                var levelRegex = /([^\d]+)(\d+)/;
                                var prefix = levelRegex.exec(el.querySelector('.level').innerText)[1];
                                //displayLeekLevel(id, el.querySelector('.level'), prefix);
                                colorLeekTalent(el.querySelector('.talent .value'));
                            });
                            document.querySelectorAll('.content .farmer').forEach(function(el) {
                                colorFarmerTalent(el.querySelector('.talent .value'));
                            });
                        }, 500);
                    }, 1000);
                    return;
                }

                if (regexFarmer.exec(newUrl)) {
                    console.log('Starting FARMER update...');
                    setTimeout(function() {
                        resetAllToLoad();
                        colorFarmerTalent(document.querySelector('.content.stats .talent .value'));
                        document.querySelectorAll('.leeks .leek').forEach(function(el) {
                            var id = regexLeek.exec(el.getAttribute('href'))[1];
                            var levelRegex = /([^\d]+)(\d+)/;
                            var prefix = levelRegex.exec(el.querySelector('.level').innerText)[1];
                            displayLeekLevel(id, el.querySelector('.level'), prefix);
                            colorLeekTalent(el.querySelector('.talent .value'));
                        });
                    }, 1000);
                    return;
                }
            }
        }, 500);
    }, 1000); // boucle de check de page

    const iconStyle = 'style="width: 20px; margin-left: 10px; margin-right: 10px; margin-top: -5px"';
    const settingsHTML = '<div style="position:fixed;top: 0;left 0;background: white;z-index: 999;padding: 5px;box-shadow: 0 0 5px black;">'
    +'<input id="trueLevelFullMode_cores" type="checkbox" name="trueLevelFullMode_cores" '+(SETTINGS.use_cores?'checked="checked"':'')+'/>'
    +'<label for="trueLevelFullMode_cores"><img src="/image/charac/cores.png" '+iconStyle+'/></label>'
    +'<input id="trueLevelFullMode_ram" type="checkbox" name="trueLevelFullMode_ram" '+(SETTINGS.use_ram?'checked="checked"':'')+'/>'
    +'<label for="trueLevelFullMode_ram"><img src="/image/charac/ram.png" '+iconStyle+'/></label>'
    +'<input id="trueLevelFullMode_frequency" type="checkbox" name="trueLevelFullMode_frequency" '+(SETTINGS.use_frequency?'checked="checked"':'')+'/>'
    +'<label for="trueLevelFullMode_frequency"><img src="/image/charac/frequency.png" '+iconStyle+'/></label>'
    +'</div>';
    document.querySelector('body').innerHTML += settingsHTML;
    document.querySelector('#trueLevelFullMode_cores').onchange = function() {
        SETTINGS.use_cores = document.querySelector('#trueLevelFullMode_cores').checked;
        saveSettings();
        clearLocalStorage(true);
        window.location.reload(true);
    };
    document.querySelector('#trueLevelFullMode_ram').onchange = function() {
        SETTINGS.use_ram = document.querySelector('#trueLevelFullMode_ram').checked;
        saveSettings();
        clearLocalStorage(true);
        window.location.reload(true);
    };
    document.querySelector('#trueLevelFullMode_frequency').onchange = function() {
        SETTINGS.use_frequency = document.querySelector('#trueLevelFullMode_frequency').checked;
        saveSettings();
        clearLocalStorage(true);
        window.location.reload(true);
    };
}());
