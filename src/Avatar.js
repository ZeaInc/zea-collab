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
  VLAAsset,
} from '@zeainc/zea-engine'

const plane = new Plane(1, 1)
const disc = new Disc(0.5, 64)

/**
 * The Avatar is used to display a 3d representation of remote users in a 3d scene.
 */
class Avatar {
  /**
   * Initializes all the components of the Avatar like, user image, labels, transformations, color, etc.
   *
   * @param {object} appData - The appData value. Must contain the renderer
   * @param {object} userData - The userData value.
   * @param {boolean} currentUserAvatar - The currentUserAvatar value.
   * @param {float} avatarScale - The size of the avatar in the view
   * @param {float} scaleAvatarWithFocalDistance - To disable avatar scaling, pass as false.
   */
  constructor(appData, userData, currentUserAvatar = false, avatarScale = 1.0, scaleAvatarWithFocalDistance = false) {
    this.__appData = appData
    this.__userData = userData
    this.__currentUserAvatar = currentUserAvatar
    this.avatarScale = avatarScale
    this.scaleAvatarWithFocalDistance = scaleAvatarWithFocalDistance

    this.__treeItem = new TreeItem(this.__userData.id)
    this.__appData.renderer.addTreeItem(this.__treeItem)

    this.__avatarColor = new Color(userData.color || '#aaaaaa')
    this.__highlightPointerColor = new Color(1, 0, 0)

    this.__uiGeomIndex = -1

    if (!this.__currentUserAvatar) {
      this.__camera = new Camera()
      this.__cameraBound = false

      let avatarImage
      if (this.__userData.picture && this.__userData.picture != '') {
        avatarImage = new LDRImage('user' + this.__userData.id + 'AvatarImage')
        avatarImage.setImageURL(this.__userData.picture)
      } else {
        const firstName = this.__userData.firstName || this.__userData.given_name || ''
        const lastName = this.__userData.lastName || this.__userData.family_name || ''
        let firstLetter = ''
        let secondLetter = ''
        if (firstName) {
          firstLetter = firstName.charAt(0)
        }
        if (lastName) {
          secondLetter = lastName.charAt(0)
        } else if (firstLetter) {
          // if no last name but it does have a firstName,
          // use the firstName's second letter
          secondLetter = firstName.charAt(1)
        }
        avatarImage = new Label('Name')
        const isLightColor = this.__avatarColor.luminance() > 0.4
        if (isLightColor) {
          avatarImage.getParameter('FontColor').setValue(new Color(0, 0, 0))
        } else {
          avatarImage.getParameter('FontColor').setValue(new Color(1, 1, 1))
        }
        avatarImage.getParameter('BackgroundColor').setValue(this.__avatarColor)
        avatarImage.getParameter('FontSize').setValue(42)
        avatarImage.getParameter('BorderRadius').setValue(0)
        avatarImage.getParameter('BorderWidth').setValue(0)
        avatarImage.getParameter('Margin').setValue(12)
        avatarImage.getParameter('StrokeBackgroundOutline').setValue(false)
        avatarImage.getParameter('Text').setValue(String(firstLetter + secondLetter).toUpperCase())
      }

      const avatarImageMaterial = new Material('user' + this.__userData.id + 'AvatarImageMaterial', 'FlatSurfaceShader')
      avatarImageMaterial.getParameter('BaseColor').setValue(this.__avatarColor)
      avatarImageMaterial.getParameter('BaseColor').setImage(avatarImage)

      avatarImageMaterial.visibleInGeomDataBuffer = false
      this.__avatarImageGeomItem = new GeomItem('avatarImage', disc, avatarImageMaterial)

      this.__avatarImageXfo = new Xfo()
      this.__avatarImageXfo.sc.set(0.2, 0.2, 1)
      this.__avatarImageXfo.ori.setFromAxisAndAngle(new Vec3(0, 1, 0), Math.PI)
      this.__avatarImageGeomItem.getParameter('LocalXfo').setValue(this.__avatarImageXfo)

      {
        ///////////////////////////////////////////////
        // Nameplate

        const firstName = this.__userData.firstName || this.__userData.given_name || ''
        const lastName = this.__userData.lastName || this.__userData.family_name || ''
        const avatarNameplate = new Label('Name')
        const isLightColor = this.__avatarColor.luminance() > 0.4
        if (isLightColor) {
          avatarNameplate.getParameter('FontColor').setValue(new Color(0, 0, 0))
        } else {
          avatarNameplate.getParameter('FontColor').setValue(new Color(1, 1, 1))
        }
        avatarNameplate.getParameter('BackgroundColor').setValue(this.__avatarColor)
        avatarNameplate.getParameter('FontSize').setValue(42)
        avatarNameplate.getParameter('BorderRadius').setValue(0)
        avatarNameplate.getParameter('BorderWidth').setValue(0)
        avatarNameplate.getParameter('Margin').setValue(12)
        avatarNameplate.getParameter('StrokeBackgroundOutline').setValue(false)
        avatarNameplate.getParameter('Text').setValue(`${firstName} ${lastName}`)
        avatarNameplate.on('labelRendered', (event) => {
          const avatarNameplateXfo = this.avatarNameplateGeomItem.getParameter('LocalXfo').getValue()
          const height = event.height / event.width
          avatarNameplateXfo.sc.set(-1.5, height * 1.5, 1)
          this.avatarNameplateGeomItem.getParameter('LocalXfo').setValue(avatarNameplateXfo)
        })

        const avatarNameplateMaterial = new Material(
          'user' + this.__userData.id + 'AvatarImageMaterial',
          'FlatSurfaceShader'
        )
        // avatarNameplateMaterial.getParameter('BaseColor').setValue(this.__avatarColor)
        avatarNameplateMaterial.getParameter('BaseColor').setImage(avatarNameplate)
        avatarNameplateMaterial.visibleInGeomDataBuffer = false
        this.avatarNameplateGeomItem = new GeomItem('avatarNameplate', plane, avatarNameplateMaterial)

        this.__avatarImageGeomItem.addChild(this.avatarNameplateGeomItem, false)
      }

      ///////////////////////////////////////////////

      const avatarImageBorderMaterial = new Material('avatarImageBorderMaterial', 'FlatSurfaceShader')
      avatarImageBorderMaterial.getParameter('BaseColor').setValue(new Color(0, 0, 0, 1))
      avatarImageBorderMaterial.visibleInGeomDataBuffer = false
      const avatarImageBorderGeomItem = new GeomItem('avatarImageBorder', disc, avatarImageBorderMaterial)

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
      this.__avatarCamGeomItem = new GeomItem('avatarImage', plane, this.__avatarCamMaterial)

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
    material.getParameter('BaseColor').setValue(new Color(0.2, 0.2, 0.2, 1.0))
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

    if (this.avatarNameplateGeomItem) {
      const avatarNameplateXfo = this.avatarNameplateGeomItem.getParameter('LocalXfo').getValue()
      avatarNameplateXfo.tr.set(0, 0, -0.07)
      this.avatarNameplateGeomItem.getParameter('LocalXfo').setValue(avatarNameplateXfo)
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
      if (this.scaleAvatarWithFocalDistance && data.focalDistance) {
        // When closer than 5 meters, the avatar scales to avoid getting too small.
        const sc = (data.focalDistance / 5) * this.avatarScale
        data.viewXfo.sc.set(sc, sc, sc)
      }
      this.__treeItem.getChild(0).getParameter('LocalXfo').setValue(data.viewXfo)
      this.pointerXfo.sc.z = 0
      this.__treeItem.getChild(1).getParameter('LocalXfo').setValue(this.pointerXfo)

      this.viewXfo = data.viewXfo
      if (data.focalDistance) {
        this.focalDistance = data.focalDistance
      }
    } else if (data.movePointer) {
      this.pointerXfo.tr = data.movePointer.start
      this.pointerXfo.ori.setFromDirectionAndUpvector(data.movePointer.dir, new Vec3(0, 0, 1))
      this.pointerXfo.sc.z = data.movePointer.length
      this.__pointerItem.getParameter('LocalXfo').setValue(this.pointerXfo)
      this.__pointerItem.getParameter('Visible').setValue(true)
      this.__pointermat.getParameter('BaseColor').setValue(this.__avatarColor)
    } else if (data.highlightPointer) {
      this.__pointerItem.getParameter('Visible').setValue(true)
      this.__pointermat.getParameter('BaseColor').setValue(this.__highlightPointerColor)
    } else if (data.unhighlightPointer) {
      this.__pointerItem.getParameter('Visible').setValue(true)
      this.__pointermat.getParameter('BaseColor').setValue(this.__avatarColor)
    } else if (data.hidePointer) {
      this.pointerXfo.sc.z = 0
      this.__pointerItem.getParameter('Visible').setValue(false)
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

    if (this.avatarNameplateGeomItem) {
      const avatarNameplateXfo = this.avatarNameplateGeomItem.getParameter('LocalXfo').getValue()
      avatarNameplateXfo.tr.set(0, 0, -0.4)
      this.avatarNameplateGeomItem.getParameter('LocalXfo').setValue(avatarNameplateXfo)
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

      let hmdAssetId
      switch (data.hmd) {
        case 'Vive':
          hmdAssetId = 'ZeaEngine/Vive.vla'
          break
        case 'Oculus':
          hmdAssetId = 'ZeaEngine/Oculus.vla'
          break
        default:
          hmdAssetId = 'ZeaEngine/Vive.vla'
          break
      }

      if (!this.__vrAsset) {
        if (!resourceLoader.getCommonResource(hmdAssetId)) {
          // Cache the asset so if an avatar needs to display,
          // it can use the same asset.
          const asset = new VLAAsset(hmdAssetId)
          asset.getParameter('FilePath').setValue(hmdAssetId)
          resourceLoader.setCommonResource(hmdAssetId, asset)
        }
        this.__vrAsset = resourceLoader.getCommonResource(hmdAssetId)
        const bindHMD = () => {
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
            const hmdGeomItem = this.__vrAsset.getChildByName('HMD').clone({ assetItem: this.__vrAsset })
            hmdGeomItem.getParameter('Visible').setValue(true)
            const xfo = hmdGeomItem.getParameter('LocalXfo').getValue()
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
        }

        if (this.__vrAsset.isLoaded()) bindHMD()
        else {
          this.__vrAsset.on('loaded', bindHMD)
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
          const controllerData = data.controllers[i]
          if (data.hmd == 'Vive') {
            srcControllerTree = this.__vrAsset.getChildByName('Controller')
          } else {
            switch (controllerData.handedness) {
              case 'left':
                srcControllerTree = this.__vrAsset.getChildByName('LeftController')
                break
              case 'right':
                srcControllerTree = this.__vrAsset.getChildByName('RightController')
                break
              case 'none':
              case 'left-right':
              case 'left-right-none':
                srcControllerTree = this.__vrAsset.getChildByName('Controller')
                break
              default:
                break
            }
          }
          if (srcControllerTree) {
            const controllerTree = srcControllerTree.clone({ assetItem: this.__vrAsset })
            const xfo = new Xfo(
              new Vec3(0, -0.035, -0.085),
              new Quat({
                setFromAxisAndAngle: [new Vec3(0, 1, 0), Math.PI],
              }),
              new Vec3(0.001, 0.001, 0.001) // VRAsset units are in mm. convert meters
            )
            controllerTree.getParameter('LocalXfo').setValue(xfo)
            treeItem.addChild(controllerTree, false)
          } else {
            console.warn('Unable to display controller for :', controllerData)
          }
        }
        if (this.__vrAsset.isLoaded()) setupControllerGeom()
        else this.__vrAsset.once('loaded', setupControllerGeom)
      }
    }

    if (data.viewXfo) {
      this.__treeItem.getChild(0).getParameter('GlobalXfo').setValue(data.viewXfo)
      this.viewXfo = data.viewXfo
    }

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

        this.__uiGeomItem = new GeomItem('VRControllerUI', plane, uimat)
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
