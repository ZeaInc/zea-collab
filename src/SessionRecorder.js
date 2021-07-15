function genID() {
  // Math.random should be unique because of its seeding algorithm.
  // Convert it to base 36 (numbers + letters), and grab the first 9 characters
  // after the decimal.
  return '_' + Math.random().toString(36).substr(2, 9)
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max))
}

/**
 * Utility class that lets you record/play/download all the `pub` actions triggered on user's session.
 */
class SessionRecorder {
  /**
   * Initializes the state of the SessionRecorder object declaring the start and stop recording methods.
   *
   * @param {Session} session - An instance of the Session class.
   */
  constructor(session) {
    this.session = session
    this.__timeoutIds = {}
    this.__users = {}

    // TODO: Check for credentials on the user.
    {
      const pictures = ['https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png']

      const recording = {}
      const streamTimes = {}
      let recordingActive = false
      let presenter
      let pub
      let stream
      this.__startRecording = () => {
        if (recordingActive) return
        recordingActive = true
        const picIndex = getRandomInt(pictures.length)
        presenter = {
          id: genID(),
          picture: pictures[picIndex],
          name: 'Presenter' + Object.keys(recording).length,
        }

        stream = []
        let msg = {
          messageType: 'user-joined',
          payload: presenter,
        }
        const recordingStartTime = performance.now()
        let prev_t = recordingStartTime
        pub = this.session.pub
        this.session.pub = (messageType, payload) => {
          // Record the time since the previous
          // message and save it to the previous message.
          const t = performance.now()
          msg.ms = t - prev_t
          stream.push(msg)
          msg = {
            messageType,
            payload,
          }
          streamTimes[presenter.id] = t
          prev_t = t
          pub.call(this.session, messageType, payload)
        }
      }

      this.__stopRecording = () => {
        stream.push({
          messageType: 'user-left',
          payload: presenter,
        })

        recording[presenter.id] = stream

        this.session.pub = pub

        this.__playRecording(recording)
      }
    }
  }

  /**
   * Starts recording all the `pub` action methods triggered in user's session.
   */
  startRecording() {
    this.__startRecording()
  }

  /**
   * Stops the recording of all `pub` actions and starts playing the recording.
   */
  stopRecording() {
    this.__stopRecording()
  }

  __stopPlayback() {
    for (let key in this.__timeoutIds) clearTimeout(this.__timeoutIds[key])
    this.__timeoutIds = {}

    // Remove all the playback avatars
    for (let key in this.__users) {
      this.session._removeUser(this.__users[key])
    }
    this.__users = {}
  }

  __play(id, stream, done) {
    let i = 0
    const next = () => {
      const msg = stream[i]
      if (msg.messageType == 'user-joined') {
        this.session._addUserIfNew(msg.payload)
        // if (this.session.socket) {
        //   this.session.socket.emit('join-room', {
        //     userData: msg.payload,
        //   })
        // }

        this.__users[msg.payload.id] = msg.payload
      } else if (msg.messageType == 'user-left') {
        this.session._removeUser(msg.payload)
        // if (this.session.socket) {
        //   this.session.socket.emit('leave-room', {
        //     userData: msg.payload,
        //   })
        // }
      } else {
        this.session._emit(msg.messageType, msg.payload, id)
      }

      // Also broadcast this to other users so other users can view
      // the playback.
      // if (this.session.socket) {
      //   this.session.socket.emit(msg.messageType, {
      //     userData: {
      //       id,
      //     },
      //     userId: id,
      //     payload: msg.payload,
      //   })
      // }

      i++
      if (i < stream.length) {
        this.__timeoutIds[id] = setTimeout(next, msg.ms)
      } else {
        done()
      }
    }
    this.__timeoutIds[id] = setTimeout(next, 1000)
  }

  __playRecording(recording) {
    this.__stopPlayback()
    let count = 0
    for (let key in recording) {
      count++
      this.__play(key, recording[key], () => {
        count--
        if (count == 0) this.__playRecording(recording)
      })
    }
  }

  /**
   * Downloads the recorded data from an external url and starts playing it.
   * @param {string} url
   */
  downloadAndPlayRecording(url) {
    const file = this.__recordings[name]
    fetch(new Request(url)).then((response) => {
      if (response.ok) {
        response.json().then((recording) => {
          this.__playRecording(recording)
        })
      } else {
        throw new Error('404 Error: File not found.')
      }
    })
  }
}

export default SessionRecorder
