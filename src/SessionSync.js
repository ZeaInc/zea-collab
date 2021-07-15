import { Vec2 } from '@zeainc/zea-engine'
import { UndoRedoManager, SelectionManager } from '@zeainc/zea-ux'

import Session from './Session.js'
import Avatar from './Avatar.js'
import { convertValuesToJSON, convertValuesFromJSON } from './convertJSON.js'

/**
 * Helper class with default session sync behaviour
 */
class SessionSync {
  /**
   * All default behaviours for session sub actions are defined here.
   * You can use this as a guide or as the starter configuration for sub actions.
   *
   * @see [Session](api/Session.md)
   * @param {Session} session - The session value.
   * @param {object} appData - The appData value.
   * @param {object} currentUser - The currentUser value.
   * @param {object} options - The options object can contain additional arguments.
   *  avatarScale
   *  scaleAvatarWithFocalDistance - To disable avatar scaling, pass as false.
   */
  constructor(session, appData, currentUser, options = {}) {
    // const currentUserAvatar = new Avatar(appData, currentUser, true);

    this.session = session
    this.appData = appData

    this.userDatas = {}

    const sendCurrentPose = () => {
      // Emit an event to configure remote avatars to the current camera transform.
      const camera = appData.renderer.getViewport().getCamera()
      session.pub(
        'poseChanged',
        convertValuesToJSON({
          interfaceType: 'CameraAndPointer',
          viewXfo: camera.getParameter('GlobalXfo').getValue(),
          focalDistance: camera.getParameter('focalDistance').getValue(),
        })
      )
    }

    session.sub(Session.actions.USER_JOINED, (userData) => {
      if (!(userData.id in this.userDatas)) {
        const avatarScaleRange = !options.scaleAvatarWithFocalDistance
          ? [options.avatarScale, options.avatarScale]
          : options.avatarScaleRange
        this.userDatas[userData.id] = {
          undoRedoManager: new UndoRedoManager(),
          avatar: new Avatar(appData, userData, false, options.avatarScale, options.scaleAvatarWithFocalDistance),
          selectionManager: new SelectionManager(appData, {
            ...options,
            enableXfoHandles: false,
            setItemsSelected: false,
          }),
        }

        // Send our pose to the new user to update our avatar in their view.
        if (appData.renderer) {
          sendCurrentPose()
        }
      }
    })
    session.sub(Session.actions.USER_LEFT, (userData) => {
      if (!this.userDatas[userData.id]) {
        console.warn('User id not in session:', userData.id)
        return
      }
      this.userDatas[userData.id].avatar.destroy()
      delete this.userDatas[userData.id]
    })

    // ///////////////////////////////////////////
    // Video Streams
    session.sub(Session.actions.USER_VIDEO_STARTED, (data, userId) => {
      if (!this.userDatas[userId]) {
        console.warn('User id not in session:', userId)
        return
      }
      const video = session.getVideoStream(userId)
      if (video) this.userDatas[userId].avatar.attachRTCStream(video)
    })

    session.sub(Session.actions.USER_VIDEO_STOPPED, (data, userId) => {
      if (!this.userDatas[userId]) {
        console.warn('User id not in session:', userId)
        return
      }
      console.log('USER_VIDEO_STOPPED:', userId, ' us:', currentUser.id)
      if (this.userDatas[userId].avatar) this.userDatas[userId].avatar.detachRTCStream(session.getVideoStream(userId))
    })

    // ///////////////////////////////////////////
    // Pose Changes
    if (appData.renderer) {
      const viewport = appData.renderer.getViewport()

      this.pointerDownId = viewport.on('pointerDown', (event) => {
        if (event.button == null || event.button == 0) {
          const data = {
            interfaceType: 'CameraAndPointer',
            highlightPointer: true,
          }
          session.pub('poseChanged', data)
        }
      })
      this.pointerUpId = viewport.on('pointerUp', (event) => {
        if (event instanceof TouchEvent) {
          session.pub('poseChanged', {
            interfaceType: 'CameraAndPointer',
            hidePointer: true,
          })
        } else {
          console.log("'pointerUp'")
          session.pub('poseChanged', {
            interfaceType: 'CameraAndPointer',
            unhighlightPointer: true,
          })
        }
      })
      this.pointerMoveId = viewport.on('pointerMove', (event) => {
        const intersectionData = event.viewport.getGeomDataAtPos(event.pointerPos, event.pointerRay)
        const rayLength = intersectionData ? intersectionData.dist : 5.0
        const data = {
          interfaceType: 'CameraAndPointer',
          movePointer: {
            start: event.pointerRay.start,
            dir: event.pointerRay.dir,
            length: rayLength,
          },
        }
        session.pub('poseChanged', convertValuesToJSON(data))
      })
      viewport.on('pointerLeave', (event) => {
        const data = {
          interfaceType: 'CameraAndPointer',
          hidePointer: true,
        }
        session.pub('poseChanged', data)
      })

      let tick = 0

      appData.renderer.on('viewChanged', (event) => {
        tick++
        const isVRView = event.interfaceType == 'VR'
        if (isVRView) {
          // only push every second pose of a vr stream.
          if (tick % 2 != 0) return
        }

        const data = {
          interfaceType: event.interfaceType,
          viewXfo: event.viewXfo,
        }
        if (event.focalDistance) {
          data.focalDistance = event.focalDistance
        } else if (isVRView) {
          data.hmd = event.hmd
          data.controllers = []
          for (const controller of event.controllers) {
            data.controllers.push({
              handedness: controller.getHandedness(),
              xfo: controller.getTreeItem().getParameter('GlobalXfo').getValue(),
            })
          }
        }

        // currentUserAvatar.updatePose(data);

        session.pub('poseChanged', convertValuesToJSON(data))
      })

      session.sub('poseChanged', (jsonData, userId) => {
        if (!this.userDatas[userId]) {
          console.warn('User id not in session:', userId)
          return
        }
        const data = convertValuesFromJSON(jsonData, appData.scene)
        const avatar = this.userDatas[userId].avatar
        avatar.updatePose(data)

        if (userId == this.followId) {
          // const delta = this.userDatas[userId].viewXfo.tr.subtract(data.viewXfo.tr)

          const viewport = this.appData.renderer.getViewport()
          const camera = viewport.getCamera()
          const ourViewXfo = camera.getParameter('GlobalXfo').getValue().clone()

          const movementDelta = data.viewXfo.tr.subtract(this.userDatas[userId].viewXfo.tr)
          ourViewXfo.tr.addInPlace(movementDelta)

          const target = data.viewXfo.tr.clone()
          target.z -= this.followZOffset
          const vecToGuide = target.subtract(ourViewXfo.tr)
          const currDist = vecToGuide.normalizeInPlace()
          // Now maintain our distance.
          if (currDist < this.followDist.x || currDist > this.followDist.y) {
            let newDist
            if (currDist < this.followDist.x) {
              newDist = (currDist - this.followDist.x) * 0.05
            } else if (currDist > this.followDist.y) {
              newDist = (currDist - this.followDist.y) * 0.05
            }
            const stepBack = vecToGuide.scale(newDist)
            ourViewXfo.tr.addInPlace(stepBack)
            camera.getParameter('focalDistance').setValue(newDist)
          }
          camera.getParameter('GlobalXfo').setValue(ourViewXfo)

          this.userDatas[userId].viewXfo = data.viewXfo
        } else {
          // Cache the view Xfo in case we need to follow this user.
          this.userDatas[userId].viewXfo = data.viewXfo
        }
      })

      sendCurrentPose()
    }

    // ///////////////////////////////////////////
    // Scene Changes
    const undoRedoManager = UndoRedoManager.getInstance()
    if (undoRedoManager) {
      const root = appData.scene.getRoot()
      undoRedoManager.on('changeAdded', (event) => {
        const { change } = event
        const context = {
          appData,
          makeRelative: (path) => path,
          resolvePath: (path, cb) => {
            // Note: Why not return a Promise here?
            // Promise evaluation is always async, so
            // all promises will be resolved after the current call stack
            // has terminated. In our case, we want all paths
            // to be resolved before the end of the function, which
            // we can handle easily with callback functions.
            if (!path) throw 'Path not specified'
            const item = root.resolvePath(path)
            if (item) {
              cb(item)
            } else {
              console.warn('Path unable to be resolved:' + path)
            }
          },
        }
        const data = {
          changeData: change.toJSON(context),
          changeClass: UndoRedoManager.getChangeClassName(change),
        }
        session.pub('change-added', data)
      })

      undoRedoManager.on('changeUpdated', (data) => {
        const jsonData = convertValuesToJSON(data)
        session.pub('change-updated', jsonData)

        // const changeData2 = convertValuesFromJSON(jsonData, appData.scene);
        // otherUndoStack.getCurrentChange().update(changeData2);
      })

      session.sub('change-added', (data, userId) => {
        // console.log("Remote Command added:", data.changeClass, userId)
        if (!this.userDatas[userId]) {
          console.warn('User id not in session:', userId)
          return
        }
        const undoRedoManager = this.userDatas[userId].undoRedoManager
        const change = undoRedoManager.constructChange(data.changeClass)

        const context = {
          appData: {
            selectionManager: this.userDatas[userId].selectionManager,
            scene: appData.scene,
          },
        }
        change.fromJSON(data.changeData, context)
        undoRedoManager.addChange(change)
      })

      session.sub('change-updated', (data, userId) => {
        if (!this.userDatas[userId]) {
          console.warn('User id not in session:', userId)
          return
        }
        const undoRedoManager = this.userDatas[userId].undoRedoManager
        const changeData = convertValuesFromJSON(data, appData.scene)
        const change = undoRedoManager.getCurrentChange()
        change.updateFromJSON(changeData)
      })

      // ///////////////////////////////////////////
      // Undostack Changes.
      // Synchronize undo stacks between users.

      undoRedoManager.on('changeUndone', () => {
        session.pub('UndoRedoManager_changeUndone', {})
      })

      session.sub('UndoRedoManager_changeUndone', (data, userId) => {
        const undoRedoManager = this.userDatas[userId].undoRedoManager
        undoRedoManager.undo()
      })

      undoRedoManager.on('changeRedone', () => {
        session.pub('UndoRedoManager_changeRedone', {})
      })

      session.sub('UndoRedoManager_changeRedone', (data, userId) => {
        const undoRedoManager = this.userDatas[userId].undoRedoManager
        undoRedoManager.redo()
      })
    }

    // ///////////////////////////////////////////
    // Guided Tours
    this.session.sub('directAttention', (jsonData, userId) => {
      const data = convertValuesFromJSON(jsonData, this.appData.scene)
      const viewport = this.appData.renderer.getViewport()
      const cameraManipulator = viewport.getManipulator()
      cameraManipulator.orientPointOfView(
        viewport.getCamera(),
        data.position,
        data.target,
        data.distance,
        data.duration
      )
    })

    this.session.sub('followMe', (jsonData, userId) => {
      const data = convertValuesFromJSON(jsonData, this.appData.scene)
      this.followId = userId
      this.followDist = new Vec2(data.minDistance, data.maxDistance)
      this.followZOffset = -0.75

      const followUserXfo = this.userDatas[this.followId].viewXfo
      if (followUserXfo) {
        const duration = jsonData.duration ? jsonData.duration : 1000
        const target = followUserXfo.tr.clone()
        target.z += this.followZOffset
        const viewport = this.appData.renderer.getViewport()
        const cameraManipulator = viewport.getManipulator()
        const distance = (this.followDist.x + this.followDist.y) * 0.5
        cameraManipulator.aimFocus(viewport.getCamera(), target, distance, duration)
      }
    })

    this.session.sub('stopFollowingMe', (jsonData, userId) => {
      this.followId = -1
    })
  }

  /**
   * Starts synchronizing state changes between given state machines.
   *
   * @param {StateMachine} stateMachine - The state machine for each connected client is registered here.
   */
  syncStateMachines(stateMachine) {
    // ///////////////////////////////////////////
    // State Machine Changes.
    // Synchronize State Machine changes between users.
    stateMachine.on('stateChanged', (event) => {
      this.session.pub('StateMachine_stateChanged', {
        stateMachine: stateMachine.getPath(),
        stateName: event.name,
      })
    })

    this.session.sub('StateMachine_stateChanged', (data, userId) => {
      stateMachine.activateState(data.stateName)
    })
  }

  /**
   * Instructs all session users to look and face a given target, while maybe approaching the target.
   *
   * @param {Number} distance - The distance each member should adjust their positions relative to the target.
   * @param {Number} duration - The time to establish focus.
   */
  directAttention(position, target, distance, duration) {
    this.session.pub(
      'directAttention',
      convertValuesToJSON({
        position,
        target,
        distance,
        duration,
      })
    )
  }
}

export default SessionSync
