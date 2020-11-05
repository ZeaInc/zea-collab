import * as zeaEngine from '@zeainc/zea-engine'

import pkg from '../package.json'

const { libsRegistry } = zeaEngine

if (libsRegistry) {
  libsRegistry.registerLib(pkg)
} else {
  console.warn(
    "The version of the Zea Engine that you're using doesn't support the libraries registry. Please upgrade to the latest Zea Engine version."
  )
}

import Session from './Session'
import SessionFactory from './SessionFactory'
import SessionRecorder from './SessionRecorder'

import Avatar from './Avatar'
import SessionSync from './SessionSync'

export { Session, SessionFactory, SessionRecorder, Avatar, SessionSync }
