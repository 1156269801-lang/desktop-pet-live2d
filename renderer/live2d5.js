/**
 * Cubism 5 runner for the desktop pet.
 *
 * Built on the official Live2D Cubism Web Framework (tag 5-r.1, compiled into
 * assets/sdk/cubism5-framework.js) plus the official Cubism Core 5.1 runtime.
 *
 * Why this exists: the old pixi-live2d-display bundle carried a single-buffer
 * clipping-mask implementation (four masks max). The model in use declares
 * drawables with up to 16 masks, so the surplus was painted as a small black
 * block on the face. The framework renderer allocates maskBufferCount buffers
 * instead, which is what `createRenderer()` below passes.
 *
 * Everything here is glue written for this project; the framework itself is the
 * official Live2D distribution.
 */

(function (global) {
  'use strict'

  const FW = global.Live2DCubismFramework
  if (!FW) throw new Error('CubismWebFramework bundle missing')

  const {
    CubismFramework,
    Option,
    LogLevel,
    CubismUserModel,
    CubismModelSettingJson,
    CubismMatrix44,
    CubismEyeBlink,
    csmVector,
  } = FW

  const LOG = (global.__cubismLog = global.__cubismLog || [])
  const note = (message) => LOG.push(String(message))

  let frameworkReady = false
  function startFramework() {
    if (frameworkReady) return
    const option = new Option()
    option.logFunction = (message) => console.log('[cubism]', message)
    option.loggingLevel = LogLevel.LogLevel_Warning
    CubismFramework.startUp(option)
    CubismFramework.initialize()
    frameworkReady = true
  }

  function fetchBuffer(url) {
    // no-store：模型换了 3.json 之后，缓存会让老配置一直生效（动作组消失就是这么来的）
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(url + ' -> HTTP ' + response.status)
      return response.arrayBuffer()
    })
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('image load failed: ' + url))
      image.src = url
    })
  }

  class Cubism5Model extends CubismUserModel {
    constructor(canvas, options) {
      super()
      startFramework()
      this.canvas = canvas
      this.options = options || {}
      // The official sample runs on a WebGL2 context; the framework's shader
      // path (and mask buffers) assume it.
      const contextAttributes = {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }
      this.gl =
        canvas.getContext('webgl2', contextAttributes) || canvas.getContext('webgl', contextAttributes)
      if (!this.gl) throw new Error('WebGL unavailable')
      note('webgl2: ' + (typeof WebGL2RenderingContext !== 'undefined' && this.gl instanceof WebGL2RenderingContext))

      // CSS size tracks the drawable viewport; the backing buffer uses DPR.
      // Resizing the buffer keeps the WebGL context, textures and model intact.
      const maxWidth = Math.max(320, Math.round(window.innerWidth || 760))
      const maxHeight = Math.max(320, Math.round(window.innerHeight || 1060))
      this.pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      canvas.width = Math.round(maxWidth * this.pixelRatio)
      canvas.height = Math.round(maxHeight * this.pixelRatio)
      canvas.style.position = 'absolute'
      canvas.style.left = '0'
      canvas.style.top = '0'
      canvas.style.width = maxWidth + 'px'
      canvas.style.height = maxHeight + 'px'
      canvas.style.transform = 'none'
      this.size = { width: maxWidth, height: maxHeight }
      this.motionGroups = new Map()
      this.motionOwners = new Map()
      this.motionClaims = new Set()
      this.motionTouched = new Set()
      this.motionAdaptations = []
      this.expressionList = new Map()
      this.expressionParams = new Map()
      this.userTimeSeconds = 0
      this.idleGroup = 'Idle'
      this.mvp = new CubismMatrix44()
      // 每帧复用同一批对象：draw() 里 new 矩阵/数组会制造 GC 抖动，表现为一卡一卡
      this._projection = new CubismMatrix44()
      this._viewport = [0, 0, canvas.width, canvas.height]
      // 模型相对画布中心的位置偏移（像素）：全屏窗口里靠它移动角色
      this.offsetX = 0
      this.offsetY = 0
      this.ready = false
      // 只缩放模型本身：窗口与 canvas 尺寸不受影响
      this.scaleX = 1
      this.scaleY = 1
    }

    async load(modelJsonUrl) {
      const modelUrl = new URL(modelJsonUrl, global.location.href).toString()
      const modelDir = new URL('.', modelUrl).toString()
      const settingBuffer = await fetchBuffer(modelUrl)
      const setting = new CubismModelSettingJson(settingBuffer, settingBuffer.byteLength)
      this.setting = setting

      // --- model
      const mocUrl = new URL(setting.getModelFileName(), modelDir).toString()
      const mocBuffer = await fetchBuffer(mocUrl)
      note('moc: ' + mocBuffer.byteLength + ' bytes')
      this.loadModel(mocBuffer, false)
      const model = this.getModel()
      if (!model) throw new Error('CubismModel 创建失败')

      // --- renderer (mask buffers must cover the worst drawable: 4 masks per buffer)
      const core = model.getModel()
      const maskCounts = core.drawables.maskCounts
      let maxMasks = 0
      for (let i = 0; i < maskCounts.length; i += 1) {
        if (maskCounts[i] > maxMasks) maxMasks = maskCounts[i]
      }
      this.maxMasksPerDrawable = maxMasks
      const maskBufferCount = Math.max(1, Math.ceil(maxMasks / 4))
      note('masks/drawable max ' + maxMasks + ' -> buffers ' + maskBufferCount)
      this.createRenderer(maskBufferCount)
      const renderer = this.getRenderer()
      // 必须先把 GL 上下文交给 renderer（方法名是 startUp），否则 drawModel
      // 会静默不画：遮罩管理器与 shader 层都还没有 gl。
      if (typeof renderer.startUp === 'function') renderer.startUp(this.gl)
      renderer.setIsPremultipliedAlpha(true)
      renderer.setIsCulling(false)

      // --- textures
      const gl = this.gl
      const textureDir = typeof setting.getTextureDirectory === 'function' ? setting.getTextureDirectory() : ''
      const textureCount = setting.getTextureCount()
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
      for (let i = 0; i < textureCount; i += 1) {
        const name = setting.getTextureFileName(i)
        if (!name) continue
        const relative = name.indexOf('/') >= 0 || textureDir === '' ? name : textureDir + name
        const image = await loadImage(new URL(relative, modelDir).toString())
        const texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
        gl.generateMipmap(gl.TEXTURE_2D)
        renderer.bindTexture(i, texture)
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
      note('textures: ' + textureCount)

      // --- physics / pose / eye blink / breath
      const physicsFile = setting.getPhysicsFileName()
      if (physicsFile) {
        const buffer = await fetchBuffer(new URL(physicsFile, modelDir).toString())
        this.physicsJson = JSON.parse(new TextDecoder().decode(buffer))
        this.loadPhysics(buffer, buffer.byteLength)
        note('physics loaded')
      }
      const poseFile = setting.getPoseFileName()
      if (poseFile) {
        const buffer = await fetchBuffer(new URL(poseFile, modelDir).toString())
        this.loadPose(buffer, buffer.byteLength)
      }
      // One frame-based blink source in pet.js; do not run two competing blink timers.
      this._eyeBlink = null
      this.parameterCatalog = global.PetParameterPolicy.buildCatalog(
        this.getParameterTable(), this.physicsJson || {}, { characterId: this.options.characterId },
      )
      this.parameterById = new Map(this.parameterCatalog.params.map((p) => [p.id, p]))

      // --- expressions
      const expressionCount = setting.getExpressionCount()
      for (let i = 0; i < expressionCount; i += 1) {
        const name = setting.getExpressionName(i)
        const file = setting.getExpressionFileName(i)
        const buffer = await fetchBuffer(new URL(file, modelDir).toString())
        const motion = this.loadExpression(buffer, buffer.byteLength, name)
        if (motion) {
          this.expressionList.set(name, motion)
          // 记下这个表情会动哪些参数，切换/清除时只还原这些，
          // 免得把体型、服装这类别的状态也一起冲掉
          const ids = []
          try {
            // Cubism 的 _parameters 是 csmVector，不是数组，得用 getSize/at
            const list = motion._parameters || motion.parameters
            if (list && typeof list.getSize === 'function') {
              for (let k = 0; k < list.getSize(); k += 1) {
                const item = list.at(k)
                const pid = item && (item.parameterId || item.id)
                const pname = pid ? (pid._id && pid._id.s) || '' : ''
                if (pname) {
                  ids.push({
                    id: String(pname),
                    value: Number(item.value) || 0,
                    blend: Number(item.blendType) || 0,
                  })
                }
              }
            } else if (Array.isArray(list)) {
              for (const item of list) {
                const pid = item && (item.parameterId || item.id)
                const pname = pid ? (pid._id && pid._id.s) || '' : ''
                if (pname) {
                  ids.push({ id: String(pname), value: Number(item.value) || 0, blend: Number(item.blendType) || 0 })
                }
              }
            }
          } catch (error) {
            /* ignore */
          }
          this.expressionParams.set(name, ids)
        }
      }
      note('expressions: ' + this.expressionList.size)

      // --- motions
      const eyeBlinkIds = new csmVector()
      const lipSyncIds = new csmVector()
      for (let i = 0; i < setting.getEyeBlinkParameterCount(); i += 1) {
        eyeBlinkIds.pushBack(setting.getEyeBlinkParameterId(i))
      }
      for (let i = 0; i < setting.getLipSyncParameterCount(); i += 1) {
        lipSyncIds.pushBack(setting.getLipSyncParameterId(i))
      }
      const groupCount = setting.getMotionGroupCount()
      this.motionMeta = []
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
        const group = setting.getMotionGroupName(groupIndex)
        const count = setting.getMotionCount(group)
        const list = []
        for (let i = 0; i < count; i += 1) {
          const file = setting.getMotionFileName(group, i)
          let buffer = await fetchBuffer(new URL(file, modelDir).toString())
          const name = String(file).split('/').pop().replace(/\.motion3\.json$/i, '')
          const source = JSON.parse(new TextDecoder().decode(buffer))
          const adapted = global.PetParameterPolicy.adaptMotion(source, this.parameterCatalog, { name })
          const hashBytes = await crypto.subtle.digest('SHA-256', buffer)
          const sourceHash = Array.from(new Uint8Array(hashBytes), (b) => b.toString(16).padStart(2, '0')).join('')
          this.motionAdaptations.push({ name, sourceHash, version: 1, changes: adapted.changes, warnings: adapted.warnings })
          buffer = new TextEncoder().encode(JSON.stringify(adapted.json)).buffer
          const motion = this.loadMotion(buffer, buffer.byteLength, group + '_' + i)
          if (!motion) continue
          motion.petName = name
          motion.petParameterIds = new Set(adapted.parameterIds)
          for (const curve of adapted.json.Curves || []) {
            if (curve.Target !== 'Model') continue
            const ids = curve.Id === 'EyeBlink' ? eyeBlinkIds : curve.Id === 'LipSync' ? lipSyncIds : null
            if (ids) for (let j = 0; j < ids.getSize(); j++) motion.petParameterIds.add(ids.at(j)._id.s)
          }
          motion.setEffectIds(eyeBlinkIds, lipSyncIds)
          const fadeIn = setting.getMotionFadeInTimeValue(group, i)
          const fadeOut = setting.getMotionFadeOutTimeValue(group, i)
          if (fadeIn >= 0) motion.setFadeInTime(fadeIn)
          if (fadeOut >= 0) motion.setFadeOutTime(fadeOut)
          list.push(motion)
          // 记下文件名和时长，给"动作控制台"显示用
          this.motionMeta.push({
            group,
            index: i,
            name: String(file).split('/').pop().replace(/\.motion3\.json$/i, ''),
            duration: Number(motion.getDuration ? motion.getDuration() : 0) || 0,
            parameterIds: [...motion.petParameterIds],
          })
        }
        this.motionGroups.set(group, list)
      }
      note('motion groups: ' + [...this.motionGroups.keys()].join(','))

      this.canvasW = core.canvasinfo.CanvasWidth
      this.canvasH = core.canvasinfo.CanvasHeight

      // 每个模型的参数表、动作组名都不一样：把实际拥有什么记下来，
      // 上层（呼吸、待机、点击动作）据此自适应，而不是照抄大肥鱼的名字。
      // 注意：Cubism 的参数 id 在 _parameterIds（csmVector），没有 parameters.ids。
      this.parameterIds = new Set()
      try {
        // 注意：这里的 core 是 moc，参数 id 在 model 上
        const modelCore = this.getModel ? this.getModel() : null
        const rawIds = (modelCore && modelCore._parameterIds) || core._parameterIds
        if (rawIds) {
          const size = typeof rawIds.getSize === 'function' ? rawIds.getSize() : rawIds.length
          for (let i = 0; i < size; i += 1) {
            const item = typeof rawIds.at === 'function' ? rawIds.at(i) : rawIds[i]
            const name = item && item._id && item._id.s
            if (name) this.parameterIds.add(name)
          }
        }
      } catch (error) {
        /* ignore */
      }
      const groups = [...this.motionGroups.keys()]
      this.idleGroup = groups.find((name) => /idle|待机/i.test(name)) || ''
      this.actionGroups = groups.filter((name) => name !== this.idleGroup)
      note(
        'parameters: ' +
          this.parameterIds.size +
          ' idle: ' +
          (this.idleGroup || 'none') +
          ' actions: ' +
          this.actionGroups.join(','),
      )

      this.ready = true
      return this
    }

    /** 这个模型有没有某个参数（换模型后很多名字不存在，必须查过再写） */
    hasParameter(id) {
      if (this.parameterIds && this.parameterIds.has(id)) return true
      // 兜底：parameterIds 可能在模型就绪前采集过（那时是空的），
      // 直接问模型更可靠——不存在的 id 会拿到 null
      try {
        const value = this.getParameterValue(id)
        return value !== null && value !== undefined
      } catch (error) {
        return false
      }
    }

    setupMatrix() {
      const width = this.size.width
      const height = this.size.height
      const scale = Math.min(width / this.canvasW, height / this.canvasH) * (this.options.fit || 1)
      const sx = (2 * scale) / width
      const sy = (2 * scale) / height
      const offsetY = -1 + (this.canvasH * scale) / height
      const matrix = new CubismMatrix44()
      matrix.loadIdentity()
      matrix.scale(sx, sy)
      matrix.translate(0, offsetY)
      this.mvp = matrix
    }

    resize(width, height) {
      const w = Math.max(1, Math.round(Number.isFinite(width) ? width : this.size.width))
      const h = Math.max(1, Math.round(Number.isFinite(height) ? height : this.size.height))
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      const pixelW = Math.round(w * ratio), pixelH = Math.round(h * ratio)
      const changed = this.canvas.width !== pixelW || this.canvas.height !== pixelH
        || this.size.width !== w || this.size.height !== h || this.pixelRatio !== ratio
      this.windowSize = this.size = { width: w, height: h }
      this.pixelRatio = ratio
      this.canvas.style.width = w + 'px'
      this.canvas.style.height = h + 'px'
      // Do not reset a stable buffer on every ResizeObserver callback.
      if (this.canvas.width !== pixelW) this.canvas.width = pixelW
      if (this.canvas.height !== pixelH) this.canvas.height = pixelH
      if (changed) this._lastBounds = null
      return changed
    }

    /** 播放动作：group 名 + 索引 */
    playMotion(group, index) {
      const list = this.motionGroups.get(group) || this.motionGroups.get(group.toLowerCase())
      if (!list || list.length === 0) return false
      const motion = list[Math.min(index, list.length - 1)]
      if (!motion) return false
      motion.setIsLoop(false)
      // 淡入淡出：动作不要"啪"地跳进去，也不要硬切回来。
      // 时间要短：待机动作的 fadeOut 若过长，会和点击动作长时间同时驱动手部，
      // 出现"两个手"的虚影。
      try {
        motion.setFadeInTime(0.22)
        motion.setFadeOutTime(0.22)
      } catch (error) {
        /* 该版本没有这两个 setter，忽略 */
      }
      // autoDelete 必须为 false：动作对象是缓存复用的，让它自动删除会留下空队列项
      const handle = this._motionManager.startMotionPriority(motion, false, 3)
      this.motionOwners.set(handle, motion.petParameterIds || new Set())
      for (const id of motion.petParameterIds || []) this.motionTouched.add(id)
      this.refreshMotionClaims()
      return true
    }

    playIdle() {
      if (!this.idleGroup) return false
      const list = this.motionGroups.get(this.idleGroup)
      if (!list || list.length === 0) return false
      const motion = list[Math.floor(Math.random() * list.length)]
      if (!motion) return false
      motion.setIsLoop(true)
      // 待机动作的淡入淡出也必须短：1.2 秒会让点击动作与待机动作长时间混合，
      // 手部出现两套姿势叠加的虚影。
      try {
        motion.setFadeInTime(0.3)
        motion.setFadeOutTime(0.3)
      } catch (error) {
        /* ignore */
      }
      // 同上：true 会把缓存里的 CubismMotion 释放掉，下一次播放就只剩 null
      const handle = this._motionManager.startMotionPriority(motion, false, 1)
      this.motionOwners.set(handle, motion.petParameterIds || new Set())
      this.refreshMotionClaims()
      return true
    }

    refreshMotionClaims() {
      this.motionClaims.clear()
      for (const [handle, ids] of this.motionOwners) {
        if (this._motionManager.isFinishedByHandle(handle)) this.motionOwners.delete(handle)
        else for (const id of ids) this.motionClaims.add(id)
      }
    }

    stopMotions() {
      const ids = new Set([...this.motionClaims, ...this.motionTouched])
      this._motionManager.stopAllMotions()
      this.motionOwners.clear()
      this.motionClaims.clear()
      this.motionTouched.clear()
      // Explicit reset restores only the stopped motion's channels, not unrelated state.
      const core = this.getModel()
      core.loadParameters()
      for (const id of ids) {
        const p = this.parameterById.get(id)
        if (p) this.setParameter(id, p.default, core)
      }
      core.saveParameters()
    }

    setExpression(name) {
      const motion = this.expressionList.get(name)
      if (!motion) return false
      this._expressionManager.startMotionPriority(motion, false, 3)
      return true
    }

    /** 参数/部件都要先转成 framework 的 id handle，直接传字符串是查不到的 */
    handle(name) {
      if (!this.idManager) this.idManager = CubismFramework.getIdManager()
      return this.idManager.getId(name)
    }

    /**
     * 把模型的参数表导出来给外部（capabilities 用）。
     * 参数 id 在 _parameterIds（csmVector），范围/默认值在三个 Float32Array 里按索引对齐。
     * 注意：不要用 cdi3.json 的 Min/Max，那个文件里的范围是空的。
     */
    getParameterTable() {
      const out = []
      try {
        const core = this.getModel()
        if (!core) return out
        const ids = core._parameterIds
        const mins = core._parameterMinimumValues
        const maxs = core._parameterMaximumValues
        const defaults = core._parameterDefaultValues
        if (!ids) return out
        const size = typeof ids.getSize === 'function' ? ids.getSize() : ids.length
        for (let i = 0; i < size; i += 1) {
          const item = typeof ids.at === 'function' ? ids.at(i) : ids[i]
          const name = item && item._id && item._id.s
          if (!name) continue
          out.push({
            id: name,
            min: mins ? Number(mins[i]) : null,
            max: maxs ? Number(maxs[i]) : null,
            default: typeof core.getParameterDefaultValue === 'function' ? Number(core.getParameterDefaultValue(i)) : defaults ? Number(defaults[i]) : null,
          })
        }
      } catch (error) {
        /* ignore */
      }
      return out
    }

    /** 读当前参数值（调试与回执用） */
    getParameterValue(id) {
      try {
        const core = this.getModel()
        if (!core) return null
        const ids = core._parameterIds
        const values = core._parameterValues
        if (!ids || !values) return null
        const size = typeof ids.getSize === 'function' ? ids.getSize() : ids.length
        for (let i = 0; i < size; i += 1) {
          const item = typeof ids.at === 'function' ? ids.at(i) : ids[i]
          if (item && item._id && item._id.s === id) return Number(values[i])
        }
      } catch (error) {
        /* ignore */
      }
      return null
    }

    /** 列出部件（capabilities 用） */
    getPartIds() {
      const out = []
      try {
        const core = this.getModel()
        const ids = core && core._partIds
        if (!ids) return out
        const size = typeof ids.getSize === 'function' ? ids.getSize() : ids.length
        for (let i = 0; i < size; i += 1) {
          const item = typeof ids.at === 'function' ? ids.at(i) : ids[i]
          const name = item && item._id && item._id.s
          if (name) out.push(name)
        }
      } catch (error) {
        /* ignore */
      }
      return out
    }

    setParameter(id, value, cubismModel) {
      const model = cubismModel || this.getModel()
      if (!model) return
      try {
        model.setParameterValueById(this.handle(id), value, 1)
      } catch (error) {
        /* unknown id */
      }
    }

    setPartOpacity(id, opacity) {
      const model = this.getModel()
      if (!model) return
      try {
        model.setPartOpacityById(this.handle(id), opacity)
      } catch (error) {
        /* unknown id */
      }
    }

    /** 判断某个窗口坐标是不是落在模型上（用来只让"抓着角色"才拖动） */
    isOpaqueAt(x, y) {
      if (!this.ready || !this.gl) return true
      const gl = this.gl
      const width = this.canvas.width
      const height = this.canvas.height
      const rect = this.canvas.getBoundingClientRect()
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return false
      const px = Math.max(0, Math.min(width - 1, Math.floor((x - rect.left) * width / rect.width)))
      const py = Math.max(0, Math.min(height - 1, Math.floor((y - rect.top) * height / rect.height)))
      const pixel = new Uint8Array(4)
      gl.readPixels(px, height - 1 - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      return pixel[3] > 12
    }

    update(dt) {
      if (!this.ready) return
      const model = this.getModel()
      this.userTimeSeconds += dt

      let motionUpdated = false
      model.loadParameters()
      // Pose drivers use a neutral base each frame. Gaze/physics are never saved as next-frame input.
      for (const id of [...Object.values(this.parameterCatalog.bindings), 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamMouthOpenY']) {
        const p = this.parameterById.get(id)
        if (p) this.setParameter(id, p.default, model)
      }
      try {
        if (this._motionManager.isFinished()) {
          // director 参数轨道运行期间暂停待机 motion，避免待机与手势各驱动一半参数叠加出虚影
          if (!this.suspendIdle) this.playIdle()
        } else {
          motionUpdated = this._motionManager.updateMotion(model, dt)
        }
      } catch (error) {
        // 队列里出现坏条目时清空，避免整个帧循环被卡死
        if (!this._motionErrorLogged) {
          this._motionErrorLogged = true
          note('motion update failed: ' + (error && error.message))
        }
        try {
          this.stopMotions()
        } catch (resetError) {
          /* ignore */
        }
      }
      this.refreshMotionClaims()
      model.saveParameters()

      if (!motionUpdated && this._eyeBlink) {
        this._eyeBlink.updateParameters(model, dt)
      }
      if (this._expressionManager) {
        this._expressionManager.updateMotion(model, dt)
      }

      // 自定义参数（表情开关）
      if (this.onBeforePhysics) this.onBeforePhysics(model)
      if (this.onSample) this.onSample('beforePhysics')

      if (this._physics) this._physics.evaluate(model, dt)
      if (this.onSample) this.onSample('afterPhysics')
      if (this._pose) this._pose.updateParameters(model, dt)
      model.update()
    }

    /** 模型大概占的矩形（canvas 坐标），用来做局部清屏 */
    computeDrawBounds() {
      const w = this.size.width
      const hgt = this.size.height
      const baseH = this.options.baseModelHeight || Math.max(320, Math.round(window.innerHeight * 0.42))
      const modelH = baseH * this.scaleY
      const aspect = this.canvasW / this.canvasH
      const stretch = this.scaleY === 0 ? 1 : this.scaleX / this.scaleY
      const modelW = modelH * aspect * stretch
      const cx = w / 2 + (this.offsetX || 0) + (this.gazeOffsetX || 0)
      const cy = hgt / 2 + (this.offsetY || 0) + (this.gazeOffsetY || 0)
      // 留余量给呼吸起伏、摇头、物理摆动
      const pad = Math.max(modelW, modelH) * 0.14 + 20
      return {
        left: Math.max(0, Math.floor(cx - modelW / 2 - pad)),
        top: Math.max(0, Math.floor(cy - modelH / 2 - pad)),
        right: Math.min(w, Math.ceil(cx + modelW / 2 + pad)),
        bottom: Math.min(hgt, Math.ceil(cy + modelH / 2 + pad)),
      }
    }

    /** canvas 坐标 → GL 的 scissor（原点在左下） */
    scissorRect(b, canvasHeight) {
      if (!b) return false
      const x = Math.max(0, b.left)
      const w = Math.max(0, b.right - b.left)
      const h = Math.max(0, b.bottom - b.top)
      if (w <= 0 || h <= 0) return false
      const dpr = this.pixelRatio
      this.gl.scissor(Math.floor(x * dpr), Math.max(0, Math.floor((canvasHeight - b.bottom) * dpr)), Math.ceil(w * dpr), Math.ceil(h * dpr))
      return true
    }

    draw() {
      if (!this.ready) return
      const gl = this.gl
      const width = this.size.width
      const height = this.size.height
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clearColor(0, 0, 0, 0)

      // 平时只清「上一帧 + 这一帧」模型所在的矩形，不整块 clear。
      // 但动作期间手臂会摆出静态包围盒，局部清屏会在下一帧留下残影
      //（做动作时手部拖影），所以：
      //   - 原生 motion 播放中及结束后 400ms 归位期内整块清；
      //   - 编舞 / 导演驱动时（参数轨道快速变化）由 pet.js 置 forceFullClear 强制整块清。
      const bounds = this.computeDrawBounds()
      const now = performance.now()
      let motionActive = false
      try {
        motionActive = Boolean(this._motionManager && !this._motionManager.isFinished())
      } catch {
        motionActive = false
      }
      const driven = this.forceFullClear === true
      if (motionActive || driven) this._fullClearUntil = now + 400
      const fullClear = motionActive || driven || now < (this._fullClearUntil || 0)

      gl.enable(gl.SCISSOR_TEST)
      if (fullClear) {
        gl.scissor(0, 0, this.canvas.width, this.canvas.height)
        gl.clear(gl.COLOR_BUFFER_BIT)
      } else {
        if (this._lastBounds) {
          if (this.scissorRect(this._lastBounds, height)) gl.clear(gl.COLOR_BUFFER_BIT)
        }
        if (this.scissorRect(bounds, height)) {
          gl.clear(gl.COLOR_BUFFER_BIT)
        } else {
          gl.scissor(0, 0, this.canvas.width, this.canvas.height)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
      }
      gl.disable(gl.SCISSOR_TEST)
      this._lastBounds = fullClear ? null : bounds

      this.setupMatrix()
      const renderer = this.getRenderer()
      // 模型在屏幕上的像素高度只由 scaleY 决定（不跟窗口走），
      // 宽度按模型自身比例跟着高度走，scaleX 只负责额外拉伸。
      // 这样窗口变大只是露出更多区域，避免"窗口放大 → 模型再放大"的双重缩放。
      const baseHeight =
        this.options.baseModelHeight || Math.max(320, Math.round(window.innerHeight * 0.42))
      const modelH = baseHeight * this.scaleY
      const k = modelH / height
      const stretch = this.scaleY === 0 ? 1 : this.scaleX / this.scaleY
      // modelMatrix 是按画布宽高归一化的，NDC 横向还差一次画布宽高比补偿；
      // 少了这一步模型会被横向拉宽（PSD 是 3749:7697≈0.487，实测却成 0.754）。
      const fitX = 1.057 / (width / height)
      const projection = this._projection
      projection.loadIdentity()

      // 程序化呼吸：不依赖模型有没有 ParamBreath，靠"整体轻微起伏 + 一点点缩放"
      // 模拟吸气。模型自带呼吸参数时把幅度压低（避免叠加成过度夸张）。
      const strength = this.breathStrength === undefined ? 1 : this.breathStrength
      let breathY = 0
      let breathScale = 1
      if (strength > 0) {
        const t = performance.now() / 1000
        const phase = Math.sin(t * 1.25)
        breathY = phase * 4 * strength
        breathScale = 1 + phase * 0.006 * strength
      }

      projection.scale(k * stretch * fitX * breathScale, k * breathScale)
      // 平移放在 NDC 空间：offset 是"相对画布中心的像素偏移"，
      // gazeOffset 是视线跟随时的"探头"位移，叠在位置后面
      const gazeX = this.gazeOffsetX || 0
      const gazeY = this.gazeOffsetY || 0
      projection.translate(
        (2 * (this.offsetX + gazeX)) / width,
        (-2 * (this.offsetY + breathY + gazeY)) / height,
      )
      const modelMatrix = this._modelMatrix || this.getModelMatrix()
      if (modelMatrix) projection.multiplyByMatrix(modelMatrix)
      renderer.setMvpMatrix(projection)
      this._viewport[0] = 0
      this._viewport[1] = 0
      this._viewport[2] = this.canvas.width
      this._viewport[3] = this.canvas.height
      renderer.setRenderState(null, this._viewport)
      renderer.drawModel()

      if (!this._probeDone) {
        this._probeDone = true
        const model = this.getModel()
        const count = model.getDrawableCount()
        let visible = 0
        for (let i = 0; i < count; i += 1) {
          if (model.getDrawableOpacity(i) > 0.01) visible += 1
        }
        note('drawables ' + count + ', opacity>0: ' + visible)

        const probes = [
          [Math.floor(width / 2), Math.floor(height / 2)],
          [Math.floor(width / 2), Math.floor(height * 0.35)],
          [Math.floor(width / 2), Math.floor(height * 0.8)],
        ]
        const samples = []
        const pixel = new Uint8Array(4)
        for (const [px, py] of probes) {
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
          samples.push(Array.from(pixel).join(','))
        }
        note('probe pixels: ' + samples.join(' | '))
        note('gl error after draw: 0x' + gl.getError().toString(16))
      }
    }
  }

  global.Cubism5Model = Cubism5Model
})(window)
