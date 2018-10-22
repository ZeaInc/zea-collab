import io from 'socket.io-client'
import shortid from 'shortid'

class VisualiveSession {
  constructor(token, userData) {
    this.token = token
    this.userData = userData

    this.users = {}
    this.callbacks = {}
  }

  joinRoom(projectId, fileId, roomId) {
    this.projectId = projectId
    this.fileId = fileId
    this.roomId = roomId

    this.fullRoomId = projectId + fileId + (roomId || '')

    /*
     * Phone actions.
     */
    const myPhoneNumber = this.fullRoomId + this.userData.id
    console.info('myPhoneNumber:', myPhoneNumber)
    this.phone = PHONE({
      media: { audio: false, video: false },
      number: myPhoneNumber,
      publish_key: 'pub-c-c632ffe7-eecd-4ad0-8cc2-6ecc47c17625',
      subscribe_key: 'sub-c-78f93af8-cc85-11e8-bbf2-f202706b73e5',
    })

    this.phone.receive(session => {
      session.connected(session => {
        console.info('Received call from:', session.number)
        const $mediaWrapper = document.getElementById('mediaWrapper')
        $mediaWrapper.appendChild(session.video)
      })
    })

    this.phone.message((session, message) => {
      // console.group('Phone message:')
      // console.info('Session:')
      // console.dir(session)
      // console.info('Message:')
      // console.dir(message)
      // console.groupEnd()

      const { type: messageType, userId } = message
      this._publishMessage(messageType, message.payload, message.userId)
    })

    /*
     * Socket actions.
     */
    this.socket && this.socket.close()

    this.socket = io(
      'https://apistage.visualive.io',
      // 'http://localhost:7070',
      {
        'sync disconnect on unload': true,
        query: `userId=${this.userData.id}&roomId=${this.fullRoomId}`,
      }
    )

    window.addEventListener('beforeunload', () => {
      this.socket.emit(VisualiveSession.actions.LEAVE_ROOM, {
        payload: {
          roomId: this.fullRoomId,
          userData: this.userData,
        },
      })
    })

    this.socket.on('disconnect', reason => {
      console.warn('Socket disconnected. Reason:', reason)
    })

    this.socket.once('connect', () => {
      this.socket.emit(VisualiveSession.actions.JOIN_ROOM, {
        payload: {
          roomId: this.fullRoomId,
          userData: this.userData,
        },
      })
    })

    this.socket.on(VisualiveSession.actions.USER_JOINED, message => {
      console.info('User joined:', message.payload)
      this.socket.emit(VisualiveSession.actions.PING_ROOM, {
        payload: {
          roomId: this.fullRoomId,
          userData: this.userData,
        },
      })

      const { userData } = message.payload
      this._addUserIfNew(userData)
    })

    this.socket.on(VisualiveSession.actions.USER_PING, message => {
      console.info('User ping:', message.payload)
      const { userData } = message.payload
      this._addUserIfNew(userData)
    })

    this.socket.on(VisualiveSession.actions.USER_LEFT, message => {
      console.info('User left:', message.payload)
      const userId = message.payload.userData.id
      if (userId in this.users) {
        const userData = this.users[userId]
        delete this.users[userId]
        this._publishMessage(
          VisualiveSession.actions.USER_LEFT,
          userData,
          userId
        )
      }
    })
  }

  _addUserIfNew(userData) {
    if (!(userData.id in this.users)) {
      this.users[userData.id] = userData

      const roommatePhoneNumber = this.fullRoomId + userData.id
      this.phone.ready(() => {
        this.phone.dial(roommatePhoneNumber)
      })

      this._publishMessage(
        VisualiveSession.actions.USER_JOINED,
        userData,
        userData.id
      )
    }
  }

  _publishMessage(messageType, payload, userId) {
    if (userId != this.userData.id) {
      const callbacks = this.callbacks[messageType]
      if (callbacks) {
        callbacks.forEach(callback => callback(payload, userId))
      }
    }
  }

  createRoom() {
    this.roomId = shortid.generate()
    this.joinRoom(this.projectId, this.fileId, this.roomId)

    window.history.pushState(
      null,
      null,
      `?project-id=${this.projectId}&file-id=${this.fileId}&room-id=${
        this.roomId
      }&token=${this.token}`
    )

    return this.roomId
  }

  getUsers() {
    return this.users
  }

  pub(messageType, payload) {
    this.phone.send({ userId: this.userData.id, type: messageType, payload })
  }

  sub(messageType, callback) {
    const callbacks = this.callbacks[messageType]
    this.callbacks[messageType] = callbacks
      ? callbacks.concat(callback)
      : [callback]
  }
}

VisualiveSession.actions = {
  JOIN_ROOM: 'join-room',
  USER_JOINED: 'user-joined',
  PING_ROOM: 'ping-room',
  USER_PING: 'user-ping',
  LEAVE_ROOM: 'leave-room',
  USER_LEFT: 'user-left',
  TEXT_MESSAGE: 'text-message',
  POSE_CHANGED: 'pose-message',
  COMMAND_ADDED: 'command-added',
  COMMAND_UPDATED: 'command-updated',
}

export default VisualiveSession
