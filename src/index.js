import { libsRegistry } from '@zeainc/zea-engine'

import pkg from '../package.json'

libsRegistry.registerLib(pkg)

import Session from './Session'
import SessionFactory from './SessionFactory'
import SessionRecorder from './SessionRecorder'

import Avatar from './Avatar'
import SessionSync from './SessionSync'

export { Session, SessionFactory, SessionRecorder, Avatar, SessionSync }
