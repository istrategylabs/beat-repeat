import { scheduler, bufferLoader, updateCurrentPlaying, togglePlaying } from './lib/scheduler'

const lookahead = 25 // ms
let interval

const beatRepeat = {
  init: () => {
    interval = setInterval(() => {
      scheduler()
    }, lookahead)
  },
  halt: () => {
    if (interval) {
      clearInterval(interval)
    }
  },
  load: (name, url) => bufferLoader(name, url),
  update: currentPlaying => {
    updateCurrentPlaying(currentPlaying)
  },
  play: play => {
    togglePlaying(play)
  },
}

export default beatRepeat
