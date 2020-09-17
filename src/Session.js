import io from 'socket.io-client'
import wildcardMiddleware from 'socketio-wildcard'

import { zeaDebug } from './helpers/zeaDebug'

/**
 * User specific room actions.
 * @enum
 */
const private_actions = {
  JOIN_ROOM: 'join-room',
  PING_ROOM: 'ping-room',
  LEAVE_ROOM: 'leave-room',
}
/**
 * Session is used to store information about users and the communication method(Sockets).
 * <br>
 * Also has the actions to stream media.
 */
class Session {
  /**
   * Instantiates a new session object that contains user's data and the socketUrl that is going to connect to.
   * <br>
   * In the userData object you can pass any information you want, but you must provide an `id`.
   * In case you would like to use the [`zea-user-chip`](https://github.com/ZeaInc/zea-web-components/tree/staging/src/components/zea-user-chip) component,
   * some specific data will be required, although they are not mandatory, it would be nice to have:
   *
   * * **firstName** or **given_name**
   * * **lastName** or **family_name**
   * * **avatar** or **picture** - The URL to the image
   * * **color** - The RGBA hexadecimal string. i.e. #FFFFFF. (Random color in case you don't specify it)
   *
   * @param {object} userData - Specifies user's information
   * @param {string} socketUrl - Socket server you're connecting to.
   */
  constructor(userData, socketUrl) {
    this.userData = userData
    this.socketUrl = socketUrl
    this.users = {}
    this.userStreams = {}
    this.callbacks = {}

    this.envIsBrowser = typeof window !== 'undefined'
  }

  /**
   * Looks in the media stream tracks for an object that has the `kind` attribute to `video` and **disables** the first one in the list.
   *
   * @param {boolean} publish - Determines if the socket emits/publishes or not the `USER_VIDEO_STOPPED` event. **See:** [action](#action)
   */
  stopCamera(publish = true) {
    if (this.stream) {
      this.stream.getVideoTracks()[0].enabled = false
      if (publish) this.pub(Session.actions.USER_VIDEO_STOPPED, {})
    }
  }

  /**
   * Looks in the media stream tracks for an object that has the `kind` attribute to `video` and **enables** the first one in the list.
   *
   * @param {boolean} publish - Determines if the socket emits/publishes or not the `USER_VIDEO_STARTED` event. **See:** [action](#action)
   */
  startCamera(publish = true) {
    if (this.stream) {
      this.stream.getVideoTracks()[0].enabled = true
      if (publish) this.pub(Session.actions.USER_VIDEO_STARTED, {})
    }
  }

  /**
   * Looks in the media stream tracks for an object that has the `kind` attribute to `audio` and **disables** the first one in the list.
   *
   * @param {boolean} publish - Determines if the socket emits/publishes or not the `USER_AUDIO_STOPPED` event. **See:** [action](#action)
   */
  muteAudio(publish = true) {
    if (this.stream) {
      this.stream.getAudioTracks()[0].enabled = false
      if (publish) this.pub(Session.actions.USER_AUDIO_STOPPED, {})
    }
  }

  /**
   * Looks in the media stream tracks for an object that has the `kind` attribute to `audio` and **enables** the first one in the list.
   *
   * @param {boolean} publish - Determines if the socket emits/publishes or not the `USER_AUDIO_STARTED` event. **See:** [action](#action)
   */
  unmuteAudio(publish = true) {
    if (this.stream) {
      this.stream.getAudioTracks()[0].enabled = true
      if (publish) this.pub(Session.actions.USER_AUDIO_STARTED, {})
    }
  }

  /**
   * Returns the [HTMLVideoElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement) of requested user(If exists).
   *
   * @param {string | number} userId - User id specified in userData
   * @returns {MediaStream | undefined} - User's video stream
   */
  getVideoStream(userId) {
    return this.userStreams[userId]
  }

  /**
   * Creates the [HTMLVideoElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement) and adds it to the body.
   * The video will start playing as soon as the duration and dimensions of the media have been determined
   * <br>
   * In case the user already has a stream nothing would happend.
   *
   * @param {MediaStream | MediaSource | Blob | File} remoteStream
   * @param {string | number} userId
   */
  setVideoStream(remoteStream, userId) {
    if (this.userStreams[userId]) {
      return
    }

    const video = document.createElement('video')
    video.srcObject = remoteStream
    this.userStreams[userId] = video

    video.onloadedmetadata = () => {
      video.play()
    }

    document.body.appendChild(video)
  }

  /**
   * Checks if this Session's roomId is the same as the passed in the parameters.
   *
   * @param {boolean} roomId
   */
  isJoiningTheSameRoom(roomId) {
    return this.roomId === roomId
  }

  /**
   * Joins the user to a room and subscribes to all [private actions](#private_actions).
   * Also subscribes the user to a wildcard event that can recieve any custom action (Excluding private actions).
   * This is very useful when you wanna emit/publish custom events that are not in the pre-stablished custom [actions](#actions).
   * <br>
   * Emits/publishes the `JOIN_ROOM` event. **See:** [action](#action)
   *
   * @param {string | number} roomId - Room ID value
   */
  joinRoom(roomId) {
    this.roomId = roomId

    zeaDebug('Attempting connection to server "%s" and room id "%s"', this.socketUrl, this.roomId)

    /*
     * Socket actions.
     */
    this.leaveRoom()

    this.socket = io(this.socketUrl, {
      'sync disconnect on unload': true,
      query: `userId=${this.userData.id}&roomId=${this.roomId}`,
    })

    const patch = wildcardMiddleware(io.Manager)
    patch(this.socket)

    // Emit all messages, except the private ones.
    this.socket.on('*', (packet) => {
      const [messageType, message] = packet.data
      if (messageType in private_actions) return
      this._emit(messageType, message.payload, message.userId)
    })

    if (this.envIsBrowser) {
      window.addEventListener('beforeunload', () => {
        this.leaveRoom()
      })
    }

    this.pub(private_actions.JOIN_ROOM)

    this.socket.on(private_actions.JOIN_ROOM, (message) => {
      zeaDebug(`${private_actions.JOIN_ROOM}:\n%O`, message)

      // Note: reciprocate the ping so that all users are added.
      // This means that when USER_JOINED is emitted, the session
      // can immediately send messages to that user.
      // This addresses a race condition where remote avatars could not be configures
      // for users as soon as they were joined, because the user was not yet joined on
      // the other machines.
      this.pub(private_actions.PING_ROOM)

      const incomingUserData = message.userData
      this._addUserIfNew(incomingUserData)
    })

    this.socket.on(private_actions.LEAVE_ROOM, (message) => {
      zeaDebug(`${private_actions.LEAVE_ROOM}:\n%O`, message)

      const outgoingUserData = message.userData
      const outgoingUserId = outgoingUserData.id
      if (outgoingUserId in this.users) {
        delete this.users[outgoingUserId]
        this._emit(Session.actions.USER_LEFT, outgoingUserData)
        return
      }
      zeaDebug('Outgoing user was not found in room.')
    })

    this.socket.on(private_actions.PING_ROOM, (message) => {
      zeaDebug(`${private_actions.PING_ROOM}:\n%O`, message)

      const incomingUserData = message.userData
      this._addUserIfNew(incomingUserData)
    })

    /*
     * RTC
    const myPhoneNumber = `${this.roomId}${this.userData.id}`
    zeaDebug('myPhoneNumber:', myPhoneNumber)

    this.peer = new Peer(myPhoneNumber, {
      debug: 2,
    })

    // Receive calls.
    this.peer.on('call', mediaConnection => {
      this._prepareMediaStream()
        .then(() => {
          mediaConnection.answer(this.stream)
          mediaConnection.on('stream', remoteStream => {
            const remoteUserId = mediaConnection.peer.substring(
              mediaConnection.peer.length - 16
            )
            this.setVideoStream(remoteStream, remoteUserId)
          })
        })
        .catch(err => {
          zeaDebug('Failed to get local stream', err)
        })
    })

    this.peer.on('error', err => {
      zeaDebug('Peer error:', err)
    })

    window.addEventListener('beforeunload', () => {
      this.peer.destroy()
    })

    this.socket.on(private_actions.JOIN_ROOM, message => {
      const { userData: newUserData } = message.payload
      this._prepareMediaStream()
        .then(() => {

          // Make call to the user who just joined the room.
          const roommatePhoneNumber = `${this.roomId}${newUserData.id}`

          if (this.peer.disconnected) {
            zeaDebug('Peer disconnected. Reconnecting.')
            this.peer.reconnect()
          }

          const mediaConnection = this.peer.call(
            roommatePhoneNumber,
            this.stream
          )
          mediaConnection.on('stream', remoteStream => {
            this.setVideoStream(remoteStream, newUserData.id)
          })
        })
        .catch(err => {
          zeaDebug('Failed to get local stream', err)
        })
    })
     */
  }

  _prepareMediaStream() {
    if (this.__streamPromise) return this.__streamPromise
    this.__streamPromise = new window.Promise((resolve, reject) => {
      if (this.stream) {
        resolve()
        return
      }

      navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            width: 400,
            height: 300,
          },
        })
        .then((stream) => {
          this.stream = stream
          this.stopCamera(false)
          this.muteAudio(false)
          resolve()
        })
        .catch((err) => {
          reject(err)
        })
    })

    return this.__streamPromise
  }

  /**
   * Disconnects the user from his current room, emitting/publishing the `LEFT_ROOM` event. **See:** [action](#action)
   * <br>
   * If the socket exists then `USER_LEFT` will be also emitted, check [joinRoom](#joinRoom) method.
   */
  leaveRoom() {
    // Instruct Collab's clients to cleanup session user data.
    this._emit(Session.actions.LEFT_ROOM)
    this.users = {}
    // Notify room peers and close socket.
    if (this.socket) {
      this.pub(private_actions.LEAVE_ROOM, undefined, () => {
        this.socket.close()
      })
    }
  }

  _addUserIfNew(userData) {
    if (!(userData.id in this.users)) {
      this.users[userData.id] = userData

      this._emit(Session.actions.USER_JOINED, userData)
    }
  }

  /**
   * Returns userData for all the users in the session.
   */
  getUsers() {
    return this.users
  }

  /**
   * Returns the specific user information using the userId.
   *
   * @param {string| number} id - id specified in userData param.
   * @returns {object | undefined}
   */
  getUser(id) {
    return this.users[id]
  }

  /**
   * Emits/Publishes an event action to the socket.
   *
   * @param {string} messageType - Represents the event action that is published
   * @param {any} payload - It could be anything that you want to send to other users
   * @param {function} ack - Function that will be called right after server response
   */
  pub(messageType, payload, ack) {
    if (!messageType) throw new Error('Missing messageType')

    const compactedUserData = { ...this.userData }

    if (messageType != 'join-room' && messageType != 'userChanged' && messageType != 'ping-room') {
      compactedUserData.avatar = null
      compactedUserData.picture = null
    }

    this.socket.emit(
      messageType,
      {
        userData: compactedUserData,
        userId: this.userData.id,
        payload,
      },
      ack
    )
  }

  _emit(messageType, payload, userId) {
    // If messages are recieved for users not actually in
    // the session, we can safely ignore them.
    // This can occur, if during the PING_ROOM, anoter message
    // is sent, like a mouseMove, which happens frequently.
    // In this case, the other users recieve a 'mouseMove' message
    // for a user they have not yet recieved the USER_JOINED message.
    if (userId && !this.users[userId]) {
      zeaDebug(`Ignoring message for user not in session: ${messageType}. User id: ${userId}`)
      return
    }

    const callbacks = this.callbacks[messageType]
    if (callbacks) {
      callbacks.forEach((callback) => callback(payload, userId))
    }
  }

  /**
   * Registers a new handler for a given event.
   * **Note:** The session can handle multiple callbacks for a single event.
   *
   * @param {string} messageType - Represents the event action subscribed to.
   * @param {function} callback - Recieves by parameters the payload sent by the publisher
   */
  sub(messageType, callback) {
    if (!messageType) throw new Error('Missing messageType')
    if (!callback) throw new Error('Missing callback')

    const callbacks = this.callbacks[messageType]
    this.callbacks[messageType] = this.callbacks[messageType] || []
    this.callbacks[messageType].push(callback)

    const unsub = () => {
      this.callbacks[messageType].splice(this.callbacks[messageType].indexOf(callback), 1)
    }

    return unsub
  }
}

/**
 * Represents Custom Default Events used by `Session` class.
 * @enum
 */
Session.actions = {
  USER_JOINED: 'user-joined',
  USER_VIDEO_STARTED: 'user-video-started',
  USER_VIDEO_STOPPED: 'user-video-stopped',
  USER_AUDIO_STARTED: 'user-audio-started',
  USER_AUDIO_STOPPED: 'user-audio-stopped',
  USER_LEFT: 'user-left',
  LEFT_ROOM: 'left-room',
  TEXT_MESSAGE: 'text-message',
  COMMAND_ADDED: 'command-added',
  COMMAND_UPDATED: 'command-updated',
  FILE_WITH_PROGRESS: 'file-with-progress',
}

export default Session
