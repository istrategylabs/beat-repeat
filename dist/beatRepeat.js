(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.beatRepeat = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _scheduler = require('./lib/scheduler');

var lookahead = 25; // ms
var interval = void 0;

var beatRepeat = {
  init: function init() {
    interval = setInterval(function () {
      (0, _scheduler.scheduler)();
    }, lookahead);
  },
  halt: function halt() {
    if (interval) {
      clearInterval(interval);
    }
  },
  load: function load(name, url) {
    return (0, _scheduler.bufferLoader)(name, url);
  },
  update: function update(currentPlaying) {
    (0, _scheduler.updateCurrentPlaying)(currentPlaying);
  },
  play: function play(_play) {
    (0, _scheduler.togglePlaying)(_play);
  }
};

exports.default = beatRepeat;
module.exports = exports['default'];

},{"./lib/scheduler":2}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var audioCtx = new AudioContext();

var masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);
masterGain.gain.value = 1;

// storage for raw audio buffers to be used with AudioBufferSourceNodes
var buffers = {};
// storage for current and future sources, arrays of sources keyed by buffer name
var liveSources = {};

function storeBuffer(name, buffer) {
  buffers[name] = {};
  buffers[name].buffer = buffer;
}

var bufferLoader = exports.bufferLoader = function bufferLoader(name, url) {
  return new Promise(function (resolve, reject) {
    // get audio file
    fetch(url).then(function (res) {
      // convert to array buffer
      res.arrayBuffer().then(function (buffer) {
        try {
          // decode data
          audioCtx.decodeAudioData(buffer, function (decodedData) {
            storeBuffer(name, decodedData);
            resolve(name);
          });
        } catch (error) {
          reject(error);
        }
      }, function (error) {
        reject(error);
      });
    });
  });
};

function addLiveSource(name, source) {
  if (liveSources[name]) {
    liveSources[name].push(source);
  } else {
    liveSources[name] = [source];
  }
}

var removeLiveSource = function removeLiveSource(name) {
  liveSources[name].forEach(function (source) {
    source.disconnect();
    source.stop();
  });
  delete liveSources[name];
};

var pruneLiveSources = function pruneLiveSources() {
  // if we have live sources not in currently playing
  // kill those sources
  var liveNames = Object.keys(liveSources);
  var deadSources = liveNames.filter(function (name) {
    return currentPlaying.indexOf(name) === -1;
  });
  deadSources.forEach(removeLiveSource);
};

var playSoundSource = function playSoundSource(name, when) {
  var offset = arguments.length <= 2 || arguments[2] === undefined ? 0 : arguments[2];

  var buffer = buffers[name].buffer;
  var source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(masterGain);
  try {
    source.start(when, offset);
    addLiveSource(name, source);
  } catch (error) {
    // catches InvalidStateError for offset < 0, only happens when sound is
    // immediately scheduled within the scheduleAheadTime to nextSoundTime
  }
};

// code derived from http://is.gd/LY0TYf
var scheduleAheadTime = 0.1; // sec
var sampleDuration = 16; // sec
var nextSoundTime = 0.0; // sec
var iterations = 0;
var isScheduling = false;
var currentPlaying = [];

function nextSound() {
  nextSoundTime = nextSoundTime += sampleDuration;
  pruneLiveSources();
  iterations++;
}

// Chrome and Firefox report different durations for audio files, subtract 1 sec
// from the duration to ensure tracks are always under 16 sec
function isBeat(duration) {
  return duration - 1 > sampleDuration;
}

function isOddIteration() {
  var immediate = arguments.length <= 0 || arguments[0] === undefined ? false : arguments[0];

  var isOdd = void 0;
  if (immediate) {
    // iterations is always 1 ahead because of previous scheduling
    isOdd = (iterations - 1) % 2 === 1;
  } else {
    isOdd = iterations % 2 === 1;
  }

  return isOdd;
}

function scheduleSounds(when) {
  currentPlaying.forEach(function (name) {
    // if iteration is odd, dont auto schedule a beat since it will double up
    // beacuse of their 32s durations
    var bufferDuration = buffers[name].buffer.duration;
    if (isBeat(bufferDuration) && isOddIteration()) {
      return;
    }

    playSoundSource(name, when);
    // console.log(`play ${name}, -> when ${when}, offset 0`)
  });
}

function scheduleImmediateSounds() {
  // if we dont have current playing in live
  // add new live source with offset
  var liveNames = Object.keys(liveSources);
  var newSounds = currentPlaying.filter(function (name) {
    if (liveNames.indexOf(name) === -1) {
      return name;
    }
    return undefined;
  });

  var offset = sampleDuration - (nextSoundTime - audioCtx.currentTime);
  return newSounds.forEach(function (name) {
    // if beat and we're in an odd iteration, add 16 to offset to advance to 2nd half of beat
    var bufferDuration = buffers[name].buffer.duration;
    if (isBeat(bufferDuration) && isOddIteration('immediate')) {
      offset = offset + sampleDuration;
    }

    playSoundSource(name, audioCtx.currentTime, offset);
    // console.log(`play immediate ${name}, -> when ${audioCtx.currentTime}, offset ${offset}`)
  });
}

var scheduler = exports.scheduler = function scheduler() {
  isScheduling = true;

  while (nextSoundTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleSounds(nextSoundTime);
    nextSound();
  }
};

var updateCurrentPlaying = exports.updateCurrentPlaying = function updateCurrentPlaying(update) {
  currentPlaying = update;
  if (isScheduling) {
    pruneLiveSources();
    scheduleImmediateSounds();
  }
};

var togglePlaying = exports.togglePlaying = function togglePlaying(playing) {
  try {
    if (playing) {
      audioCtx.resume();
    } else {
      audioCtx.suspend();
    }
  } catch (error) {
    // catches TypeError: Object doesn't support property or method 'suspend'
    // on Edge
  }
};

},{}]},{},[1])(1)
});