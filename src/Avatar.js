import {
  Color,
  Vec3,
  Quat,
  Xfo,
  TreeItem,
  GeomItem,
  Material,
  Lines,
  Plane,
  Disc,
  Cuboid,
  Camera,
  LDRImage,
  Label,
  VideoStreamImage2D,
} from '@zeainc/zea-engine'

const up = new Vec3(0, 0, 1)

/**
 * Represents the state on steroids of a user in the session.
 */
class Avatar {
  /**
   * Initializes all the components of the Avatar like, user image, labels, tranformations, color, etc.
   * <br>
   * Contains a TreeItem property to which all the children items can be attached to. i.e. Camera.
   *
   * @param {object} appData - The appData value. Must contain the renderer
   * @param {object} userData - The userData value.
   * @param {boolean} currentUserAvatar - The currentUserAvatar value.
   */
  constructor(appData, userData, currentUserAvatar = false) {
    this.__appData = appData
    this.__userData = userData
    this.__currentUserAvatar = currentUserAvatar

    this.__treeItem = new TreeItem(this.__userData.id)
    this.__appData.renderer.addTreeItem(this.__treeItem)

    this.__avatarColor = new Color(userData.color || '#0000ff')
    this.__hilightPointerColor = this.__avatarColor

    this.__plane = new Plane(1, 1)
    this.__uiGeomIndex = -1

    if (!this.__currentUserAvatar) {
      this.__camera = new Camera()
      this.__cameraBound = false

      let avatarImage
      let geom = new Disc(0.5, 64)
      if (this.__userData.picture && this.__userData.picture != '') {
        avatarImage = new LDRImage('user' + this.__userData.id + 'AvatarImage')
        avatarImage.setImageURL(this.__userData.picture)
      } else {
        const firstName = this.__userData.name || this.__userData.given_name || ''
        const lastName = this.__userData.lastName || this.__userData.family_name || ''
        avatarImage = new Label('Name')
        avatarImage.getParameter('BackgroundColor').setValue(this.__avatarColor)
        avatarImage.getParameter('FontSize').setValue(42)
        avatarImage.getParameter('BorderRadius').setValue(0)
        avatarImage.getParameter('BorderWidth').setValue(0)
        avatarImage.getParameter('Margin').setValue(12)
        avatarImage.getParameter('StrokeBackgroundOutline').setValue(false)
        avatarImage.getParameter('Text').setValue(`${firstName.charAt(0)}${lastName.charAt(0)}`)

        avatarImage.on('labelRendered', (event) => {
          this.__avatarImageXfo.sc.set(0.15, 0.15, 1)
          this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)
        })
      }

      const avatarImageMaterial = new Material('user' + this.__userData.id + 'AvatarImageMaterial', 'FlatSurfaceShader')
      avatarImageMaterial.getParameter('BaseColor').setValue(this.__avatarColor)
      avatarImageMaterial.getParameter('BaseColor').setImage(avatarImage)

      avatarImageMaterial.visibleInGeomDataBuffer = false
      this.__avatarImageGeomItem = new GeomItem('avatarImage', geom, avatarImageMaterial)

      this.__avatarImageXfo = new Xfo()
      this.__avatarImageXfo.sc.set(0.2, 0.2, 1)
      this.__avatarImageXfo.ori.setFromAxisAndAngle(new Vec3(0, 1, 0), Math.PI)
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)

      ///////////////////////////////////////////////

      const avatarImageBorderMaterial = new Material('avatarImageBorderMaterial', 'FlatSurfaceShader')
      avatarImageBorderMaterial.getParameter('BaseColor').setValue(new Color(0, 0, 0, 1))
      avatarImageBorderMaterial.visibleInGeomDataBuffer = false
      const avatarImageBorderGeomItem = new GeomItem('avatarImageBorder', geom, avatarImageBorderMaterial)

      const borderXfo = new Xfo()
      borderXfo.sc.set(1.1, 1.1, 1.1)
      borderXfo.tr.set(0.0, 0.0, -0.001)
      avatarImageBorderGeomItem.getParameter('LocalXfo').setValue(borderXfo)
      this.__avatarImageGeomItem.addChild(avatarImageBorderGeomItem, false)
    }
  }

  /**
   * Usually called on `USER_VIDEO_STARTED` Session action this attaches the video MediaStream to the avatar cam geometry item.
   *
   * @param {MediaStream} video - The video param.
   */
  attachRTCStream(video) {
    if (!this.__avatarCamGeomItem) {
      const videoItem = new VideoStreamImage2D('webcamStream')
      videoItem.setVideoStream(video)

      this.__avatarCamMaterial = new Material('user' + this.__userData.id + 'AvatarImageMaterial', 'FlatSurfaceShader')
      this.__avatarCamMaterial.getParameter('BaseColor').setValue(this.__avatarColor)
      this.__avatarCamMaterial.getParameter('BaseColor').setImage(videoItem)
      this.__avatarCamMaterial.visibleInGeomDataBuffer = false
      this.__avatarCamGeomItem = new GeomItem('avatarImage', this.__plane, this.__avatarCamMaterial)

      const sc = 0.02
      this.__avatarCamXfo = new Xfo()
      this.__avatarCamXfo.sc.set(16 * sc, 9 * sc, 1)
      this.__avatarCamXfo.tr.set(0, 0, -0.1 * sc)
      this.__avatarCamGeomItem.getParameter('LocalXfo').setValue(this.__avatarCamXfo)

      const aspect = video.videoWidth / video.videoHeight
      this.__avatarCamXfo.sc.x = this.__avatarCamXfo.sc.y * aspect
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarCamXfo)
    }

    if (this.__currentViewMode == 'CameraAndPointer') {
      this.__treeItem.getChild(0).removeAllChildren()
      this.__treeItem.getChild(0).addChild(this.__avatarCamGeomItem, false)
    }
  }

  /**
   * As opposite of the `attachRTCStream` method, this is usually called on `USER_VIDEO_STOPPED` Session action, removing the RTC Stream from the treeItem
   */
  detachRTCStream() {
    if (this.__currentViewMode == 'CameraAndPointer') {
      this.__treeItem.getChild(0).removeAllChildren()

      const sc = 0.02
      this.__avatarImageXfo.sc.set(9 * sc, 9 * sc, 1)
      this.__avatarImageXfo.tr.set(0, 0, -0.1 * sc)
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)
      this.__treeItem.getChild(0).addChild(this.__avatarImageGeomItem, false)
    }
  }

  /**
   * Returns Avatar's Camera tree item.
   *
   * @return {Camera} The return value.
   */
  getCamera() {
    return this.__camera
  }

  /**
   * Traverses Camera's sibling items and hide them, but shows Camera item.
   */
  bindCamera() {
    this.__cameraBound = true

    const cameraOwner = this.__camera.getOwner()
    if (cameraOwner) {
      cameraOwner.traverse((subTreeItem) => {
        if (subTreeItem != this.__camera) subTreeItem.setVisible(false)
      })
    }
  }

  /**
   * Traverses Camera's sibling items and show them, but hides Camera item.
   */
  unbindCamera() {
    this.__cameraBound = false

    const cameraOwner = this.__camera.getOwner()
    if (cameraOwner) {
      cameraOwner.traverse((subTreeItem) => {
        if (subTreeItem != this.__camera) subTreeItem.setVisible(true)
      })
    }
  }

  /**
   * The setCameraAndPointerRepresentation method.
   * @private
   */
  setCameraAndPointerRepresentation() {
    this.__treeItem.removeAllChildren()
    this.__currentViewMode = 'CameraAndPointer'

    if (this.__currentUserAvatar) return
    const sc = 0.02
    const shape = new Cuboid(16 * sc, 9 * sc, 3 * sc, true) // 16:9
    const pinch = new Vec3(0.1, 0.1, 1)

    {
      const positions = shape.getVertexAttribute('positions')
      positions.getValueRef(0).multiplyInPlace(pinch)
      positions.getValueRef(1).multiplyInPlace(pinch)
      positions.getValueRef(2).multiplyInPlace(pinch)
      positions.getValueRef(3).multiplyInPlace(pinch)
    }

    shape.computeVertexNormals()
    const material = new Material('user' + this.__userData.id + 'Material', 'SimpleSurfaceShader')
    material.visibleInGeomDataBuffer = false
    material.getParameter('BaseColor').setValue(new Color(0.5, 0.5, 0.5, 1.0))
    const geomItem = new GeomItem('camera', shape, material)
    const geomXfo = new Xfo()
    geomItem.setGeomOffsetXfo(geomXfo)

    const line = new Lines()
    line.setNumVertices(2)
    line.setNumSegments(1)
    line.setSegmentVertexIndices(0, 0, 1)

    {
      const positions = line.getVertexAttribute('positions')
      positions.getValueRef(0).set(0.0, 0.0, 0.0)
      positions.getValueRef(1).set(0.0, 0.0, 1.0)
    }
    line.setBoundingBoxDirty()
    this.pointerXfo = new Xfo()
    this.pointerXfo.sc.set(1, 1, 0)

    this.__pointermat = new Material('pointermat', 'LinesShader')
    this.__pointermat.getParameter('BaseColor').setValue(this.__avatarColor)

    this.__pointerItem = new GeomItem('Pointer', line, this.__pointermat)
    this.__pointerItem.getParameter('LocalXfo').setValue(this.pointerXfo)

    // If the webcam stream is available, attach it
    // else attach the avatar image. (which should always be available)
    if (this.__avatarCamGeomItem) {
      geomItem.addChild(this.__avatarCamGeomItem, false)
    } else if (this.__avatarImageGeomItem) {
      this.__avatarImageXfo.sc.set(9 * sc, 9 * sc, 1)
      this.__avatarImageXfo.tr.set(0, 0, -0.1 * sc)
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)
      geomItem.addChild(this.__avatarImageGeomItem, false)
    }

    if (this.__audioItem) {
      geomItem.addChild(this.__audioItem, false)
    }

    this.__treeItem.addChild(geomItem, false)
    this.__treeItem.addChild(this.__pointerItem, false)

    this.__treeItem.addChild(this.__camera, false)
    if (this.__cameraBound) {
      geomItem.setVisible(false)
    }
  }

  /**
   * The updateCameraAndPointerPose method.
   * @param {object} data - The data param.
   * @private
   */
  updateCameraAndPointerPose(data) {
    if (this.__currentUserAvatar) return

    if (data.viewXfo) {
      if (data.focalDistance) {
        // After 10 meters, the avatar scales to avoid getting too small.
        const sc = data.focalDistance / 5
        if (sc > 1) data.viewXfo.sc.set(sc, sc, sc)
      }
      this.__treeItem.getChild(0).getParameter('LocalXfo').setValue(data.viewXfo)
      this.pointerXfo.sc.z = 0
      this.__treeItem.getChild(1).getParameter('LocalXfo').setValue(this.pointerXfo)
    } else if (data.movePointer) {
      this.pointerXfo.tr = data.movePointer.start
      this.pointerXfo.ori.setFromDirectionAndUpvector(data.movePointer.dir, up)
      this.pointerXfo.sc.z = data.movePointer.length
      this.__treeItem.getChild(1).getParameter('LocalXfo').setValue(this.pointerXfo)
    } else if (data.hilightPointer) {
      this.__pointermat.getParameter('BaseColor').setValue(this.__hilightPointerColor)
    } else if (data.unhilightPointer) {
      this.__pointermat.getParameter('BaseColor').setValue(this.__avatarColor)
    } else if (data.hidePointer) {
      this.pointerXfo.sc.z = 0
      this.__treeItem.getChild(1).getParameter('LocalXfo').setValue(this.pointerXfo)
    }
  }

  /**
   * The setVRRepresentation method.
   * @param {object} data - The data param.
   * @private
   */
  setVRRepresentation(data) {
    this.__treeItem.removeAllChildren()
    this.__currentViewMode = 'VR'

    const hmdHolder = new TreeItem('hmdHolder')
    if (this.__audioItem) {
      hmdHolder.addChild(this.__audioItem)
    }

    if (this.__avatarImageGeomItem) {
      this.__avatarImageXfo.sc.set(0.12, 0.12, 1)
      this.__avatarImageXfo.tr.set(0, -0.04, -0.135)
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)
      hmdHolder.addChild(this.__avatarImageGeomItem, false)
    }

    this.__treeItem.addChild(hmdHolder)

    if (this.__camera) hmdHolder.addChild(this.__camera, false)

    if (this.__hmdGeomItem) {
      if (!this.__currentUserAvatar) hmdHolder.addChild(this.__hmdGeomItem, false)
      if (this.__cameraBound) {
        this.__hmdGeomItem.setVisible(false)
      }
    } else {
      const resourceLoader = this.__appData.scene.getResourceLoader()

      let assetPath
      switch (data.hmd) {
        case 'Vive':
          assetPath = 'ZeaEngine/Vive.vla'
          break
        case 'Oculus':
          assetPath = 'ZeaEngine/Oculus.vla'
          break
        default:
          assetPath = 'ZeaEngine/Vive.vla'
          break
      }

      if (!this.__vrAsset) {
        const hmdAssetId = resourceLoader.resolveFilePathToId(assetPath)
        if (hmdAssetId) {
          this.__vrAsset = this.__appData.scene.loadCommonAssetResource(hmdAssetId)
          this.__vrAsset.on('geomsLoaded', () => {
            const materialLibrary = this.__vrAsset.getMaterialLibrary()
            const materialNames = materialLibrary.getMaterialNames()
            for (const name of materialNames) {
              const material = materialLibrary.getMaterial(name, false)
              if (material) {
                material.visibleInGeomDataBuffer = false
                material.setShaderName('SimpleSurfaceShader')
              }
            }

            if (!this.__currentUserAvatar) {
              const hmdGeomItem = this.__vrAsset.getChildByName('HMD').clone()
              const xfo = hmdGeomItem.getLocalXfo()
              xfo.tr.set(0, -0.03, -0.03)
              xfo.ori.setFromAxisAndAngle(new Vec3(0, 1, 0), Math.PI)
              xfo.sc.set(0.001) // VRAsset units are in mm. convert meters
              hmdGeomItem.getParameter('LocalXfo').setValue(xfo)

              this.__hmdGeomItem = hmdGeomItem

              if (this.__cameraBound) {
                this.__hmdGeomItem.setVisible(false)
              }
              hmdHolder.addChild(this.__hmdGeomItem, false)
            }
          })
        }
      }
    }

    this.__controllerTrees = []
  }

  /**
   * The updateVRPose method.
   * @param {object} data - The data param.
   * @private
   */
  updateVRPose(data) {
    const setupController = (i) => {
      if (this.__controllerTrees[i]) {
        this.__treeItem.addChild(this.__controllerTrees[i], false)
      } else {
        const treeItem = new TreeItem('handleHolder' + i)
        this.__controllerTrees[i] = treeItem
        this.__treeItem.addChild(this.__controllerTrees[i], false)

        const setupControllerGeom = () => {
          let srcControllerTree
          if (i == 0) srcControllerTree = this.__vrAsset.getChildByName('LeftController')
          else if (i == 1) srcControllerTree = this.__vrAsset.getChildByName('RightController')
          if (!srcControllerTree) srcControllerTree = this.__vrAsset.getChildByName('Controller')
          const controllerTree = srcControllerTree.clone()
          const xfo = new Xfo(
            new Vec3(0, -0.035, -0.085),
            new Quat({
              setFromAxisAndAngle: [new Vec3(0, 1, 0), Math.PI],
            }),
            new Vec3(0.001, 0.001, 0.001) // VRAsset units are in mm. convert meters
          )
          controllerTree.getParameter('LocalXfo').setValue(xfo)
          treeItem.addChild(controllerTree, false)
        }
        this.__vrAsset.on('geomsLoaded', () => {
          setupControllerGeom()
        })
      }
    }

    if (data.viewXfo) this.__treeItem.getChild(0).getParameter('GlobalXfo').setValue(data.viewXfo)

    if (data.controllers) {
      for (let i = 0; i < data.controllers.length; i++) {
        if (data.controllers[i] && !this.__controllerTrees[i]) {
          setupController(i)
        }
        this.__controllerTrees[i].getParameter('GlobalXfo').setValue(data.controllers[i].xfo)
      }
    }
    if (data.showUIPanel) {
      if (!this.__uiGeomItem) {
        const uimat = new Material('uimat', 'FlatSurfaceShader')
        uimat.getParameter('BaseColor').setValue(this.__avatarColor)

        this.__uiGeomOffsetXfo = new Xfo()
        this.__uiGeomOffsetXfo.sc.set(data.showUIPanel.size.x, data.showUIPanel.size.y, 1)
        // Flip it over so we see the front.
        this.__uiGeomOffsetXfo.ori.setFromAxisAndAngle(new Vec3(0, 1, 0), Math.PI)

        this.__uiGeomItem = new GeomItem('VRControllerUI', this.__plane, uimat)
        this.__uiGeomItem.setGeomOffsetXfo(this.__uiGeomOffsetXfo)

        const localXfo = new Xfo()
        localXfo.fromJSON(data.showUIPanel.localXfo)
        this.__uiGeomItem.getParameter('LocalXfo').setValue(localXfo)
      }
      this.__uiGeomIndex = this.__controllerTrees[data.showUIPanel.controllerId].addChild(this.__uiGeomItem, false)
    } else if (data.updateUIPanel) {
      if (this.__uiGeomItem) {
        this.__uiGeomOffsetXfo.sc.set(data.updateUIPanel.size.x, data.updateUIPanel.size.y, 1)
        this.__uiGeomItem.setGeomOffsetXfo(this.__uiGeomOffsetXfo)
      }
    } else if (data.hideUIPanel) {
      if (this.__uiGeomIndex >= 0) {
        this.__controllerTrees[data.hideUIPanel.controllerId].removeChild(this.__uiGeomIndex)
        this.__uiGeomIndex = -1
      }
    }
  }

  /**
   * Method that executes the representation methods for the specified `interfaceType` in the data object.
   * <br>
   * Valid `interfaceType` values: `CameraAndPointer`, `Vive` and `VR`
   *
   * @param {object} data - The data param.
   */
  updatePose(data) {
    switch (data.interfaceType) {
      case 'CameraAndPointer':
        if (this.__currentViewMode !== 'CameraAndPointer') {
          this.setCameraAndPointerRepresentation()
        }
        this.updateCameraAndPointerPose(data)
        break
      case 'Vive': // Old recordings.
      case 'VR':
        if (this.__currentViewMode !== 'VR') {
          this.setVRRepresentation(data)
        }
        this.updateVRPose(data)
        break
    }
  }

  /**
   * Removes Avatar's TreeItem from the renderer.
   */
  destroy() {
    this.__appData.renderer.removeTreeItem(this.__treeItem)
  }
}

export default Avatar
