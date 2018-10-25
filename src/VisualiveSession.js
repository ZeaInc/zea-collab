import io from 'socket.io-client'
import wildcardMiddleware from 'socketio-wildcard'
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

    const patch = wildcardMiddleware(io.Manager)
    patch(this.socket)

    // Publish all messages.
    this.socket.on('*', packet => {
      const [messageType, message] = packet.data;
      if(messageType in private_actions)
        return;
      this._emit(messageType, message.payload, message.userId);
    })

    window.addEventListener('beforeunload', () => {
      this.socket.emit(private_actions.LEAVE_ROOM, {
        payload: {
          userData: this.userData,
        },
      })
      this.socket.close()
    })

    this.socket.once('connect', () => {
      this.socket.emit(private_actions.JOIN_ROOM, {
        payload: {
          userData: this.userData,
        },
      })
    })

    this.socket.on('disconnect', reason => {
      // console.warn('Socket disconnected. Reason:', reason)
    })

    this.socket.on(private_actions.JOIN_ROOM, message => {
      console.info('join-room:', message)
      this.socket.emit(private_actions.PING_ROOM, {
        payload: {
          userData: this.userData,
        }
      })
      const { userData } = message.payload
      this._addUserIfNew(userData)
    })

    this.socket.on(private_actions.LEAVE_ROOM, message => {
      const userData = message.payload.userData;
      console.info('leave-room:', message)
      if (!(userData.id in this.users)) {
        console.warn("User not in room.");
        return;
      }
      delete this.users[userData.id];
      this._emit(VisualiveSession.actions.USER_LEFT, userData);
    })

    this.socket.on(private_actions.PING_ROOM, message => {
      console.info('ping-room:', message)
      const { userData } = message.payload
      this._addUserIfNew(userData)
    })

    this.socket.on(private_actions.LEAVE_ROOM, message => {
      console.info('leave-room:', message)
      const userId = message.payload.userData.id
      if (userId in this.users) {
        const userData = this.users[userId]
        delete this.users[userId]
      }
    })
  }

  _addUserIfNew(userData) {
    if (!(userData.id in this.users)) {
      this.users[userData.id] = userData;

      const roommatePhoneNumber = this.fullRoomId + userData.id
      this.phone.ready(() => {
        this.phone.dial(roommatePhoneNumber)
      })

      this._emit(VisualiveSession.actions.USER_JOINED, userData);
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
  
  getUser(id) {
    return this.users[id];
  }

  pub(messageType, payload) {
    this.socket.emit(messageType, {
      userId: this.userData.id,
      payload: {
        userData: this.userData,
        ...payload,
      },
    })
  }

  _emit(messageType, payload, userId) {
    const callbacks = this.callbacks[messageType]
    if (callbacks) {
      callbacks.forEach(callback => callback(payload, userId))
    }
  }

  sub(messageType, callback) {
    const callbacks = this.callbacks[messageType]
    this.callbacks[messageType] = callbacks
      ? callbacks.concat(callback)
      : [callback]
  }
}


const private_actions = {
  JOIN_ROOM: 'join-room',
  PING_ROOM: 'ping-room',
  LEAVE_ROOM: 'leave-room'
}

VisualiveSession.actions = {
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  TEXT_MESSAGE: 'text-message',
  POSE_CHANGED: 'pose-message',
  COMMAND_ADDED: 'command-added',
  COMMAND_UPDATED: 'command-updated',
}

export default VisualiveSession
