const audioCtx = new AudioContext()

const masterGain = audioCtx.createGain()
masterGain.connect(audioCtx.destination)
masterGain.gain.value = 1

// storage for raw audio buffers to be used with AudioBufferSourceNodes
const buffers = {}
// storage for current and future sources, arrays of sources keyed by buffer name
const liveSources = {}

function storeBuffer(name, buffer) {
  buffers[name] = {}
  buffers[name].buffer = buffer
}

export const bufferLoader = (name, url) => new Promise((resolve, reject) => {
  // get audio file
  fetch(url)
  .then(res => {
    // convert to array buffer
    res.arrayBuffer().then(buffer => {
      try {
        // decode data
        audioCtx.decodeAudioData(buffer, decodedData => {
          storeBuffer(name, decodedData)
          resolve(name)
        })
      } catch (error) {
        reject(error)
      }
    }, error => {
      reject(error)
    })
  })
})

function addLiveSource(name, source) {
  if (liveSources[name]) {
    liveSources[name].push(source)
  } else {
    liveSources[name] = [source]
  }
}

const removeLiveSource = name => {
  liveSources[name].forEach(source => {
    source.disconnect()
    source.stop()
  })
  delete liveSources[name]
}

const pruneLiveSources = () => {
  // if we have live sources not in currently playing
  // kill those sources
  const liveNames = Object.keys(liveSources)
  const deadSources = liveNames.filter(name => currentPlaying.indexOf(name) === -1)
  deadSources.forEach(removeLiveSource)
}

const playSoundSource = (name, when, offset = 0) => {
  const buffer = buffers[name].buffer
  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.connect(masterGain)
  try {
    source.start(when, offset)
    addLiveSource(name, source)
  } catch (error) {
    // catches InvalidStateError for offset < 0, only happens when sound is
    // immediately scheduled within the scheduleAheadTime to nextSoundTime
  }
}

// code derived from http://is.gd/LY0TYf
const scheduleAheadTime = 0.1 // sec
const sampleDuration = 16     // sec
let nextSoundTime = 0.0 // sec
let iterations = 0
let isScheduling = false
let currentPlaying = []

function nextSound() {
  nextSoundTime = nextSoundTime += sampleDuration
  pruneLiveSources()
  iterations++
}

// Chrome and Firefox report different durations for audio files, subtract 1 sec
// from the duration to ensure tracks are always under 16 sec
function isBeat(duration) {
  return (duration - 1) > sampleDuration
}

function isOddIteration(immediate = false) {
  let isOdd
  if (immediate) {
    // iterations is always 1 ahead because of previous scheduling
    isOdd = (iterations - 1) % 2 === 1
  } else {
    isOdd = iterations % 2 === 1
  }

  return isOdd
}

function scheduleSounds(when) {
  currentPlaying.forEach(name => {
    // if iteration is odd, dont auto schedule a beat since it will double up
    // beacuse of their 32s durations
    const bufferDuration = buffers[name].buffer.duration
    if (isBeat(bufferDuration) && isOddIteration()) {
      return
    }

    playSoundSource(name, when)
    // console.log(`play ${name}, -> when ${when}, offset 0`)
  })
}

function scheduleImmediateSounds() {
  // if we dont have current playing in live
  // add new live source with offset
  const liveNames = Object.keys(liveSources)
  const newSounds = currentPlaying.filter(name => {
    if (liveNames.indexOf(name) === -1) {
      return name
    }
    return undefined
  })

  let offset = sampleDuration - (nextSoundTime - audioCtx.currentTime)
  return newSounds.forEach(name => {
    // if beat and we're in an odd iteration, add 16 to offset to advance to 2nd half of beat
    const bufferDuration = buffers[name].buffer.duration
    if (isBeat(bufferDuration) && isOddIteration('immediate')) {
      offset = offset + sampleDuration
    }

    playSoundSource(name, audioCtx.currentTime, offset)
    // console.log(`play immediate ${name}, -> when ${audioCtx.currentTime}, offset ${offset}`)
  })
}

export const scheduler = () => {
  isScheduling = true

  while (nextSoundTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleSounds(nextSoundTime)
    nextSound()
  }
}

export const updateCurrentPlaying = (update) => {
  currentPlaying = update
  if (isScheduling) {
    pruneLiveSources()
    scheduleImmediateSounds()
  }
}

export const togglePlaying = (playing) => {
  try {
    if (playing) {
      audioCtx.resume()
    } else {
      audioCtx.suspend()
    }
  } catch (error) {
    // catches TypeError: Object doesn't support property or method 'suspend'
    // on Edge
  }
}
