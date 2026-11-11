var Live2DCubismFramework = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // desktop-pet/_sdk/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    CubismBreath: () => CubismBreath,
    CubismExpressionMotion: () => CubismExpressionMotion,
    CubismExpressionMotionManager: () => CubismExpressionMotionManager,
    CubismEyeBlink: () => CubismEyeBlink,
    CubismFramework: () => CubismFramework,
    CubismIdManager: () => CubismIdManager,
    CubismMatrix44: () => CubismMatrix44,
    CubismMoc: () => CubismMoc,
    CubismModel: () => CubismModel,
    CubismModelMatrix: () => CubismModelMatrix,
    CubismModelSettingJson: () => CubismModelSettingJson,
    CubismMotion: () => CubismMotion,
    CubismMotionManager: () => CubismMotionManager,
    CubismPhysics: () => CubismPhysics,
    CubismPose: () => CubismPose,
    CubismRenderer_WebGL: () => CubismRenderer_WebGL,
    CubismUserModel: () => CubismUserModel,
    LogLevel: () => LogLevel,
    Option: () => Option,
    csmMap: () => csmMap,
    csmVector: () => csmVector
  });

  // desktop-pet/_sdk/samples2/Framework/src/type/csmvector.ts
  var _csmVector = class _csmVector {
    /**
     * 引数付きコンストラクタ
     * @param iniitalCapacity 初期化後のキャパシティ。データサイズは_capacity * sizeof(T)
     * @param zeroClear trueなら初期化時に確保した領域を0で埋める
     */
    constructor(initialCapacity = 0) {
      if (initialCapacity < 1) {
        this._ptr = [];
        this._capacity = 0;
        this._size = 0;
      } else {
        this._ptr = new Array(initialCapacity);
        this._capacity = initialCapacity;
        this._size = 0;
      }
    }
    /**
     * インデックスで指定した要素を返す
     */
    at(index) {
      return this._ptr[index];
    }
    /**
     * 要素をセット
     * @param index 要素をセットするインデックス
     * @param value セットする要素
     */
    set(index, value) {
      this._ptr[index] = value;
    }
    /**
     * コンテナを取得する
     */
    get(offset = 0) {
      const ret = new Array();
      for (let i = offset; i < this._size; i++) {
        ret.push(this._ptr[i]);
      }
      return ret;
    }
    /**
     * pushBack処理、コンテナに新たな要素を追加する
     * @param value PushBack処理で追加する値
     */
    pushBack(value) {
      if (this._size >= this._capacity) {
        this.prepareCapacity(
          this._capacity == 0 ? _csmVector.DefaultSize : this._capacity * 2
        );
      }
      this._ptr[this._size++] = value;
    }
    /**
     * コンテナの全要素を解放する
     */
    clear() {
      this._ptr.length = 0;
      this._size = 0;
    }
    /**
     * コンテナの要素数を返す
     * @return コンテナの要素数
     */
    getSize() {
      return this._size;
    }
    /**
     * コンテナの全要素に対して代入処理を行う
     * @param newSize 代入処理後のサイズ
     * @param value 要素に代入する値
     */
    assign(newSize, value) {
      const curSize = this._size;
      if (curSize < newSize) {
        this.prepareCapacity(newSize);
      }
      for (let i = 0; i < newSize; i++) {
        this._ptr[i] = value;
      }
      this._size = newSize;
    }
    /**
     * サイズ変更
     */
    resize(newSize, value = null) {
      this.updateSize(newSize, value, true);
    }
    /**
     * サイズ変更
     */
    updateSize(newSize, value = null, callPlacementNew = true) {
      const curSize = this._size;
      if (curSize < newSize) {
        this.prepareCapacity(newSize);
        if (callPlacementNew) {
          for (let i = this._size; i < newSize; i++) {
            if (typeof value == "function") {
              this._ptr[i] = JSON.parse(JSON.stringify(new value()));
            } else {
              this._ptr[i] = value;
            }
          }
        } else {
          for (let i = this._size; i < newSize; i++) {
            this._ptr[i] = value;
          }
        }
      } else {
        const sub = this._size - newSize;
        this._ptr.splice(this._size - sub, sub);
      }
      this._size = newSize;
    }
    /**
     * コンテナにコンテナ要素を挿入する
     * @param position 挿入する位置
     * @param begin 挿入するコンテナの開始位置
     * @param end 挿入するコンテナの終端位置
     */
    insert(position, begin, end) {
      let dstSi = position._index;
      const srcSi = begin._index;
      const srcEi = end._index;
      const addCount = srcEi - srcSi;
      this.prepareCapacity(this._size + addCount);
      const addSize = this._size - dstSi;
      if (addSize > 0) {
        for (let i = 0; i < addSize; i++) {
          this._ptr.splice(dstSi + i, 0, null);
        }
      }
      for (let i = srcSi; i < srcEi; i++, dstSi++) {
        this._ptr[dstSi] = begin._vector._ptr[i];
      }
      this._size = this._size + addCount;
    }
    /**
     * コンテナからインデックスで指定した要素を削除する
     * @param index インデックス値
     * @return true 削除実行
     * @return false 削除範囲外
     */
    remove(index) {
      if (index < 0 || this._size <= index) {
        return false;
      }
      this._ptr.splice(index, 1);
      --this._size;
      return true;
    }
    /**
     * コンテナから要素を削除して他の要素をシフトする
     * @param ite 削除する要素
     */
    erase(ite) {
      const index = ite._index;
      if (index < 0 || this._size <= index) {
        return ite;
      }
      this._ptr.splice(index, 1);
      --this._size;
      const ite2 = new iterator(this, index);
      return ite2;
    }
    /**
     * コンテナのキャパシティを確保する
     * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない.
     */
    prepareCapacity(newSize) {
      if (newSize > this._capacity) {
        if (this._capacity == 0) {
          this._ptr = new Array(newSize);
          this._capacity = newSize;
        } else {
          this._ptr.length = newSize;
          this._capacity = newSize;
        }
      }
    }
    /**
     * コンテナの先頭要素を返す
     */
    begin() {
      const ite = this._size == 0 ? this.end() : new iterator(this, 0);
      return ite;
    }
    /**
     * コンテナの終端要素を返す
     */
    end() {
      const ite = new iterator(this, this._size);
      return ite;
    }
    getOffset(offset) {
      const newVector = new _csmVector();
      newVector._ptr = this.get(offset);
      newVector._size = this.get(offset).length;
      newVector._capacity = this.get(offset).length;
      return newVector;
    }
    // コンテナ初期化のデフォルトサイズ
  };
  // コンテナのキャパシティ
  _csmVector.DefaultSize = 10;
  var csmVector = _csmVector;
  var iterator = class _iterator {
    /**
     * コンストラクタ
     */
    constructor(v, index) {
      this._vector = v != void 0 ? v : null;
      this._index = index != void 0 ? index : 0;
    }
    /**
     * 代入
     */
    set(ite) {
      this._index = ite._index;
      this._vector = ite._vector;
      return this;
    }
    /**
     * 前置き++演算
     */
    preIncrement() {
      ++this._index;
      return this;
    }
    /**
     * 前置き--演算
     */
    preDecrement() {
      --this._index;
      return this;
    }
    /**
     * 後置き++演算子
     */
    increment() {
      const iteold = new _iterator(this._vector, this._index++);
      return iteold;
    }
    /**
     * 後置き--演算子
     */
    decrement() {
      const iteold = new _iterator(this._vector, this._index--);
      return iteold;
    }
    /**
     * ptr
     */
    ptr() {
      return this._vector._ptr[this._index];
    }
    /**
     * =演算子のオーバーロード
     */
    substitution(ite) {
      this._index = ite._index;
      this._vector = ite._vector;
      return this;
    }
    /**
     * !=演算子のオーバーロード
     */
    notEqual(ite) {
      return this._index != ite._index || this._vector != ite._vector;
    }
    // コンテナ
  };
  var Live2DCubismFramework;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.csmVector = csmVector;
    Live2DCubismFramework40.iterator = iterator;
  })(Live2DCubismFramework || (Live2DCubismFramework = {}));

  // desktop-pet/_sdk/samples2/Framework/src/type/csmstring.ts
  var csmString = class {
    /**
     * 文字列を後方に追加する
     *
     * @param c 追加する文字列
     * @return 更新された文字列
     */
    append(c, length) {
      this.s += length !== void 0 ? c.substr(0, length) : c;
      return this;
    }
    /**
     * 文字サイズを拡張して文字を埋める
     * @param length    拡張する文字数
     * @param v         埋める文字
     * @return 更新された文字列
     */
    expansion(length, v) {
      for (let i = 0; i < length; i++) {
        this.append(v);
      }
      return this;
    }
    /**
     * 文字列の長さをバイト数で取得する
     */
    getBytes() {
      return encodeURIComponent(this.s).replace(/%../g, "x").length;
    }
    /**
     * 文字列の長さを返す
     */
    getLength() {
      return this.s.length;
    }
    /**
     * 文字列比較 <
     * @param s 比較する文字列
     * @return true:    比較する文字列より小さい
     * @return false:   比較する文字列より大きい
     */
    isLess(s) {
      return this.s < s.s;
    }
    /**
     * 文字列比較 >
     * @param s 比較する文字列
     * @return true:    比較する文字列より大きい
     * @return false:   比較する文字列より小さい
     */
    isGreat(s) {
      return this.s > s.s;
    }
    /**
     * 文字列比較 ==
     * @param s 比較する文字列
     * @return true:    比較する文字列と等しい
     * @return false:   比較する文字列と異なる
     */
    isEqual(s) {
      return this.s == s;
    }
    /**
     * 文字列が空かどうか
     * @return true: 空の文字列
     * @return false: 値が設定されている
     */
    isEmpty() {
      return this.s.length == 0;
    }
    /**
     * 引数付きコンストラクタ
     */
    constructor(s) {
      this.s = s;
    }
  };
  var Live2DCubismFramework2;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.csmString = csmString;
  })(Live2DCubismFramework2 || (Live2DCubismFramework2 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/id/cubismid.ts
  var CubismId = class _CubismId {
    /**
     * 内部で使用するCubismIdクラス生成メソッド
     *
     * @param id ID文字列
     * @returns CubismId
     * @note 指定したID文字列からCubismIdを取得する際は
     *       CubismIdManager().getId(id)を使用してください
     */
    static createIdInternal(id) {
      return new _CubismId(id);
    }
    /**
     * ID名を取得する
     */
    getString() {
      return this._id;
    }
    /**
     * idを比較
     * @param c 比較するid
     * @return 同じならばtrue,異なっていればfalseを返す
     */
    isEqual(c) {
      if (typeof c === "string") {
        return this._id.isEqual(c);
      } else if (c instanceof csmString) {
        return this._id.isEqual(c.s);
      } else if (c instanceof _CubismId) {
        return this._id.isEqual(c._id.s);
      }
      return false;
    }
    /**
     * idを比較
     * @param c 比較するid
     * @return 同じならばtrue,異なっていればfalseを返す
     */
    isNotEqual(c) {
      if (typeof c == "string") {
        return !this._id.isEqual(c);
      } else if (c instanceof csmString) {
        return !this._id.isEqual(c.s);
      } else if (c instanceof _CubismId) {
        return !this._id.isEqual(c._id.s);
      }
      return false;
    }
    /**
     * プライベートコンストラクタ
     *
     * @note ユーザーによる生成は許可しません
     */
    constructor(id) {
      if (typeof id === "string") {
        this._id = new csmString(id);
        return;
      }
      this._id = id;
    }
    // ID名
  };
  var Live2DCubismFramework3;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismId = CubismId;
  })(Live2DCubismFramework3 || (Live2DCubismFramework3 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/id/cubismidmanager.ts
  var CubismIdManager = class {
    /**
     * コンストラクタ
     */
    constructor() {
      this._ids = new csmVector();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      for (let i = 0; i < this._ids.getSize(); ++i) {
        this._ids.set(i, void 0);
      }
      this._ids = null;
    }
    /**
     * ID名をリストから登録
     *
     * @param ids ID名リスト
     * @param count IDの個数
     */
    registerIds(ids) {
      for (let i = 0; i < ids.length; i++) {
        this.registerId(ids[i]);
      }
    }
    /**
     * ID名を登録
     *
     * @param id ID名
     */
    registerId(id) {
      let result = null;
      if ("string" == typeof id) {
        if ((result = this.findId(id)) != null) {
          return result;
        }
        result = CubismId.createIdInternal(id);
        this._ids.pushBack(result);
      } else {
        return this.registerId(id.s);
      }
      return result;
    }
    /**
     * ID名からIDを取得する
     *
     * @param id ID名
     */
    getId(id) {
      return this.registerId(id);
    }
    /**
     * ID名からIDの確認
     *
     * @return true 存在する
     * @return false 存在しない
     */
    isExist(id) {
      if ("string" == typeof id) {
        return this.findId(id) != null;
      }
      return this.isExist(id.s);
    }
    /**
     * ID名からIDを検索する。
     *
     * @param id ID名
     * @return 登録されているID。なければNULL。
     */
    findId(id) {
      for (let i = 0; i < this._ids.getSize(); ++i) {
        if (this._ids.at(i).getString().isEqual(id)) {
          return this._ids.at(i);
        }
      }
      return null;
    }
    // 登録されているIDのリスト
  };
  var Live2DCubismFramework4;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismIdManager = CubismIdManager;
  })(Live2DCubismFramework4 || (Live2DCubismFramework4 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/math/cubismmatrix44.ts
  var CubismMatrix44 = class _CubismMatrix44 {
    /**
     * コンストラクタ
     */
    constructor() {
      this._tr = new Float32Array(16);
      this.loadIdentity();
    }
    /**
     * 受け取った２つの行列の乗算を行う。
     *
     * @param a 行列a
     * @param b 行列b
     * @return 乗算結果の行列
     */
    static multiply(a, b, dst) {
      const c = new Float32Array([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ]);
      const n = 4;
      for (let i = 0; i < n; ++i) {
        for (let j = 0; j < n; ++j) {
          for (let k = 0; k < n; ++k) {
            c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
          }
        }
      }
      for (let i = 0; i < 16; ++i) {
        dst[i] = c[i];
      }
    }
    /**
     * 単位行列に初期化する
     */
    loadIdentity() {
      const c = new Float32Array([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      ]);
      this.setMatrix(c);
    }
    /**
     * 行列を設定
     *
     * @param tr 16個の浮動小数点数で表される4x4の行列
     */
    setMatrix(tr) {
      for (let i = 0; i < 16; ++i) {
        this._tr[i] = tr[i];
      }
    }
    /**
     * 行列を浮動小数点数の配列で取得
     *
     * @return 16個の浮動小数点数で表される4x4の行列
     */
    getArray() {
      return this._tr;
    }
    /**
     * X軸の拡大率を取得
     * @return X軸の拡大率
     */
    getScaleX() {
      return this._tr[0];
    }
    /**
     * Y軸の拡大率を取得する
     *
     * @return Y軸の拡大率
     */
    getScaleY() {
      return this._tr[5];
    }
    /**
     * X軸の移動量を取得
     * @return X軸の移動量
     */
    getTranslateX() {
      return this._tr[12];
    }
    /**
     * Y軸の移動量を取得
     * @return Y軸の移動量
     */
    getTranslateY() {
      return this._tr[13];
    }
    /**
     * X軸の値を現在の行列で計算
     *
     * @param src X軸の値
     * @return 現在の行列で計算されたX軸の値
     */
    transformX(src) {
      return this._tr[0] * src + this._tr[12];
    }
    /**
     * Y軸の値を現在の行列で計算
     *
     * @param src Y軸の値
     * @return 現在の行列で計算されたY軸の値
     */
    transformY(src) {
      return this._tr[5] * src + this._tr[13];
    }
    /**
     * X軸の値を現在の行列で逆計算
     */
    invertTransformX(src) {
      return (src - this._tr[12]) / this._tr[0];
    }
    /**
     * Y軸の値を現在の行列で逆計算
     */
    invertTransformY(src) {
      return (src - this._tr[13]) / this._tr[5];
    }
    /**
     * 現在の行列の位置を起点にして移動
     *
     * 現在の行列の位置を起点にして相対的に移動する。
     *
     * @param x X軸の移動量
     * @param y Y軸の移動量
     */
    translateRelative(x, y) {
      const tr1 = new Float32Array([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        x,
        y,
        0,
        1
      ]);
      _CubismMatrix44.multiply(tr1, this._tr, this._tr);
    }
    /**
     * 現在の行列の位置を移動
     *
     * 現在の行列の位置を指定した位置へ移動する
     *
     * @param x X軸の移動量
     * @param y y軸の移動量
     */
    translate(x, y) {
      this._tr[12] = x;
      this._tr[13] = y;
    }
    /**
     * 現在の行列のX軸の位置を指定した位置へ移動する
     *
     * @param x X軸の移動量
     */
    translateX(x) {
      this._tr[12] = x;
    }
    /**
     * 現在の行列のY軸の位置を指定した位置へ移動する
     *
     * @param y Y軸の移動量
     */
    translateY(y) {
      this._tr[13] = y;
    }
    /**
     * 現在の行列の拡大率を相対的に設定する
     *
     * @param x X軸の拡大率
     * @param y Y軸の拡大率
     */
    scaleRelative(x, y) {
      const tr1 = new Float32Array([
        x,
        0,
        0,
        0,
        0,
        y,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      ]);
      _CubismMatrix44.multiply(tr1, this._tr, this._tr);
    }
    /**
     * 現在の行列の拡大率を指定した倍率に設定する
     *
     * @param x X軸の拡大率
     * @param y Y軸の拡大率
     */
    scale(x, y) {
      this._tr[0] = x;
      this._tr[5] = y;
    }
    /**
     * 引数で与えられた行列にこの行列を乗算する。
     * (引数で与えられた行列) * (この行列)
     *
     * @note 関数名と実際の計算内容に乖離があるため、今後計算順が修正される可能性があります。
     * @param m 行列
     */
    multiplyByMatrix(m) {
      _CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
    }
    /**
     * オブジェクトのコピーを生成する
     */
    clone() {
      const cloneMatrix = new _CubismMatrix44();
      for (let i = 0; i < this._tr.length; i++) {
        cloneMatrix._tr[i] = this._tr[i];
      }
      return cloneMatrix;
    }
    // 4x4行列データ
  };
  var Live2DCubismFramework5;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMatrix44 = CubismMatrix44;
  })(Live2DCubismFramework5 || (Live2DCubismFramework5 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/type/csmrectf.ts
  var csmRect = class {
    /**
     * コンストラクタ
     * @param x 左端X座標
     * @param y 上端Y座標
     * @param w 幅
     * @param h 高さ
     */
    constructor(x, y, w, h) {
      this.x = x;
      this.y = y;
      this.width = w;
      this.height = h;
    }
    /**
     * 矩形中央のX座標を取得する
     */
    getCenterX() {
      return this.x + 0.5 * this.width;
    }
    /**
     * 矩形中央のY座標を取得する
     */
    getCenterY() {
      return this.y + 0.5 * this.height;
    }
    /**
     * 右側のX座標を取得する
     */
    getRight() {
      return this.x + this.width;
    }
    /**
     * 下端のY座標を取得する
     */
    getBottom() {
      return this.y + this.height;
    }
    /**
     * 矩形に値をセットする
     * @param r 矩形のインスタンス
     */
    setRect(r) {
      this.x = r.x;
      this.y = r.y;
      this.width = r.width;
      this.height = r.height;
    }
    /**
     * 矩形中央を軸にして縦横を拡縮する
     * @param w 幅方向に拡縮する量
     * @param h 高さ方向に拡縮する量
     */
    expand(w, h) {
      this.x -= w;
      this.y -= h;
      this.width += w * 2;
      this.height += h * 2;
    }
    // 高さ
  };
  var Live2DCubismFramework6;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.csmRect = csmRect;
  })(Live2DCubismFramework6 || (Live2DCubismFramework6 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/rendering/cubismrenderer.ts
  var CubismRenderer = class {
    /**
     * レンダラのインスタンスを生成して取得する
     *
     * @return レンダラのインスタンス
     */
    static create() {
      return null;
    }
    /**
     * レンダラのインスタンスを解放する
     */
    static delete(renderer) {
      renderer = null;
    }
    /**
     * レンダラの初期化処理を実行する
     * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
     * @param model モデルのインスタンス
     */
    initialize(model) {
      this._model = model;
    }
    /**
     * モデルを描画する
     */
    drawModel() {
      if (this.getModel() == null) return;
      this.saveProfile();
      this.doDrawModel();
      this.restoreProfile();
    }
    /**
     * Model-View-Projection 行列をセットする
     * 配列は複製されるので、元の配列は外で破棄して良い
     * @param matrix44 Model-View-Projection 行列
     */
    setMvpMatrix(matrix44) {
      this._mvpMatrix4x4.setMatrix(matrix44.getArray());
    }
    /**
     * Model-View-Projection 行列を取得する
     * @return Model-View-Projection 行列
     */
    getMvpMatrix() {
      return this._mvpMatrix4x4;
    }
    /**
     * モデルの色をセットする
     * 各色0.0~1.0の間で指定する（1.0が標準の状態）
     * @param red 赤チャンネルの値
     * @param green 緑チャンネルの値
     * @param blue 青チャンネルの値
     * @param alpha αチャンネルの値
     */
    setModelColor(red, green, blue, alpha) {
      if (red < 0) {
        red = 0;
      } else if (red > 1) {
        red = 1;
      }
      if (green < 0) {
        green = 0;
      } else if (green > 1) {
        green = 1;
      }
      if (blue < 0) {
        blue = 0;
      } else if (blue > 1) {
        blue = 1;
      }
      if (alpha < 0) {
        alpha = 0;
      } else if (alpha > 1) {
        alpha = 1;
      }
      this._modelColor.r = red;
      this._modelColor.g = green;
      this._modelColor.b = blue;
      this._modelColor.a = alpha;
    }
    /**
     * モデルの色を取得する
     * 各色0.0~1.0の間で指定する(1.0が標準の状態)
     *
     * @return RGBAのカラー情報
     */
    getModelColor() {
      return JSON.parse(JSON.stringify(this._modelColor));
    }
    /**
     * 透明度を考慮したモデルの色を計算する。
     *
     * @param opacity 透明度
     *
     * @return RGBAのカラー情報
     */
    getModelColorWithOpacity(opacity) {
      const modelColorRGBA = this.getModelColor();
      modelColorRGBA.a *= opacity;
      if (this.isPremultipliedAlpha()) {
        modelColorRGBA.r *= modelColorRGBA.a;
        modelColorRGBA.g *= modelColorRGBA.a;
        modelColorRGBA.b *= modelColorRGBA.a;
      }
      return modelColorRGBA;
    }
    /**
     * 乗算済みαの有効・無効をセットする
     * 有効にするならtrue、無効にするならfalseをセットする
     */
    setIsPremultipliedAlpha(enable) {
      this._isPremultipliedAlpha = enable;
    }
    /**
     * 乗算済みαの有効・無効を取得する
     * @return true 乗算済みのα有効
     * @return false 乗算済みのα無効
     */
    isPremultipliedAlpha() {
      return this._isPremultipliedAlpha;
    }
    /**
     * カリング（片面描画）の有効・無効をセットする。
     * 有効にするならtrue、無効にするならfalseをセットする
     */
    setIsCulling(culling) {
      this._isCulling = culling;
    }
    /**
     * カリング（片面描画）の有効・無効を取得する。
     * @return true カリング有効
     * @return false カリング無効
     */
    isCulling() {
      return this._isCulling;
    }
    /**
     * テクスチャの異方性フィルタリングのパラメータをセットする
     * パラメータ値の影響度はレンダラの実装に依存する
     * @param n パラメータの値
     */
    setAnisotropy(n) {
      this._anisotropy = n;
    }
    /**
     * テクスチャの異方性フィルタリングのパラメータをセットする
     * @return 異方性フィルタリングのパラメータ
     */
    getAnisotropy() {
      return this._anisotropy;
    }
    /**
     * レンダリングするモデルを取得する
     * @return レンダリングするモデル
     */
    getModel() {
      return this._model;
    }
    /**
     * マスク描画の方式を変更する。
     * falseの場合、マスクを1枚のテクスチャに分割してレンダリングする（デフォルト）
     * 高速だが、マスク個数の上限が36に限定され、質も荒くなる
     * trueの場合、パーツ描画の前にその都度必要なマスクを描き直す
     * レンダリング品質は高いが描画処理負荷は増す
     * @param high 高精細マスクに切り替えるか？
     */
    useHighPrecisionMask(high) {
      this._useHighPrecisionMask = high;
    }
    /**
     * マスクの描画方式を取得する
     * @return true 高精細方式
     * @return false デフォルト
     */
    isUsingHighPrecisionMask() {
      return this._useHighPrecisionMask;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._isCulling = false;
      this._isPremultipliedAlpha = false;
      this._anisotropy = 0;
      this._model = null;
      this._modelColor = new CubismTextureColor();
      this._useHighPrecisionMask = false;
      this._mvpMatrix4x4 = new CubismMatrix44();
      this._mvpMatrix4x4.loadIdentity();
    }
    // falseの場合、マスクを纏めて描画する trueの場合、マスクはパーツ描画ごとに書き直す
  };
  var CubismBlendMode = /* @__PURE__ */ ((CubismBlendMode2) => {
    CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
    CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
    CubismBlendMode2[CubismBlendMode2["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative";
    return CubismBlendMode2;
  })(CubismBlendMode || {});
  var CubismTextureColor = class {
    /**
     * コンストラクタ
     */
    constructor(r = 1, g = 1, b = 1, a = 1) {
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;
    }
    // αチャンネル
  };
  var CubismClippingContext = class {
    /**
     * 引数付きコンストラクタ
     */
    constructor(clippingDrawableIndices, clipCount) {
      this._clippingIdList = clippingDrawableIndices;
      this._clippingIdCount = clipCount;
      this._allClippedDrawRect = new csmRect();
      this._layoutBounds = new csmRect();
      this._clippedDrawableIndexList = [];
      this._matrixForMask = new CubismMatrix44();
      this._matrixForDraw = new CubismMatrix44();
      this._bufferIndex = 0;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      if (this._layoutBounds != null) {
        this._layoutBounds = null;
      }
      if (this._allClippedDrawRect != null) {
        this._allClippedDrawRect = null;
      }
      if (this._clippedDrawableIndexList != null) {
        this._clippedDrawableIndexList = null;
      }
    }
    /**
     * このマスクにクリップされる描画オブジェクトを追加する
     *
     * @param drawableIndex クリッピング対象に追加する描画オブジェクトのインデックス
     */
    addClippedDrawable(drawableIndex) {
      this._clippedDrawableIndexList.push(drawableIndex);
    }
    // このマスクが割り当てられるレンダーテクスチャ（フレームバッファ）やカラーバッファのインデックス
  };
  var Live2DCubismFramework7;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismBlendMode = CubismBlendMode;
    Live2DCubismFramework40.CubismRenderer = CubismRenderer;
    Live2DCubismFramework40.CubismTextureColor = CubismTextureColor;
  })(Live2DCubismFramework7 || (Live2DCubismFramework7 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/cubismframeworkconfig.ts
  var CSM_LOG_LEVEL_VERBOSE = 0;
  var CSM_LOG_LEVEL_DEBUG = 1;
  var CSM_LOG_LEVEL_INFO = 2;
  var CSM_LOG_LEVEL_WARNING = 3;
  var CSM_LOG_LEVEL_ERROR = 4;
  var CSM_LOG_LEVEL = CSM_LOG_LEVEL_VERBOSE;

  // desktop-pet/_sdk/samples2/Framework/src/utils/cubismdebug.ts
  var CubismLogPrint = (level, fmt, args) => {
    CubismDebug.print(level, "[CSM]" + fmt, args);
  };
  var CubismLogPrintIn = (level, fmt, args) => {
    CubismLogPrint(level, fmt + "\n", args);
  };
  var CSM_ASSERT = (expr) => {
    console.assert(expr);
  };
  var CubismLogVerbose;
  var CubismLogDebug;
  var CubismLogInfo;
  var CubismLogWarning;
  var CubismLogError;
  if (CSM_LOG_LEVEL <= CSM_LOG_LEVEL_VERBOSE) {
    CubismLogVerbose = (fmt, ...args) => {
      CubismLogPrintIn(0 /* LogLevel_Verbose */, "[V]" + fmt, args);
    };
    CubismLogDebug = (fmt, ...args) => {
      CubismLogPrintIn(1 /* LogLevel_Debug */, "[D]" + fmt, args);
    };
    CubismLogInfo = (fmt, ...args) => {
      CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
    };
    CubismLogWarning = (fmt, ...args) => {
      CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
    };
    CubismLogError = (fmt, ...args) => {
      CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
    };
  } else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_DEBUG) {
    CubismLogDebug = (fmt, ...args) => {
      CubismLogPrintIn(1 /* LogLevel_Debug */, "[D]" + fmt, args);
    };
    CubismLogInfo = (fmt, ...args) => {
      CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
    };
    CubismLogWarning = (fmt, ...args) => {
      CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
    };
    CubismLogError = (fmt, ...args) => {
      CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
    };
  } else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_INFO) {
    CubismLogInfo = (fmt, ...args) => {
      CubismLogPrintIn(2 /* LogLevel_Info */, "[I]" + fmt, args);
    };
    CubismLogWarning = (fmt, ...args) => {
      CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
    };
    CubismLogError = (fmt, ...args) => {
      CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
    };
  } else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_WARNING) {
    CubismLogWarning = (fmt, ...args) => {
      CubismLogPrintIn(3 /* LogLevel_Warning */, "[W]" + fmt, args);
    };
    CubismLogError = (fmt, ...args) => {
      CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
    };
  } else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_ERROR) {
    CubismLogError = (fmt, ...args) => {
      CubismLogPrintIn(4 /* LogLevel_Error */, "[E]" + fmt, args);
    };
  }
  var CubismDebug = class {
    /**
     * ログを出力する。第一引数にログレベルを設定する。
     * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
     *
     * @param logLevel ログレベルの設定
     * @param format 書式付き文字列
     * @param args 可変長引数
     */
    static print(logLevel, format, args) {
      if (logLevel < CubismFramework.getLoggingLevel()) {
        return;
      }
      const logPrint = CubismFramework.coreLogFunction;
      if (!logPrint) return;
      const buffer = format.replace(/\{(\d+)\}/g, (m, k) => {
        return args[k];
      });
      logPrint(buffer);
    }
    /**
     * データから指定した長さだけダンプ出力する。
     * CubismFramework.initialize()時にオプションで設定されたログ出力レベルを下回る場合はログに出さない。
     *
     * @param logLevel ログレベルの設定
     * @param data ダンプするデータ
     * @param length ダンプする長さ
     */
    static dumpBytes(logLevel, data, length) {
      for (let i = 0; i < length; i++) {
        if (i % 16 == 0 && i > 0) this.print(logLevel, "\n");
        else if (i % 8 == 0 && i > 0) this.print(logLevel, "  ");
        this.print(logLevel, "{0} ", [data[i] & 255]);
      }
      this.print(logLevel, "\n");
    }
    /**
     * private コンストラクタ
     */
    constructor() {
    }
  };
  var Live2DCubismFramework8;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismDebug = CubismDebug;
  })(Live2DCubismFramework8 || (Live2DCubismFramework8 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/type/csmmap.ts
  var csmPair = class {
    /**
     * コンストラクタ
     * @param key Keyとしてセットする値
     * @param value Valueとしてセットする値
     */
    constructor(key, value) {
      this.first = key == void 0 ? null : key;
      this.second = value == void 0 ? null : value;
    }
    // valueとして用いる変数
  };
  var _csmMap = class _csmMap {
    /**
     * 引数付きコンストラクタ
     * @param size 初期化時点で確保するサイズ
     */
    constructor(size) {
      if (size != void 0) {
        if (size < 1) {
          this._keyValues = [];
          this._dummyValue = null;
          this._size = 0;
        } else {
          this._keyValues = new Array(size);
          this._size = size;
        }
      } else {
        this._keyValues = [];
        this._dummyValue = null;
        this._size = 0;
      }
    }
    /**
     * デストラクタ
     */
    release() {
      this.clear();
    }
    /**
     * キーを追加する
     * @param key 新たに追加するキー
     */
    appendKey(key) {
      this.prepareCapacity(this._size + 1, false);
      this._keyValues[this._size] = new csmPair(key);
      this._size += 1;
    }
    /**
     * 添字演算子[key]のオーバーロード(get)
     * @param key 添字から特定されるValue値
     */
    getValue(key) {
      let found = -1;
      for (let i = 0; i < this._size; i++) {
        if (this._keyValues[i].first == key) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        return this._keyValues[found].second;
      } else {
        this.appendKey(key);
        return this._keyValues[this._size - 1].second;
      }
    }
    /**
     * 添字演算子[key]のオーバーロード(set)
     * @param key 添字から特定されるValue値
     * @param value 代入するValue値
     */
    setValue(key, value) {
      let found = -1;
      for (let i = 0; i < this._size; i++) {
        if (this._keyValues[i].first == key) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        this._keyValues[found].second = value;
      } else {
        this.appendKey(key);
        this._keyValues[this._size - 1].second = value;
      }
    }
    /**
     * 引数で渡したKeyを持つ要素が存在するか
     * @param key 存在を確認するkey
     * @return true 引数で渡したkeyを持つ要素が存在する
     * @return false 引数で渡したkeyを持つ要素が存在しない
     */
    isExist(key) {
      for (let i = 0; i < this._size; i++) {
        if (this._keyValues[i].first == key) {
          return true;
        }
      }
      return false;
    }
    /**
     * keyValueのポインタを全て解放する
     */
    clear() {
      this._keyValues = void 0;
      this._keyValues = null;
      this._keyValues = [];
      this._size = 0;
    }
    /**
     * コンテナのサイズを取得する
     *
     * @return コンテナのサイズ
     */
    getSize() {
      return this._size;
    }
    /**
     * コンテナのキャパシティを確保する
     * @param newSize 新たなキャパシティ。引数の値が現在のサイズ未満の場合は何もしない。
     * @param fitToSize trueなら指定したサイズに合わせる。falseならサイズを2倍確保しておく。
     */
    prepareCapacity(newSize, fitToSize) {
      if (newSize > this._keyValues.length) {
        if (this._keyValues.length == 0) {
          if (!fitToSize && newSize < _csmMap.DefaultSize)
            newSize = _csmMap.DefaultSize;
          this._keyValues.length = newSize;
        } else {
          if (!fitToSize && newSize < this._keyValues.length * 2)
            newSize = this._keyValues.length * 2;
          this._keyValues.length = newSize;
        }
      }
    }
    /**
     * コンテナの先頭要素を返す
     */
    begin() {
      const ite = new iterator2(this, 0);
      return ite;
    }
    /**
     * コンテナの終端要素を返す
     */
    end() {
      const ite = new iterator2(
        this,
        this._size
      );
      return ite;
    }
    /**
     * コンテナから要素を削除する
     *
     * @param ite 削除する要素
     */
    erase(ite) {
      const index = ite._index;
      if (index < 0 || this._size <= index) {
        return ite;
      }
      this._keyValues.splice(index, 1);
      --this._size;
      const ite2 = new iterator2(
        this,
        index
      );
      return ite2;
    }
    /**
     * コンテナの値を32ビット符号付き整数型でダンプする
     */
    dumpAsInt() {
      for (let i = 0; i < this._size; i++) {
        CubismLogDebug("{0} ,", this._keyValues[i]);
        CubismLogDebug("\n");
      }
    }
    // コンテナの要素数
  };
  _csmMap.DefaultSize = 10;
  var csmMap = _csmMap;
  var iterator2 = class _iterator {
    /**
     * コンストラクタ
     */
    constructor(v, idx) {
      this._map = v != void 0 ? v : new csmMap();
      this._index = idx != void 0 ? idx : 0;
    }
    /**
     * =演算子のオーバーロード
     */
    set(ite) {
      this._index = ite._index;
      this._map = ite._map;
      return this;
    }
    /**
     * 前置き++演算子のオーバーロード
     */
    preIncrement() {
      ++this._index;
      return this;
    }
    /**
     * 前置き--演算子のオーバーロード
     */
    preDecrement() {
      --this._index;
      return this;
    }
    /**
     * 後置き++演算子のオーバーロード
     */
    increment() {
      const iteold = new _iterator(this._map, this._index++);
      return iteold;
    }
    /**
     * 後置き--演算子のオーバーロード
     */
    decrement() {
      const iteold = new _iterator(this._map, this._index);
      this._map = iteold._map;
      this._index = iteold._index;
      return this;
    }
    /**
     * *演算子のオーバーロード
     */
    ptr() {
      return this._map._keyValues[this._index];
    }
    /**
     * !=演算
     */
    notEqual(ite) {
      return this._index != ite._index || this._map != ite._map;
    }
    // コンテナ
  };
  var Live2DCubismFramework9;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.csmMap = csmMap;
    Live2DCubismFramework40.csmPair = csmPair;
    Live2DCubismFramework40.iterator = iterator2;
  })(Live2DCubismFramework9 || (Live2DCubismFramework9 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/utils/cubismjsonextension.ts
  var CubismJsonExtension = class _CubismJsonExtension {
    static parseJsonObject(obj, map) {
      Object.keys(obj).forEach((key) => {
        if (typeof obj[key] == "boolean") {
          const convValue = Boolean(obj[key]);
          map.put(key, new JsonBoolean(convValue));
        } else if (typeof obj[key] == "string") {
          const convValue = String(obj[key]);
          map.put(key, new JsonString(convValue));
        } else if (typeof obj[key] == "number") {
          const convValue = Number(obj[key]);
          map.put(key, new JsonFloat(convValue));
        } else if (obj[key] instanceof Array) {
          map.put(key, _CubismJsonExtension.parseJsonArray(obj[key]));
        } else if (obj[key] instanceof Object) {
          map.put(
            key,
            _CubismJsonExtension.parseJsonObject(obj[key], new JsonMap())
          );
        } else if (obj[key] == null) {
          map.put(key, new JsonNullvalue());
        } else {
          map.put(key, obj[key]);
        }
      });
      return map;
    }
    static parseJsonArray(obj) {
      const arr = new JsonArray();
      Object.keys(obj).forEach((key) => {
        const convKey = Number(key);
        if (typeof convKey == "number") {
          if (typeof obj[key] == "boolean") {
            const convValue = Boolean(obj[key]);
            arr.add(new JsonBoolean(convValue));
          } else if (typeof obj[key] == "string") {
            const convValue = String(obj[key]);
            arr.add(new JsonString(convValue));
          } else if (typeof obj[key] == "number") {
            const convValue = Number(obj[key]);
            arr.add(new JsonFloat(convValue));
          } else if (obj[key] instanceof Array) {
            arr.add(this.parseJsonArray(obj[key]));
          } else if (obj[key] instanceof Object) {
            arr.add(this.parseJsonObject(obj[key], new JsonMap()));
          } else if (obj[key] == null) {
            arr.add(new JsonNullvalue());
          } else {
            arr.add(obj[key]);
          }
        } else if (obj[key] instanceof Array) {
          arr.add(this.parseJsonArray(obj[key]));
        } else if (obj[key] instanceof Object) {
          arr.add(this.parseJsonObject(obj[key], new JsonMap()));
        } else if (obj[key] == null) {
          arr.add(new JsonNullvalue());
        } else {
          const convValue = Array(obj[key]);
          for (let i = 0; i < convValue.length; i++) {
            arr.add(convValue[i]);
          }
        }
      });
      return arr;
    }
  };

  // desktop-pet/_sdk/samples2/Framework/src/utils/cubismjson.ts
  var CSM_JSON_ERROR_TYPE_MISMATCH = "Error: type mismatch";
  var CSM_JSON_ERROR_INDEX_OF_BOUNDS = "Error: index out of bounds";
  var Value2 = class _Value {
    /**
     * コンストラクタ
     */
    constructor() {
    }
    /**
     * 要素を文字列型で返す(string)
     */
    getRawString(defaultValue, indent) {
      return this.getString(defaultValue, indent);
    }
    /**
     * 要素を数値型で返す(number)
     */
    toInt(defaultValue = 0) {
      return defaultValue;
    }
    /**
     * 要素を数値型で返す(number)
     */
    toFloat(defaultValue = 0) {
      return defaultValue;
    }
    /**
     * 要素を真偽値で返す(boolean)
     */
    toBoolean(defaultValue = false) {
      return defaultValue;
    }
    /**
     * サイズを返す
     */
    getSize() {
      return 0;
    }
    /**
     * 要素を配列で返す(Value[])
     */
    getArray(defaultValue = null) {
      return defaultValue;
    }
    /**
     * 要素をコンテナで返す(array)
     */
    getVector(defaultValue = new csmVector()) {
      return defaultValue;
    }
    /**
     * 要素をマップで返す(csmMap<csmString, Value>)
     */
    getMap(defaultValue) {
      return defaultValue;
    }
    /**
     * 添字演算子[index]
     */
    getValueByIndex(index) {
      return _Value.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_TYPE_MISMATCH
      );
    }
    /**
     * 添字演算子[string | csmString]
     */
    getValueByString(s) {
      return _Value.nullValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_TYPE_MISMATCH
      );
    }
    /**
     * マップのキー一覧をコンテナで返す
     *
     * @return マップのキーの一覧
     */
    getKeys() {
      return _Value.dummyKeys;
    }
    /**
     * Valueの種類がエラー値ならtrue
     */
    isError() {
      return false;
    }
    /**
     * Valueの種類がnullならtrue
     */
    isNull() {
      return false;
    }
    /**
     * Valueの種類が真偽値ならtrue
     */
    isBool() {
      return false;
    }
    /**
     * Valueの種類が数値型ならtrue
     */
    isFloat() {
      return false;
    }
    /**
     * Valueの種類が文字列ならtrue
     */
    isString() {
      return false;
    }
    /**
     * Valueの種類が配列ならtrue
     */
    isArray() {
      return false;
    }
    /**
     * Valueの種類がマップ型ならtrue
     */
    isMap() {
      return false;
    }
    equals(value) {
      return false;
    }
    /**
     * Valueの値が静的ならtrue、静的なら解放しない
     */
    isStatic() {
      return false;
    }
    /**
     * Valueにエラー値をセットする
     */
    setErrorNotForClientCall(errorStr) {
      return JsonError.errorValue;
    }
    /**
     * 初期化用メソッド
     */
    static staticInitializeNotForClientCall() {
      JsonBoolean.trueValue = new JsonBoolean(true);
      JsonBoolean.falseValue = new JsonBoolean(false);
      _Value.errorValue = new JsonError("ERROR", true);
      _Value.nullValue = new JsonNullvalue();
      _Value.dummyKeys = new csmVector();
    }
    /**
     * リリース用メソッド
     */
    static staticReleaseNotForClientCall() {
      JsonBoolean.trueValue = null;
      JsonBoolean.falseValue = null;
      _Value.errorValue = null;
      _Value.nullValue = null;
      _Value.dummyKeys = null;
    }
    // 明示的に連想配列をany型で指定
  };
  var CubismJson = class _CubismJson {
    /**
     * コンストラクタ
     */
    constructor(buffer, length) {
      this._parseCallback = CubismJsonExtension.parseJsonObject;
      this._error = null;
      this._lineCount = 0;
      this._root = null;
      if (buffer != void 0) {
        this.parseBytes(buffer, length, this._parseCallback);
      }
    }
    /**
     * バイトデータから直接ロードしてパースする
     *
     * @param buffer バッファ
     * @param size バッファサイズ
     * @return CubismJsonクラスのインスタンス。失敗したらNULL
     */
    static create(buffer, size) {
      const json = new _CubismJson();
      const succeeded = json.parseBytes(
        buffer,
        size,
        json._parseCallback
      );
      if (!succeeded) {
        _CubismJson.delete(json);
        return null;
      } else {
        return json;
      }
    }
    /**
     * パースしたJSONオブジェクトの解放処理
     *
     * @param instance CubismJsonクラスのインスタンス
     */
    static delete(instance) {
      instance = null;
    }
    /**
     * パースしたJSONのルート要素を返す
     */
    getRoot() {
      return this._root;
    }
    /**
     *  UnicodeのバイナリをStringに変換
     *
     * @param buffer 変換するバイナリデータ
     * @return 変換後の文字列
     */
    static arrayBufferToString(buffer) {
      const uint8Array = new Uint8Array(buffer);
      let str = "";
      for (let i = 0, len = uint8Array.length; i < len; ++i) {
        str += "%" + this.pad(uint8Array[i].toString(16));
      }
      str = decodeURIComponent(str);
      return str;
    }
    /**
     * エンコード、パディング
     */
    static pad(n) {
      return n.length < 2 ? "0" + n : n;
    }
    /**
     * JSONのパースを実行する
     * @param buffer    パース対象のデータバイト
     * @param size      データバイトのサイズ
     * return true : 成功
     * return false: 失敗
     */
    parseBytes(buffer, size, parseCallback) {
      const endPos = new Array(1);
      const decodeBuffer = _CubismJson.arrayBufferToString(buffer);
      if (parseCallback == void 0) {
        this._root = this.parseValue(decodeBuffer, size, 0, endPos);
      } else {
        this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
      }
      if (this._error) {
        let strbuf = "\0";
        strbuf = "Json parse error : @line " + (this._lineCount + 1) + "\n";
        this._root = new JsonString(strbuf);
        CubismLogInfo("{0}", this._root.getRawString());
        return false;
      } else if (this._root == null) {
        this._root = new JsonError(new csmString(this._error), false);
        return false;
      }
      return true;
    }
    /**
     * パース時のエラー値を返す
     */
    getParseError() {
      return this._error;
    }
    /**
     * ルート要素の次の要素がファイルの終端だったらtrueを返す
     */
    checkEndOfFile() {
      return this._root.getArray()[1].equals("EOF");
    }
    /**
     * JSONエレメントからValue(float,String,Value*,Array,null,true,false)をパースする
     * エレメントの書式に応じて内部でParseString(), ParseObject(), ParseArray()を呼ぶ
     *
     * @param   buffer      JSONエレメントのバッファ
     * @param   length      パースする長さ
     * @param   begin       パースを開始する位置
     * @param   outEndPos   パース終了時の位置
     * @return      パースから取得したValueオブジェクト
     */
    parseValue(buffer, length, begin, outEndPos) {
      if (this._error) return null;
      let o = null;
      let i = begin;
      let f;
      for (; i < length; i++) {
        const c = buffer[i];
        switch (c) {
          case "-":
          case ".":
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9": {
            const afterString = new Array(1);
            f = strtod(buffer.slice(i), afterString);
            outEndPos[0] = buffer.indexOf(afterString[0]);
            return new JsonFloat(f);
          }
          case '"':
            return new JsonString(
              this.parseString(buffer, length, i + 1, outEndPos)
            );
          // \"の次の文字から
          case "[":
            o = this.parseArray(buffer, length, i + 1, outEndPos);
            return o;
          case "{":
            o = this.parseObject(buffer, length, i + 1, outEndPos);
            return o;
          case "n":
            if (i + 3 < length) {
              o = new JsonNullvalue();
              outEndPos[0] = i + 4;
            } else {
              this._error = "parse null";
            }
            return o;
          case "t":
            if (i + 3 < length) {
              o = JsonBoolean.trueValue;
              outEndPos[0] = i + 4;
            } else {
              this._error = "parse true";
            }
            return o;
          case "f":
            if (i + 4 < length) {
              o = JsonBoolean.falseValue;
              outEndPos[0] = i + 5;
            } else {
              this._error = "illegal ',' position";
            }
            return o;
          case ",":
            this._error = "illegal ',' position";
            return null;
          case "]":
            outEndPos[0] = i;
            return null;
          case "\n":
            this._lineCount++;
          // falls through
          case " ":
          case "	":
          case "\r":
          default:
            break;
        }
      }
      this._error = "illegal end of value";
      return null;
    }
    /**
     * 次の「"」までの文字列をパースする。
     *
     * @param   string  ->  パース対象の文字列
     * @param   length  ->  パースする長さ
     * @param   begin   ->  パースを開始する位置
     * @param  outEndPos   ->  パース終了時の位置
     * @return      パースした文F字列要素
     */
    parseString(string, length, begin, outEndPos) {
      if (this._error) {
        return null;
      }
      if (!string) {
        this._error = "string is null";
        return null;
      }
      let i = begin;
      let c, c2;
      const ret = new csmString("");
      let bufStart = begin;
      for (; i < length; i++) {
        c = string[i];
        switch (c) {
          case '"': {
            outEndPos[0] = i + 1;
            ret.append(string.slice(bufStart), i - bufStart);
            return ret.s;
          }
          // falls through
          case "//": {
            i++;
            if (i - 1 > bufStart) {
              ret.append(string.slice(bufStart), i - bufStart);
            }
            bufStart = i + 1;
            if (i < length) {
              c2 = string[i];
              switch (c2) {
                case "\\":
                  ret.expansion(1, "\\");
                  break;
                case '"':
                  ret.expansion(1, '"');
                  break;
                case "/":
                  ret.expansion(1, "/");
                  break;
                case "b":
                  ret.expansion(1, "\b");
                  break;
                case "f":
                  ret.expansion(1, "\f");
                  break;
                case "n":
                  ret.expansion(1, "\n");
                  break;
                case "r":
                  ret.expansion(1, "\r");
                  break;
                case "t":
                  ret.expansion(1, "	");
                  break;
                case "u":
                  this._error = "parse string/unicord escape not supported";
                  break;
                default:
                  break;
              }
            } else {
              this._error = "parse string/escape error";
            }
          }
          // falls through
          default: {
            break;
          }
        }
      }
      this._error = "parse string/illegal end";
      return null;
    }
    /**
     * JSONのオブジェクトエレメントをパースしてValueオブジェクトを返す
     *
     * @param buffer    JSONエレメントのバッファ
     * @param length    パースする長さ
     * @param begin     パースを開始する位置
     * @param outEndPos パース終了時の位置
     * @return パースから取得したValueオブジェクト
     */
    parseObject(buffer, length, begin, outEndPos) {
      if (this._error) {
        return null;
      }
      if (!buffer) {
        this._error = "buffer is null";
        return null;
      }
      const ret = new JsonMap();
      let key = "";
      let i = begin;
      let c = "";
      const localRetEndPos2 = Array(1);
      let ok = false;
      for (; i < length; i++) {
        FOR_LOOP: for (; i < length; i++) {
          c = buffer[i];
          switch (c) {
            case '"':
              key = this.parseString(buffer, length, i + 1, localRetEndPos2);
              if (this._error) {
                return null;
              }
              i = localRetEndPos2[0];
              ok = true;
              break FOR_LOOP;
            //-- loopから出る
            case "}":
              outEndPos[0] = i + 1;
              return ret;
            // 空
            case ":":
              this._error = "illegal ':' position";
              break;
            case "\n":
              this._lineCount++;
            // falls through
            default:
              break;
          }
        }
        if (!ok) {
          this._error = "key not found";
          return null;
        }
        ok = false;
        FOR_LOOP2: for (; i < length; i++) {
          c = buffer[i];
          switch (c) {
            case ":":
              ok = true;
              i++;
              break FOR_LOOP2;
            case "}":
              this._error = "illegal '}' position";
              break;
            // falls through
            case "\n":
              this._lineCount++;
            // case ' ': case '\t' : case '\r':
            // falls through
            default:
              break;
          }
        }
        if (!ok) {
          this._error = "':' not found";
          return null;
        }
        const value = this.parseValue(buffer, length, i, localRetEndPos2);
        if (this._error) {
          return null;
        }
        i = localRetEndPos2[0];
        ret.put(key, value);
        FOR_LOOP3: for (; i < length; i++) {
          c = buffer[i];
          switch (c) {
            case ",":
              break FOR_LOOP3;
            case "}":
              outEndPos[0] = i + 1;
              return ret;
            // 正常終了
            case "\n":
              this._lineCount++;
            // falls through
            default:
              break;
          }
        }
      }
      this._error = "illegal end of perseObject";
      return null;
    }
    /**
     * 次の「"」までの文字列をパースする。
     * @param buffer    JSONエレメントのバッファ
     * @param length    パースする長さ
     * @param begin     パースを開始する位置
     * @param outEndPos パース終了時の位置
     * @return パースから取得したValueオブジェクト
     */
    parseArray(buffer, length, begin, outEndPos) {
      if (this._error) {
        return null;
      }
      if (!buffer) {
        this._error = "buffer is null";
        return null;
      }
      let ret = new JsonArray();
      let i = begin;
      let c;
      const localRetEndpos2 = new Array(1);
      for (; i < length; i++) {
        const value = this.parseValue(buffer, length, i, localRetEndpos2);
        if (this._error) {
          return null;
        }
        i = localRetEndpos2[0];
        if (value) {
          ret.add(value);
        }
        FOR_LOOP: for (; i < length; i++) {
          c = buffer[i];
          switch (c) {
            case ",":
              break FOR_LOOP;
            case "]":
              outEndPos[0] = i + 1;
              return ret;
            // 終了
            case "\n":
              ++this._lineCount;
            //case ' ': case '\t': case '\r':
            // falls through
            default:
              break;
          }
        }
      }
      ret = void 0;
      this._error = "illegal end of parseObject";
      return null;
    }
    // パースされたルート要素
  };
  var JsonFloat = class extends Value2 {
    /**
     * コンストラクタ
     */
    constructor(v) {
      super();
      this._value = v;
    }
    /**
     * Valueの種類が数値型ならtrue
     */
    isFloat() {
      return true;
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      const strbuf = "\0";
      this._value = parseFloat(strbuf);
      this._stringBuffer = strbuf;
      return this._stringBuffer;
    }
    /**
     * 要素を数値型で返す(number)
     */
    toInt(defaultValue = 0) {
      return parseInt(this._value.toString());
    }
    /**
     * 要素を数値型で返す(number)
     */
    toFloat(defaultValue = 0) {
      return this._value;
    }
    equals(value) {
      if ("number" === typeof value) {
        if (Math.round(value)) {
          return false;
        } else {
          return value == this._value;
        }
      }
      return false;
    }
    // JSON要素の値
  };
  var JsonBoolean = class extends Value2 {
    /**
     * Valueの種類が真偽値ならtrue
     */
    isBool() {
      return true;
    }
    /**
     * 要素を真偽値で返す(boolean)
     */
    toBoolean(defaultValue = false) {
      return this._boolValue;
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      this._stringBuffer = this._boolValue ? "true" : "false";
      return this._stringBuffer;
    }
    equals(value) {
      if ("boolean" === typeof value) {
        return value == this._boolValue;
      }
      return false;
    }
    /**
     * Valueの値が静的ならtrue, 静的なら解放しない
     */
    isStatic() {
      return true;
    }
    /**
     * 引数付きコンストラクタ
     */
    constructor(v) {
      super();
      this._boolValue = v;
    }
    // JSON要素の値
  };
  var JsonString = class extends Value2 {
    constructor(s) {
      super();
      if ("string" === typeof s) {
        this._stringBuffer = s;
      }
      if (s instanceof csmString) {
        this._stringBuffer = s.s;
      }
    }
    /**
     * Valueの種類が文字列ならtrue
     */
    isString() {
      return true;
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      return this._stringBuffer;
    }
    equals(value) {
      if ("string" === typeof value) {
        return this._stringBuffer == value;
      }
      if (value instanceof csmString) {
        return this._stringBuffer == value.s;
      }
      return false;
    }
  };
  var JsonError = class extends JsonString {
    /**
     * Valueの値が静的ならtrue、静的なら解放しない
     */
    isStatic() {
      return this._isStatic;
    }
    /**
     * エラー情報をセットする
     */
    setErrorNotForClientCall(s) {
      this._stringBuffer = s;
      return this;
    }
    /**
     * 引数付きコンストラクタ
     */
    constructor(s, isStatic) {
      if ("string" === typeof s) {
        super(s);
      } else {
        super(s);
      }
      this._isStatic = isStatic;
    }
    /**
     * Valueの種類がエラー値ならtrue
     */
    isError() {
      return true;
    }
    // 静的なValueかどうか
  };
  var JsonNullvalue = class extends Value2 {
    /**
     * Valueの種類がNULL値ならtrue
     */
    isNull() {
      return true;
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      return this._stringBuffer;
    }
    /**
     * Valueの値が静的ならtrue, 静的なら解放しない
     */
    isStatic() {
      return true;
    }
    /**
     * Valueにエラー値をセットする
     */
    setErrorNotForClientCall(s) {
      this._stringBuffer = s;
      return JsonError.nullValue;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._stringBuffer = "NullValue";
    }
  };
  var JsonArray = class extends Value2 {
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._array = new csmVector();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      for (let ite = this._array.begin(); ite.notEqual(this._array.end()); ite.preIncrement()) {
        let v = ite.ptr();
        if (v && !v.isStatic()) {
          v = void 0;
          v = null;
        }
      }
    }
    /**
     * Valueの種類が配列ならtrue
     */
    isArray() {
      return true;
    }
    /**
     * 添字演算子[index]
     */
    getValueByIndex(index) {
      if (index < 0 || this._array.getSize() <= index) {
        return Value2.errorValue.setErrorNotForClientCall(
          CSM_JSON_ERROR_INDEX_OF_BOUNDS
        );
      }
      const v = this._array.at(index);
      if (v == null) {
        return Value2.nullValue;
      }
      return v;
    }
    /**
     * 添字演算子[string | csmString]
     */
    getValueByString(s) {
      return Value2.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_TYPE_MISMATCH
      );
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      const stringBuffer = indent + "[\n";
      for (let ite = this._array.begin(); ite.notEqual(this._array.end()); ite.increment()) {
        const v = ite.ptr();
        this._stringBuffer += indent + "" + v.getString(indent + " ") + "\n";
      }
      this._stringBuffer = stringBuffer + indent + "]\n";
      return this._stringBuffer;
    }
    /**
     * 配列要素を追加する
     * @param v 追加する要素
     */
    add(v) {
      this._array.pushBack(v);
    }
    /**
     * 要素をコンテナで返す(csmVector<Value>)
     */
    getVector(defaultValue = null) {
      return this._array;
    }
    /**
     * 要素の数を返す
     */
    getSize() {
      return this._array.getSize();
    }
    // JSON要素の値
  };
  var JsonMap = class extends Value2 {
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._map = new csmMap();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      const ite = this._map.begin();
      while (ite.notEqual(this._map.end())) {
        let v = ite.ptr().second;
        if (v && !v.isStatic()) {
          v = void 0;
          v = null;
        }
        ite.preIncrement();
      }
    }
    /**
     * Valueの値がMap型ならtrue
     */
    isMap() {
      return true;
    }
    /**
     * 添字演算子[string | csmString]
     */
    getValueByString(s) {
      if (s instanceof csmString) {
        const ret = this._map.getValue(s.s);
        if (ret == null) {
          return Value2.nullValue;
        }
        return ret;
      }
      for (let iter = this._map.begin(); iter.notEqual(this._map.end()); iter.preIncrement()) {
        if (iter.ptr().first == s) {
          if (iter.ptr().second == null) {
            return Value2.nullValue;
          }
          return iter.ptr().second;
        }
      }
      return Value2.nullValue;
    }
    /**
     * 添字演算子[index]
     */
    getValueByIndex(index) {
      return Value2.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_TYPE_MISMATCH
      );
    }
    /**
     * 要素を文字列で返す(csmString型)
     */
    getString(defaultValue, indent) {
      this._stringBuffer = indent + "{\n";
      const ite = this._map.begin();
      while (ite.notEqual(this._map.end())) {
        const key = ite.ptr().first;
        const v = ite.ptr().second;
        this._stringBuffer += indent + " " + key + " : " + v.getString(indent + "   ") + " \n";
        ite.preIncrement();
      }
      this._stringBuffer += indent + "}\n";
      return this._stringBuffer;
    }
    /**
     * 要素をMap型で返す
     */
    getMap(defaultValue) {
      return this._map;
    }
    /**
     * Mapに要素を追加する
     */
    put(key, v) {
      this._map.setValue(key, v);
    }
    /**
     * Mapからキーのリストを取得する
     */
    getKeys() {
      if (!this._keys) {
        this._keys = new csmVector();
        const ite = this._map.begin();
        while (ite.notEqual(this._map.end())) {
          const key = ite.ptr().first;
          this._keys.pushBack(key);
          ite.preIncrement();
        }
      }
      return this._keys;
    }
    /**
     * Mapの要素数を取得する
     */
    getSize() {
      return this._keys.getSize();
    }
    // JSON要素の値
  };
  var Live2DCubismFramework10;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismJson = CubismJson;
    Live2DCubismFramework40.JsonArray = JsonArray;
    Live2DCubismFramework40.JsonBoolean = JsonBoolean;
    Live2DCubismFramework40.JsonError = JsonError;
    Live2DCubismFramework40.JsonFloat = JsonFloat;
    Live2DCubismFramework40.JsonMap = JsonMap;
    Live2DCubismFramework40.JsonNullvalue = JsonNullvalue;
    Live2DCubismFramework40.JsonString = JsonString;
    Live2DCubismFramework40.Value = Value2;
  })(Live2DCubismFramework10 || (Live2DCubismFramework10 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/live2dcubismframework.ts
  function strtod(s, endPtr) {
    let index = 0;
    for (let i = 1; ; i++) {
      const testC = s.slice(i - 1, i);
      if (testC == "e" || testC == "-" || testC == "E") {
        continue;
      }
      const test = s.substring(0, i);
      const number = Number(test);
      if (isNaN(number)) {
        break;
      }
      index = i;
    }
    let d = parseFloat(s);
    if (isNaN(d)) {
      d = NaN;
    }
    endPtr[0] = s.slice(index);
    return d;
  }
  var s_isStarted = false;
  var s_isInitialized = false;
  var s_option = null;
  var s_cubismIdManager = null;
  var Constant = Object.freeze({
    vertexOffset: 0,
    // メッシュ頂点のオフセット値
    vertexStep: 2
    // メッシュ頂点のステップ値
  });
  function csmDelete(address) {
    if (!address) {
      return;
    }
    address = void 0;
  }
  var CubismFramework = class {
    /**
     * Cubism FrameworkのAPIを使用可能にする。
     *  APIを実行する前に必ずこの関数を実行すること。
     *  一度準備が完了して以降は、再び実行しても内部処理がスキップされます。
     *
     * @param    option      Optionクラスのインスタンス
     *
     * @return   準備処理が完了したらtrueが返ります。
     */
    static startUp(option = null) {
      if (s_isStarted) {
        CubismLogInfo("CubismFramework.startUp() is already done.");
        return s_isStarted;
      }
      s_option = option;
      if (s_option != null) {
        Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
      }
      s_isStarted = true;
      if (s_isStarted) {
        const version = Live2DCubismCore.Version.csmGetVersion();
        const major = (version & 4278190080) >> 24;
        const minor = (version & 16711680) >> 16;
        const patch = version & 65535;
        const versionNumber = version;
        CubismLogInfo(
          `Live2D Cubism Core version: {0}.{1}.{2} ({3})`,
          ("00" + major).slice(-2),
          ("00" + minor).slice(-2),
          ("0000" + patch).slice(-4),
          versionNumber
        );
      }
      CubismLogInfo("CubismFramework.startUp() is complete.");
      return s_isStarted;
    }
    /**
     * StartUp()で初期化したCubismFrameworkの各パラメータをクリアします。
     * Dispose()したCubismFrameworkを再利用する際に利用してください。
     */
    static cleanUp() {
      s_isStarted = false;
      s_isInitialized = false;
      s_option = null;
      s_cubismIdManager = null;
    }
    /**
     * Cubism Framework内のリソースを初期化してモデルを表示可能な状態にします。<br>
     *     再度Initialize()するには先にDispose()を実行する必要があります。
     *
     * @param memorySize 初期化時メモリ量 [byte(s)]
     *    複数モデル表示時などにモデルが更新されない際に使用してください。
     *    指定する際は必ず1024*1024*16 byte(16MB)以上の値を指定してください。
     *    それ以外はすべて1024*1024*16 byteに丸めます。
     */
    static initialize(memorySize = 0) {
      CSM_ASSERT(s_isStarted);
      if (!s_isStarted) {
        CubismLogWarning("CubismFramework is not started.");
        return;
      }
      if (s_isInitialized) {
        CubismLogWarning(
          "CubismFramework.initialize() skipped, already initialized."
        );
        return;
      }
      Value2.staticInitializeNotForClientCall();
      s_cubismIdManager = new CubismIdManager();
      Live2DCubismCore.Memory.initializeAmountOfMemory(memorySize);
      s_isInitialized = true;
      CubismLogInfo("CubismFramework.initialize() is complete.");
    }
    /**
     * Cubism Framework内の全てのリソースを解放します。
     *      ただし、外部で確保されたリソースについては解放しません。
     *      外部で適切に破棄する必要があります。
     */
    static dispose() {
      CSM_ASSERT(s_isStarted);
      if (!s_isStarted) {
        CubismLogWarning("CubismFramework is not started.");
        return;
      }
      if (!s_isInitialized) {
        CubismLogWarning("CubismFramework.dispose() skipped, not initialized.");
        return;
      }
      Value2.staticReleaseNotForClientCall();
      s_cubismIdManager.release();
      s_cubismIdManager = null;
      CubismRenderer.staticRelease();
      s_isInitialized = false;
      CubismLogInfo("CubismFramework.dispose() is complete.");
    }
    /**
     * Cubism FrameworkのAPIを使用する準備が完了したかどうか
     * @return APIを使用する準備が完了していればtrueが返ります。
     */
    static isStarted() {
      return s_isStarted;
    }
    /**
     * Cubism Frameworkのリソース初期化がすでに行われているかどうか
     * @return リソース確保が完了していればtrueが返ります
     */
    static isInitialized() {
      return s_isInitialized;
    }
    /**
     * Core APIにバインドしたログ関数を実行する
     *
     * @praram message ログメッセージ
     */
    static coreLogFunction(message) {
      if (!Live2DCubismCore.Logging.csmGetLogFunction()) {
        return;
      }
      Live2DCubismCore.Logging.csmGetLogFunction()(message);
    }
    /**
     * 現在のログ出力レベル設定の値を返す。
     *
     * @return  現在のログ出力レベル設定の値
     */
    static getLoggingLevel() {
      if (s_option != null) {
        return s_option.loggingLevel;
      }
      return 5 /* LogLevel_Off */;
    }
    /**
     * IDマネージャのインスタンスを取得する
     * @return CubismManagerクラスのインスタンス
     */
    static getIdManager() {
      return s_cubismIdManager;
    }
    /**
     * 静的クラスとして使用する
     * インスタンス化させない
     */
    constructor() {
    }
  };
  var Option = class {
    // ログ出力レベルの設定
  };
  var LogLevel = /* @__PURE__ */ ((LogLevel3) => {
    LogLevel3[LogLevel3["LogLevel_Verbose"] = 0] = "LogLevel_Verbose";
    LogLevel3[LogLevel3["LogLevel_Debug"] = 1] = "LogLevel_Debug";
    LogLevel3[LogLevel3["LogLevel_Info"] = 2] = "LogLevel_Info";
    LogLevel3[LogLevel3["LogLevel_Warning"] = 3] = "LogLevel_Warning";
    LogLevel3[LogLevel3["LogLevel_Error"] = 4] = "LogLevel_Error";
    LogLevel3[LogLevel3["LogLevel_Off"] = 5] = "LogLevel_Off";
    return LogLevel3;
  })(LogLevel || {});
  var Live2DCubismFramework11;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.Constant = Constant;
    Live2DCubismFramework40.csmDelete = csmDelete;
    Live2DCubismFramework40.CubismFramework = CubismFramework;
  })(Live2DCubismFramework11 || (Live2DCubismFramework11 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/effect/cubismbreath.ts
  var CubismBreath = class _CubismBreath {
    /**
     * インスタンスの作成
     */
    static create() {
      return new _CubismBreath();
    }
    /**
     * インスタンスの破棄
     * @param instance 対象のCubismBreath
     */
    static delete(instance) {
      if (instance != null) {
        instance = null;
      }
    }
    /**
     * 呼吸のパラメータの紐づけ
     * @param breathParameters 呼吸を紐づけたいパラメータのリスト
     */
    setParameters(breathParameters) {
      this._breathParameters = breathParameters;
    }
    /**
     * 呼吸に紐づいているパラメータの取得
     * @return 呼吸に紐づいているパラメータのリスト
     */
    getParameters() {
      return this._breathParameters;
    }
    /**
     * モデルのパラメータの更新
     * @param model 対象のモデル
     * @param deltaTimeSeconds デルタ時間[秒]
     */
    updateParameters(model, deltaTimeSeconds) {
      this._currentTime += deltaTimeSeconds;
      const t = this._currentTime * 2 * 3.14159;
      for (let i = 0; i < this._breathParameters.getSize(); ++i) {
        const data = this._breathParameters.at(i);
        model.addParameterValueById(
          data.parameterId,
          data.offset + data.peak * Math.sin(t / data.cycle),
          data.weight
        );
      }
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._currentTime = 0;
    }
    // 積算時間[秒]
  };
  var BreathParameterData = class {
    /**
     * コンストラクタ
     * @param parameterId   呼吸をひもづけるパラメータID
     * @param offset        呼吸を正弦波としたときの、波のオフセット
     * @param peak          呼吸を正弦波としたときの、波の高さ
     * @param cycle         呼吸を正弦波としたときの、波の周期
     * @param weight        パラメータへの重み
     */
    constructor(parameterId, offset, peak, cycle, weight) {
      this.parameterId = parameterId == void 0 ? null : parameterId;
      this.offset = offset == void 0 ? 0 : offset;
      this.peak = peak == void 0 ? 0 : peak;
      this.cycle = cycle == void 0 ? 0 : cycle;
      this.weight = weight == void 0 ? 0 : weight;
    }
    // パラメータへの重み
  };
  var Live2DCubismFramework12;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.BreathParameterData = BreathParameterData;
    Live2DCubismFramework40.CubismBreath = CubismBreath;
  })(Live2DCubismFramework12 || (Live2DCubismFramework12 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/effect/cubismeyeblink.ts
  var _CubismEyeBlink = class _CubismEyeBlink {
    /**
     * インスタンスを作成する
     * @param modelSetting モデルの設定情報
     * @return 作成されたインスタンス
     * @note 引数がNULLの場合、パラメータIDが設定されていない空のインスタンスを作成する。
     */
    static create(modelSetting = null) {
      return new _CubismEyeBlink(modelSetting);
    }
    /**
     * インスタンスの破棄
     * @param eyeBlink 対象のCubismEyeBlink
     */
    static delete(eyeBlink) {
      if (eyeBlink != null) {
        eyeBlink = null;
      }
    }
    /**
     * まばたきの間隔の設定
     * @param blinkingInterval まばたきの間隔の時間[秒]
     */
    setBlinkingInterval(blinkingInterval) {
      this._blinkingIntervalSeconds = blinkingInterval;
    }
    /**
     * まばたきのモーションの詳細設定
     * @param closing   まぶたを閉じる動作の所要時間[秒]
     * @param closed    まぶたを閉じている動作の所要時間[秒]
     * @param opening   まぶたを開く動作の所要時間[秒]
     */
    setBlinkingSetting(closing, closed, opening) {
      this._closingSeconds = closing;
      this._closedSeconds = closed;
      this._openingSeconds = opening;
    }
    /**
     * まばたきさせるパラメータIDのリストの設定
     * @param parameterIds パラメータのIDのリスト
     */
    setParameterIds(parameterIds) {
      this._parameterIds = parameterIds;
    }
    /**
     * まばたきさせるパラメータIDのリストの取得
     * @return パラメータIDのリスト
     */
    getParameterIds() {
      return this._parameterIds;
    }
    /**
     * モデルのパラメータの更新
     * @param model 対象のモデル
     * @param deltaTimeSeconds デルタ時間[秒]
     */
    updateParameters(model, deltaTimeSeconds) {
      this._userTimeSeconds += deltaTimeSeconds;
      let parameterValue;
      let t = 0;
      const blinkingState = this._blinkingState;
      switch (blinkingState) {
        case 2 /* EyeState_Closing */:
          t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closingSeconds;
          if (t >= 1) {
            t = 1;
            this._blinkingState = 3 /* EyeState_Closed */;
            this._stateStartTimeSeconds = this._userTimeSeconds;
          }
          parameterValue = 1 - t;
          break;
        case 3 /* EyeState_Closed */:
          t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._closedSeconds;
          if (t >= 1) {
            this._blinkingState = 4 /* EyeState_Opening */;
            this._stateStartTimeSeconds = this._userTimeSeconds;
          }
          parameterValue = 0;
          break;
        case 4 /* EyeState_Opening */:
          t = (this._userTimeSeconds - this._stateStartTimeSeconds) / this._openingSeconds;
          if (t >= 1) {
            t = 1;
            this._blinkingState = 1 /* EyeState_Interval */;
            this._nextBlinkingTime = this.determinNextBlinkingTiming();
          }
          parameterValue = t;
          break;
        case 1 /* EyeState_Interval */:
          if (this._nextBlinkingTime < this._userTimeSeconds) {
            this._blinkingState = 2 /* EyeState_Closing */;
            this._stateStartTimeSeconds = this._userTimeSeconds;
          }
          parameterValue = 1;
          break;
        case 0 /* EyeState_First */:
        default:
          this._blinkingState = 1 /* EyeState_Interval */;
          this._nextBlinkingTime = this.determinNextBlinkingTiming();
          parameterValue = 1;
          break;
      }
      if (!_CubismEyeBlink.CloseIfZero) {
        parameterValue = -parameterValue;
      }
      for (let i = 0; i < this._parameterIds.getSize(); ++i) {
        model.setParameterValueById(this._parameterIds.at(i), parameterValue);
      }
    }
    /**
     * コンストラクタ
     * @param modelSetting モデルの設定情報
     */
    constructor(modelSetting) {
      this._blinkingState = 0 /* EyeState_First */;
      this._nextBlinkingTime = 0;
      this._stateStartTimeSeconds = 0;
      this._blinkingIntervalSeconds = 4;
      this._closingSeconds = 0.1;
      this._closedSeconds = 0.05;
      this._openingSeconds = 0.15;
      this._userTimeSeconds = 0;
      this._parameterIds = new csmVector();
      if (modelSetting == null) {
        return;
      }
      for (let i = 0; i < modelSetting.getEyeBlinkParameterCount(); ++i) {
        this._parameterIds.pushBack(modelSetting.getEyeBlinkParameterId(i));
      }
    }
    /**
     * 次の瞬きのタイミングの決定
     *
     * @return 次のまばたきを行う時刻[秒]
     */
    determinNextBlinkingTiming() {
      const r = Math.random();
      return this._userTimeSeconds + r * (2 * this._blinkingIntervalSeconds - 1);
    }
  };
  // デルタ時間の積算値[秒]
  /**
   * IDで指定された目のパラメータが、0のときに閉じるなら true 、1の時に閉じるなら false 。
   */
  _CubismEyeBlink.CloseIfZero = true;
  var CubismEyeBlink = _CubismEyeBlink;
  var EyeState = /* @__PURE__ */ ((EyeState2) => {
    EyeState2[EyeState2["EyeState_First"] = 0] = "EyeState_First";
    EyeState2[EyeState2["EyeState_Interval"] = 1] = "EyeState_Interval";
    EyeState2[EyeState2["EyeState_Closing"] = 2] = "EyeState_Closing";
    EyeState2[EyeState2["EyeState_Closed"] = 3] = "EyeState_Closed";
    EyeState2[EyeState2["EyeState_Opening"] = 4] = "EyeState_Opening";
    return EyeState2;
  })(EyeState || {});
  var Live2DCubismFramework13;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismEyeBlink = CubismEyeBlink;
    Live2DCubismFramework40.EyeState = EyeState;
  })(Live2DCubismFramework13 || (Live2DCubismFramework13 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/effect/cubismpose.ts
  var Epsilon = 1e-3;
  var DefaultFadeInSeconds = 0.5;
  var FadeIn = "FadeInTime";
  var Link = "Link";
  var Groups = "Groups";
  var Id = "Id";
  var CubismPose = class _CubismPose {
    /**
     * インスタンスの作成
     * @param pose3json pose3.jsonのデータ
     * @param size pose3.jsonのデータのサイズ[byte]
     * @return 作成されたインスタンス
     */
    static create(pose3json, size) {
      const json = CubismJson.create(pose3json, size);
      if (!json) {
        return null;
      }
      const ret = new _CubismPose();
      const root = json.getRoot();
      if (!root.getValueByString(FadeIn).isNull()) {
        ret._fadeTimeSeconds = root.getValueByString(FadeIn).toFloat(DefaultFadeInSeconds);
        if (ret._fadeTimeSeconds <= 0) {
          ret._fadeTimeSeconds = DefaultFadeInSeconds;
        }
      }
      const poseListInfo = root.getValueByString(Groups);
      const poseCount = poseListInfo.getSize();
      for (let poseIndex = 0; poseIndex < poseCount; ++poseIndex) {
        const idListInfo = poseListInfo.getValueByIndex(poseIndex);
        const idCount = idListInfo.getSize();
        let groupCount = 0;
        for (let groupIndex = 0; groupIndex < idCount; ++groupIndex) {
          const partInfo = idListInfo.getValueByIndex(groupIndex);
          const partData = new PartData();
          const parameterId = CubismFramework.getIdManager().getId(
            partInfo.getValueByString(Id).getRawString()
          );
          partData.partId = parameterId;
          if (!partInfo.getValueByString(Link).isNull()) {
            const linkListInfo = partInfo.getValueByString(Link);
            const linkCount = linkListInfo.getSize();
            for (let linkIndex = 0; linkIndex < linkCount; ++linkIndex) {
              const linkPart = new PartData();
              const linkId = CubismFramework.getIdManager().getId(
                linkListInfo.getValueByIndex(linkIndex).getString()
              );
              linkPart.partId = linkId;
              partData.link.pushBack(linkPart);
            }
          }
          ret._partGroups.pushBack(partData.clone());
          ++groupCount;
        }
        ret._partGroupCounts.pushBack(groupCount);
      }
      CubismJson.delete(json);
      return ret;
    }
    /**
     * インスタンスを破棄する
     * @param pose 対象のCubismPose
     */
    static delete(pose) {
      if (pose != null) {
        pose = null;
      }
    }
    /**
     * モデルのパラメータの更新
     * @param model 対象のモデル
     * @param deltaTimeSeconds デルタ時間[秒]
     */
    updateParameters(model, deltaTimeSeconds) {
      if (model != this._lastModel) {
        this.reset(model);
      }
      this._lastModel = model;
      if (deltaTimeSeconds < 0) {
        deltaTimeSeconds = 0;
      }
      let beginIndex = 0;
      for (let i = 0; i < this._partGroupCounts.getSize(); i++) {
        const partGroupCount = this._partGroupCounts.at(i);
        this.doFade(model, deltaTimeSeconds, beginIndex, partGroupCount);
        beginIndex += partGroupCount;
      }
      this.copyPartOpacities(model);
    }
    /**
     * 表示を初期化
     * @param model 対象のモデル
     * @note 不透明度の初期値が0でないパラメータは、不透明度を１に設定する
     */
    reset(model) {
      let beginIndex = 0;
      for (let i = 0; i < this._partGroupCounts.getSize(); ++i) {
        const groupCount = this._partGroupCounts.at(i);
        for (let j = beginIndex; j < beginIndex + groupCount; ++j) {
          this._partGroups.at(j).initialize(model);
          const partsIndex = this._partGroups.at(j).partIndex;
          const paramIndex = this._partGroups.at(j).parameterIndex;
          if (partsIndex < 0) {
            continue;
          }
          model.setPartOpacityByIndex(partsIndex, j == beginIndex ? 1 : 0);
          model.setParameterValueByIndex(paramIndex, j == beginIndex ? 1 : 0);
          for (let k = 0; k < this._partGroups.at(j).link.getSize(); ++k) {
            this._partGroups.at(j).link.at(k).initialize(model);
          }
        }
        beginIndex += groupCount;
      }
    }
    /**
     * パーツの不透明度をコピー
     *
     * @param model 対象のモデル
     */
    copyPartOpacities(model) {
      for (let groupIndex = 0; groupIndex < this._partGroups.getSize(); ++groupIndex) {
        const partData = this._partGroups.at(groupIndex);
        if (partData.link.getSize() == 0) {
          continue;
        }
        const partIndex = this._partGroups.at(groupIndex).partIndex;
        const opacity = model.getPartOpacityByIndex(partIndex);
        for (let linkIndex = 0; linkIndex < partData.link.getSize(); ++linkIndex) {
          const linkPart = partData.link.at(linkIndex);
          const linkPartIndex = linkPart.partIndex;
          if (linkPartIndex < 0) {
            continue;
          }
          model.setPartOpacityByIndex(linkPartIndex, opacity);
        }
      }
    }
    /**
     * パーツのフェード操作を行う。
     * @param model 対象のモデル
     * @param deltaTimeSeconds デルタ時間[秒]
     * @param beginIndex フェード操作を行うパーツグループの先頭インデックス
     * @param partGroupCount フェード操作を行うパーツグループの個数
     */
    doFade(model, deltaTimeSeconds, beginIndex, partGroupCount) {
      let visiblePartIndex = -1;
      let newOpacity = 1;
      const phi = 0.5;
      const backOpacityThreshold = 0.15;
      for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
        const partIndex = this._partGroups.at(i).partIndex;
        const paramIndex = this._partGroups.at(i).parameterIndex;
        if (model.getParameterValueByIndex(paramIndex) > Epsilon) {
          if (visiblePartIndex >= 0) {
            break;
          }
          visiblePartIndex = i;
          newOpacity = model.getPartOpacityByIndex(partIndex);
          newOpacity += deltaTimeSeconds / this._fadeTimeSeconds;
          if (newOpacity > 1) {
            newOpacity = 1;
          }
        }
      }
      if (visiblePartIndex < 0) {
        visiblePartIndex = 0;
        newOpacity = 1;
      }
      for (let i = beginIndex; i < beginIndex + partGroupCount; ++i) {
        const partsIndex = this._partGroups.at(i).partIndex;
        if (visiblePartIndex == i) {
          model.setPartOpacityByIndex(partsIndex, newOpacity);
        } else {
          let opacity = model.getPartOpacityByIndex(partsIndex);
          let a1;
          if (newOpacity < phi) {
            a1 = newOpacity * (phi - 1) / phi + 1;
          } else {
            a1 = (1 - newOpacity) * phi / (1 - phi);
          }
          const backOpacity = (1 - a1) * (1 - newOpacity);
          if (backOpacity > backOpacityThreshold) {
            a1 = 1 - backOpacityThreshold / (1 - newOpacity);
          }
          if (opacity > a1) {
            opacity = a1;
          }
          model.setPartOpacityByIndex(partsIndex, opacity);
        }
      }
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._fadeTimeSeconds = DefaultFadeInSeconds;
      this._lastModel = null;
      this._partGroups = new csmVector();
      this._partGroupCounts = new csmVector();
    }
    // 前回操作したモデル
  };
  var PartData = class _PartData {
    /**
     * コンストラクタ
     */
    constructor(v) {
      this.parameterIndex = 0;
      this.partIndex = 0;
      this.link = new csmVector();
      if (v != void 0) {
        this.partId = v.partId;
        for (const ite = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement()) {
          this.link.pushBack(ite.ptr().clone());
        }
      }
    }
    /**
     * =演算子のオーバーロード
     */
    assignment(v) {
      this.partId = v.partId;
      for (const ite = v.link.begin(); ite.notEqual(v.link.end()); ite.preIncrement()) {
        this.link.pushBack(ite.ptr().clone());
      }
      return this;
    }
    /**
     * 初期化
     * @param model 初期化に使用するモデル
     */
    initialize(model) {
      this.parameterIndex = model.getParameterIndex(this.partId);
      this.partIndex = model.getPartIndex(this.partId);
      model.setParameterValueByIndex(this.parameterIndex, 1);
    }
    /**
     * オブジェクトのコピーを生成する
     */
    clone() {
      const clonePartData = new _PartData();
      clonePartData.partId = this.partId;
      clonePartData.parameterIndex = this.parameterIndex;
      clonePartData.partIndex = this.partIndex;
      clonePartData.link = new csmVector();
      for (let ite = this.link.begin(); ite.notEqual(this.link.end()); ite.increment()) {
        clonePartData.link.pushBack(ite.ptr().clone());
      }
      return clonePartData;
    }
    // 連動するパラメータ
  };
  var Live2DCubismFramework14;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismPose = CubismPose;
    Live2DCubismFramework40.PartData = PartData;
  })(Live2DCubismFramework14 || (Live2DCubismFramework14 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/math/cubismmodelmatrix.ts
  var CubismModelMatrix = class extends CubismMatrix44 {
    /**
     * コンストラクタ
     *
     * @param w 横幅
     * @param h 縦幅
     */
    constructor(w, h) {
      super();
      this._width = w !== void 0 ? w : 0;
      this._height = h !== void 0 ? h : 0;
      this.setHeight(2);
    }
    /**
     * 横幅を設定
     *
     * @param w 横幅
     */
    setWidth(w) {
      const scaleX = w / this._width;
      const scaleY = scaleX;
      this.scale(scaleX, scaleY);
    }
    /**
     * 縦幅を設定
     * @param h 縦幅
     */
    setHeight(h) {
      const scaleX = h / this._height;
      const scaleY = scaleX;
      this.scale(scaleX, scaleY);
    }
    /**
     * 位置を設定
     *
     * @param x X軸の位置
     * @param y Y軸の位置
     */
    setPosition(x, y) {
      this.translate(x, y);
    }
    /**
     * 中心位置を設定
     *
     * @param x X軸の中心位置
     * @param y Y軸の中心位置
     *
     * @note widthかheightを設定したあとでないと、拡大率が正しく取得できないためずれる。
     */
    setCenterPosition(x, y) {
      this.centerX(x);
      this.centerY(y);
    }
    /**
     * 上辺の位置を設定する
     *
     * @param y 上辺のY軸位置
     */
    top(y) {
      this.setY(y);
    }
    /**
     * 下辺の位置を設定する
     *
     * @param y 下辺のY軸位置
     */
    bottom(y) {
      const h = this._height * this.getScaleY();
      this.translateY(y - h);
    }
    /**
     * 左辺の位置を設定
     *
     * @param x 左辺のX軸位置
     */
    left(x) {
      this.setX(x);
    }
    /**
     * 右辺の位置を設定
     *
     * @param x 右辺のX軸位置
     */
    right(x) {
      const w = this._width * this.getScaleX();
      this.translateX(x - w);
    }
    /**
     * X軸の中心位置を設定
     *
     * @param x X軸の中心位置
     */
    centerX(x) {
      const w = this._width * this.getScaleX();
      this.translateX(x - w / 2);
    }
    /**
     * X軸の位置を設定
     *
     * @param x X軸の位置
     */
    setX(x) {
      this.translateX(x);
    }
    /**
     * Y軸の中心位置を設定
     *
     * @param y Y軸の中心位置
     */
    centerY(y) {
      const h = this._height * this.getScaleY();
      this.translateY(y - h / 2);
    }
    /**
     * Y軸の位置を設定する
     *
     * @param y Y軸の位置
     */
    setY(y) {
      this.translateY(y);
    }
    /**
     * レイアウト情報から位置を設定
     *
     * @param layout レイアウト情報
     */
    setupFromLayout(layout) {
      const keyWidth = "width";
      const keyHeight = "height";
      const keyX = "x";
      const keyY = "y";
      const keyCenterX = "center_x";
      const keyCenterY = "center_y";
      const keyTop = "top";
      const keyBottom = "bottom";
      const keyLeft = "left";
      const keyRight = "right";
      for (const ite = layout.begin(); ite.notEqual(layout.end()); ite.preIncrement()) {
        const key = ite.ptr().first;
        const value = ite.ptr().second;
        if (key == keyWidth) {
          this.setWidth(value);
        } else if (key == keyHeight) {
          this.setHeight(value);
        }
      }
      for (const ite = layout.begin(); ite.notEqual(layout.end()); ite.preIncrement()) {
        const key = ite.ptr().first;
        const value = ite.ptr().second;
        if (key == keyX) {
          this.setX(value);
        } else if (key == keyY) {
          this.setY(value);
        } else if (key == keyCenterX) {
          this.centerX(value);
        } else if (key == keyCenterY) {
          this.centerY(value);
        } else if (key == keyTop) {
          this.top(value);
        } else if (key == keyBottom) {
          this.bottom(value);
        } else if (key == keyLeft) {
          this.left(value);
        } else if (key == keyRight) {
          this.right(value);
        }
      }
    }
    // 縦幅
  };
  var Live2DCubismFramework15;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismModelMatrix = CubismModelMatrix;
  })(Live2DCubismFramework15 || (Live2DCubismFramework15 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/math/cubismvector2.ts
  var CubismVector2 = class _CubismVector2 {
    /**
     * コンストラクタ
     */
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.x = x == void 0 ? 0 : x;
      this.y = y == void 0 ? 0 : y;
    }
    /**
     * ベクトルの加算
     *
     * @param vector2 加算するベクトル値
     * @return 加算結果 ベクトル値
     */
    add(vector2) {
      const ret = new _CubismVector2(0, 0);
      ret.x = this.x + vector2.x;
      ret.y = this.y + vector2.y;
      return ret;
    }
    /**
     * ベクトルの減算
     *
     * @param vector2 減算するベクトル値
     * @return 減算結果 ベクトル値
     */
    substract(vector2) {
      const ret = new _CubismVector2(0, 0);
      ret.x = this.x - vector2.x;
      ret.y = this.y - vector2.y;
      return ret;
    }
    /**
     * ベクトルの乗算
     *
     * @param vector2 乗算するベクトル値
     * @return 乗算結果 ベクトル値
     */
    multiply(vector2) {
      const ret = new _CubismVector2(0, 0);
      ret.x = this.x * vector2.x;
      ret.y = this.y * vector2.y;
      return ret;
    }
    /**
     * ベクトルの乗算(スカラー)
     *
     * @param scalar 乗算するスカラー値
     * @return 乗算結果 ベクトル値
     */
    multiplyByScaler(scalar) {
      return this.multiply(new _CubismVector2(scalar, scalar));
    }
    /**
     * ベクトルの除算
     *
     * @param vector2 除算するベクトル値
     * @return 除算結果 ベクトル値
     */
    division(vector2) {
      const ret = new _CubismVector2(0, 0);
      ret.x = this.x / vector2.x;
      ret.y = this.y / vector2.y;
      return ret;
    }
    /**
     * ベクトルの除算(スカラー)
     *
     * @param scalar 除算するスカラー値
     * @return 除算結果 ベクトル値
     */
    divisionByScalar(scalar) {
      return this.division(new _CubismVector2(scalar, scalar));
    }
    /**
     * ベクトルの長さを取得する
     *
     * @return ベクトルの長さ
     */
    getLength() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    /**
     * ベクトルの距離の取得
     *
     * @param a 点
     * @return ベクトルの距離
     */
    getDistanceWith(a) {
      return Math.sqrt(
        (this.x - a.x) * (this.x - a.x) + (this.y - a.y) * (this.y - a.y)
      );
    }
    /**
     * ドット積の計算
     *
     * @param a 値
     * @return 結果
     */
    dot(a) {
      return this.x * a.x + this.y * a.y;
    }
    /**
     * 正規化の適用
     */
    normalize() {
      const length = Math.pow(this.x * this.x + this.y * this.y, 0.5);
      this.x = this.x / length;
      this.y = this.y / length;
    }
    /**
     * 等しさの確認（等しいか？）
     *
     * 値が等しいか？
     *
     * @param rhs 確認する値
     * @return true 値は等しい
     * @return false 値は等しくない
     */
    isEqual(rhs) {
      return this.x == rhs.x && this.y == rhs.y;
    }
    /**
     * 等しさの確認（等しくないか？）
     *
     * 値が等しくないか？
     *
     * @param rhs 確認する値
     * @return true 値は等しくない
     * @return false 値は等しい
     */
    isNotEqual(rhs) {
      return !this.isEqual(rhs);
    }
  };
  var Live2DCubismFramework16;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismVector2 = CubismVector2;
  })(Live2DCubismFramework16 || (Live2DCubismFramework16 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/math/cubismmath.ts
  var _CubismMath = class _CubismMath {
    /**
     * 第一引数の値を最小値と最大値の範囲に収めた値を返す
     *
     * @param value 収められる値
     * @param min   範囲の最小値
     * @param max   範囲の最大値
     * @return 最小値と最大値の範囲に収めた値
     */
    static range(value, min, max) {
      if (value < min) {
        value = min;
      } else if (value > max) {
        value = max;
      }
      return value;
    }
    /**
     * サイン関数の値を求める
     *
     * @param x 角度値（ラジアン）
     * @return サイン関数sin(x)の値
     */
    static sin(x) {
      return Math.sin(x);
    }
    /**
     * コサイン関数の値を求める
     *
     * @param x 角度値(ラジアン)
     * @return コサイン関数cos(x)の値
     */
    static cos(x) {
      return Math.cos(x);
    }
    /**
     * 値の絶対値を求める
     *
     * @param x 絶対値を求める値
     * @return 値の絶対値
     */
    static abs(x) {
      return Math.abs(x);
    }
    /**
     * 平方根(ルート)を求める
     * @param x -> 平方根を求める値
     * @return 値の平方根
     */
    static sqrt(x) {
      return Math.sqrt(x);
    }
    /**
     * 立方根を求める
     * @param x -> 立方根を求める値
     * @return 値の立方根
     */
    static cbrt(x) {
      if (x === 0) {
        return x;
      }
      let cx = x;
      const isNegativeNumber = cx < 0;
      if (isNegativeNumber) {
        cx = -cx;
      }
      let ret;
      if (cx === Infinity) {
        ret = Infinity;
      } else {
        ret = Math.exp(Math.log(cx) / 3);
        ret = (cx / (ret * ret) + 2 * ret) / 3;
      }
      return isNegativeNumber ? -ret : ret;
    }
    /**
     * イージング処理されたサインを求める
     * フェードイン・アウト時のイージングに利用できる
     *
     * @param value イージングを行う値
     * @return イージング処理されたサイン値
     */
    static getEasingSine(value) {
      if (value < 0) {
        return 0;
      } else if (value > 1) {
        return 1;
      }
      return 0.5 - 0.5 * this.cos(value * Math.PI);
    }
    /**
     * 大きい方の値を返す
     *
     * @param left 左辺の値
     * @param right 右辺の値
     * @return 大きい方の値
     */
    static max(left, right) {
      return left > right ? left : right;
    }
    /**
     * 小さい方の値を返す
     *
     * @param left  左辺の値
     * @param right 右辺の値
     * @return 小さい方の値
     */
    static min(left, right) {
      return left > right ? right : left;
    }
    /**
     * 角度値をラジアン値に変換する
     *
     * @param degrees   角度値
     * @return 角度値から変換したラジアン値
     */
    static degreesToRadian(degrees) {
      return degrees / 180 * Math.PI;
    }
    /**
     * ラジアン値を角度値に変換する
     *
     * @param radian    ラジアン値
     * @return ラジアン値から変換した角度値
     */
    static radianToDegrees(radian) {
      return radian * 180 / Math.PI;
    }
    /**
     * ２つのベクトルからラジアン値を求める
     *
     * @param from  始点ベクトル
     * @param to    終点ベクトル
     * @return ラジアン値から求めた方向ベクトル
     */
    static directionToRadian(from, to) {
      const q1 = Math.atan2(to.y, to.x);
      const q2 = Math.atan2(from.y, from.x);
      let ret = q1 - q2;
      while (ret < -Math.PI) {
        ret += Math.PI * 2;
      }
      while (ret > Math.PI) {
        ret -= Math.PI * 2;
      }
      return ret;
    }
    /**
     * ２つのベクトルから角度値を求める
     *
     * @param from  始点ベクトル
     * @param to    終点ベクトル
     * @return 角度値から求めた方向ベクトル
     */
    static directionToDegrees(from, to) {
      const radian = this.directionToRadian(from, to);
      let degree = this.radianToDegrees(radian);
      if (to.x - from.x > 0) {
        degree = -degree;
      }
      return degree;
    }
    /**
     * ラジアン値を方向ベクトルに変換する。
     *
     * @param totalAngle    ラジアン値
     * @return ラジアン値から変換した方向ベクトル
     */
    static radianToDirection(totalAngle) {
      const ret = new CubismVector2();
      ret.x = this.sin(totalAngle);
      ret.y = this.cos(totalAngle);
      return ret;
    }
    /**
     * 三次方程式の三次項の係数が0になったときに補欠的に二次方程式の解をもとめる。
     * a * x^2 + b * x + c = 0
     *
     * @param   a -> 二次項の係数値
     * @param   b -> 一次項の係数値
     * @param   c -> 定数項の値
     * @return  二次方程式の解
     */
    static quadraticEquation(a, b, c) {
      if (this.abs(a) < _CubismMath.Epsilon) {
        if (this.abs(b) < _CubismMath.Epsilon) {
          return -c;
        }
        return -c / b;
      }
      return -(b + this.sqrt(b * b - 4 * a * c)) / (2 * a);
    }
    /**
     * カルダノの公式によってベジェのt値に該当する３次方程式の解を求める。
     * 重解になったときには0.0～1.0の値になる解を返す。
     *
     * a * x^3 + b * x^2 + c * x + d = 0
     *
     * @param   a -> 三次項の係数値
     * @param   b -> 二次項の係数値
     * @param   c -> 一次項の係数値
     * @param   d -> 定数項の値
     * @return  0.0～1.0の間にある解
     */
    static cardanoAlgorithmForBezier(a, b, c, d) {
      if (this.sqrt(a) < _CubismMath.Epsilon) {
        return this.range(this.quadraticEquation(b, c, d), 0, 1);
      }
      const ba = b / a;
      const ca = c / a;
      const da = d / a;
      const p = (3 * ca - ba * ba) / 3;
      const p3 = p / 3;
      const q = (2 * ba * ba * ba - 9 * ba * ca + 27 * da) / 27;
      const q2 = q / 2;
      const discriminant = q2 * q2 + p3 * p3 * p3;
      const center = 0.5;
      const threshold = center + 0.01;
      if (discriminant < 0) {
        const mp3 = -p / 3;
        const mp33 = mp3 * mp3 * mp3;
        const r = this.sqrt(mp33);
        const t = -q / (2 * r);
        const cosphi = this.range(t, -1, 1);
        const phi = Math.acos(cosphi);
        const crtr = this.cbrt(r);
        const t1 = 2 * crtr;
        const root12 = t1 * this.cos(phi / 3) - ba / 3;
        if (this.abs(root12 - center) < threshold) {
          return this.range(root12, 0, 1);
        }
        const root2 = t1 * this.cos((phi + 2 * Math.PI) / 3) - ba / 3;
        if (this.abs(root2 - center) < threshold) {
          return this.range(root2, 0, 1);
        }
        const root3 = t1 * this.cos((phi + 4 * Math.PI) / 3) - ba / 3;
        return this.range(root3, 0, 1);
      }
      if (discriminant == 0) {
        let u12;
        if (q2 < 0) {
          u12 = this.cbrt(-q2);
        } else {
          u12 = -this.cbrt(q2);
        }
        const root12 = 2 * u12 - ba / 3;
        if (this.abs(root12 - center) < threshold) {
          return this.range(root12, 0, 1);
        }
        const root2 = -u12 - ba / 3;
        return this.range(root2, 0, 1);
      }
      const sd = this.sqrt(discriminant);
      const u1 = this.cbrt(sd - q2);
      const v1 = this.cbrt(sd + q2);
      const root1 = u1 - v1 - ba / 3;
      return this.range(root1, 0, 1);
    }
    /**
     * 浮動小数点の余りを求める。
     *
     * @param dividend 被除数（割られる値）
     * @param divisor 除数（割る値）
     * @returns 余り
     */
    static mod(dividend, divisor) {
      if (!isFinite(dividend) || divisor === 0 || isNaN(dividend) || isNaN(divisor)) {
        console.warn(
          `divided: ${dividend}, divisor: ${divisor} mod() returns 'NaN'.`
        );
        return NaN;
      }
      const absDividend = Math.abs(dividend);
      const absDivisor = Math.abs(divisor);
      let result = absDividend - Math.floor(absDividend / absDivisor) * absDivisor;
      result *= Math.sign(dividend);
      return result;
    }
    /**
     * コンストラクタ
     */
    constructor() {
    }
  };
  _CubismMath.Epsilon = 1e-5;
  var CubismMath = _CubismMath;
  var Live2DCubismFramework17;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMath = CubismMath;
  })(Live2DCubismFramework17 || (Live2DCubismFramework17 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/math/cubismtargetpoint.ts
  var FrameRate = 30;
  var Epsilon2 = 0.01;
  var CubismTargetPoint = class {
    /**
     * コンストラクタ
     */
    constructor() {
      this._faceTargetX = 0;
      this._faceTargetY = 0;
      this._faceX = 0;
      this._faceY = 0;
      this._faceVX = 0;
      this._faceVY = 0;
      this._lastTimeSeconds = 0;
      this._userTimeSeconds = 0;
    }
    /**
     * 更新処理
     */
    update(deltaTimeSeconds) {
      this._userTimeSeconds += deltaTimeSeconds;
      const faceParamMaxV = 40 / 10;
      const maxV = faceParamMaxV * 1 / FrameRate;
      if (this._lastTimeSeconds == 0) {
        this._lastTimeSeconds = this._userTimeSeconds;
        return;
      }
      const deltaTimeWeight = (this._userTimeSeconds - this._lastTimeSeconds) * FrameRate;
      this._lastTimeSeconds = this._userTimeSeconds;
      const timeToMaxSpeed = 0.15;
      const frameToMaxSpeed = timeToMaxSpeed * FrameRate;
      const maxA = deltaTimeWeight * maxV / frameToMaxSpeed;
      const dx = this._faceTargetX - this._faceX;
      const dy = this._faceTargetY - this._faceY;
      if (CubismMath.abs(dx) <= Epsilon2 && CubismMath.abs(dy) <= Epsilon2) {
        return;
      }
      const d = CubismMath.sqrt(dx * dx + dy * dy);
      const vx = maxV * dx / d;
      const vy = maxV * dy / d;
      let ax = vx - this._faceVX;
      let ay = vy - this._faceVY;
      const a = CubismMath.sqrt(ax * ax + ay * ay);
      if (a < -maxA || a > maxA) {
        ax *= maxA / a;
        ay *= maxA / a;
      }
      this._faceVX += ax;
      this._faceVY += ay;
      {
        const maxV2 = 0.5 * (CubismMath.sqrt(maxA * maxA + 16 * maxA * d - 8 * maxA * d) - maxA);
        const curV = CubismMath.sqrt(
          this._faceVX * this._faceVX + this._faceVY * this._faceVY
        );
        if (curV > maxV2) {
          this._faceVX *= maxV2 / curV;
          this._faceVY *= maxV2 / curV;
        }
      }
      this._faceX += this._faceVX;
      this._faceY += this._faceVY;
    }
    /**
     * X軸の顔の向きの値を取得
     *
     * @return X軸の顔の向きの値（-1.0 ~ 1.0）
     */
    getX() {
      return this._faceX;
    }
    /**
     * Y軸の顔の向きの値を取得
     *
     * @return Y軸の顔の向きの値（-1.0 ~ 1.0）
     */
    getY() {
      return this._faceY;
    }
    /**
     * 顔の向きの目標値を設定
     *
     * @param x X軸の顔の向きの値（-1.0 ~ 1.0）
     * @param y Y軸の顔の向きの値（-1.0 ~ 1.0）
     */
    set(x, y) {
      this._faceTargetX = x;
      this._faceTargetY = y;
    }
    // デルタ時間の積算値[秒]
  };
  var Live2DCubismFramework18;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismTargetPoint = CubismTargetPoint;
  })(Live2DCubismFramework18 || (Live2DCubismFramework18 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/acubismmotion.ts
  var ACubismMotion = class {
    /**
     * コンストラクタ
     */
    constructor() {
      /**
       * モーション再生終了コールバックの登録
       *
       * モーション再生終了コールバックを登録する。
       * isFinishedフラグを設定するタイミングで呼び出される。
       * 以下の状態の際には呼び出されない:
       *   1. 再生中のモーションが「ループ」として設定されているとき
       *   2. コールバックが登録されていない時
       *
       * @param onFinishedMotionHandler モーション再生終了コールバック関数
       */
      this.setFinishedMotionHandler = (onFinishedMotionHandler) => this._onFinishedMotion = onFinishedMotionHandler;
      /**
       * モーション再生終了コールバックの取得
       *
       * モーション再生終了コールバックを取得する。
       *
       * @return 登録されているモーション再生終了コールバック関数
       */
      this.getFinishedMotionHandler = () => this._onFinishedMotion;
      this._fadeInSeconds = -1;
      this._fadeOutSeconds = -1;
      this._weight = 1;
      this._offsetSeconds = 0;
      this._firedEventValues = new csmVector();
    }
    /**
     * インスタンスの破棄
     */
    static delete(motion) {
      motion.release();
      motion = null;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      this._weight = 0;
    }
    /**
     * モデルのパラメータ
     * @param model 対象のモデル
     * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
     * @param userTimeSeconds デルタ時間の積算値[秒]
     */
    updateParameters(model, motionQueueEntry, userTimeSeconds) {
      if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
        return;
      }
      this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);
      const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
      this.doUpdateParameters(
        model,
        userTimeSeconds,
        fadeWeight,
        motionQueueEntry
      );
      if (motionQueueEntry.getEndTime() > 0 && motionQueueEntry.getEndTime() < userTimeSeconds) {
        motionQueueEntry.setIsFinished(true);
      }
    }
    /**
     * @brief モデルの再生開始処理
     *
     * モーションの再生を開始するためのセットアップを行う。
     *
     * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
     * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
     */
    setupMotionQueueEntry(motionQueueEntry, userTimeSeconds) {
      if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
        return;
      }
      if (!motionQueueEntry.isAvailable()) {
        return;
      }
      motionQueueEntry.setIsStarted(true);
      motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds);
      motionQueueEntry.setFadeInStartTime(userTimeSeconds);
      const duration = this.getDuration();
      if (motionQueueEntry.getEndTime() < 0) {
        motionQueueEntry.setEndTime(
          duration <= 0 ? -1 : motionQueueEntry.getStartTime() + duration
        );
      }
    }
    /**
     * @brief モデルのウェイト更新
     *
     * モーションのウェイトを更新する。
     *
     * @param[in]   motionQueueEntry    CubismMotionQueueManagerで管理されているモーション
     * @param[in]   userTimeSeconds     デルタ時間の積算値[秒]
     */
    updateFadeWeight(motionQueueEntry, userTimeSeconds) {
      if (motionQueueEntry == null) {
        CubismDebug.print(4 /* LogLevel_Error */, "motionQueueEntry is null.");
      }
      let fadeWeight = this._weight;
      const fadeIn = this._fadeInSeconds == 0 ? 1 : CubismMath.getEasingSine(
        (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds
      );
      const fadeOut = this._fadeOutSeconds == 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
        (motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds
      );
      fadeWeight = fadeWeight * fadeIn * fadeOut;
      motionQueueEntry.setState(userTimeSeconds, fadeWeight);
      CSM_ASSERT(0 <= fadeWeight && fadeWeight <= 1);
      return fadeWeight;
    }
    /**
     * フェードインの時間を設定する
     * @param fadeInSeconds フェードインにかかる時間[秒]
     */
    setFadeInTime(fadeInSeconds) {
      this._fadeInSeconds = fadeInSeconds;
    }
    /**
     * フェードアウトの時間を設定する
     * @param fadeOutSeconds フェードアウトにかかる時間[秒]
     */
    setFadeOutTime(fadeOutSeconds) {
      this._fadeOutSeconds = fadeOutSeconds;
    }
    /**
     * フェードアウトにかかる時間の取得
     * @return フェードアウトにかかる時間[秒]
     */
    getFadeOutTime() {
      return this._fadeOutSeconds;
    }
    /**
     * フェードインにかかる時間の取得
     * @return フェードインにかかる時間[秒]
     */
    getFadeInTime() {
      return this._fadeInSeconds;
    }
    /**
     * モーション適用の重みの設定
     * @param weight 重み（0.0 - 1.0）
     */
    setWeight(weight) {
      this._weight = weight;
    }
    /**
     * モーション適用の重みの取得
     * @return 重み（0.0 - 1.0）
     */
    getWeight() {
      return this._weight;
    }
    /**
     * モーションの長さの取得
     * @return モーションの長さ[秒]
     *
     * @note ループの時は「-1」。
     *       ループでない場合は、オーバーライドする。
     *       正の値の時は取得される時間で終了する。
     *       「-1」の時は外部から停止命令がない限り終わらない処理となる。
     */
    getDuration() {
      return -1;
    }
    /**
     * モーションのループ1回分の長さの取得
     * @return モーションのループ一回分の長さ[秒]
     *
     * @note ループしない場合は、getDuration()と同じ値を返す
     *       ループ一回分の長さが定義できない場合(プログラム的に動き続けるサブクラスなど)の場合は「-1」を返す
     */
    getLoopDuration() {
      return -1;
    }
    /**
     * モーション再生の開始時刻の設定
     * @param offsetSeconds モーション再生の開始時刻[秒]
     */
    setOffsetTime(offsetSeconds) {
      this._offsetSeconds = offsetSeconds;
    }
    /**
     * モデルのパラメータ更新
     *
     * イベント発火のチェック。
     * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
     *
     * @param beforeCheckTimeSeconds 前回のイベントチェック時間[秒]
     * @param motionTimeSeconds 今回の再生時間[秒]
     */
    getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
      return this._firedEventValues;
    }
    /**
     * 透明度のカーブが存在するかどうかを確認する
     *
     * @returns true  -> キーが存在する
     *          false -> キーが存在しない
     */
    isExistModelOpacity() {
      return false;
    }
    /**
     * 透明度のカーブのインデックスを返す
     *
     * @returns success:透明度のカーブのインデックス
     */
    getModelOpacityIndex() {
      return -1;
    }
    /**
     * 透明度のIdを返す
     *
     * @param index モーションカーブのインデックス
     * @returns success:透明度のId
     */
    getModelOpacityId(index) {
      return null;
    }
    /**
     * 指定時間の透明度の値を返す
     *
     * @returns success:モーションの現在時間におけるOpacityの値
     *
     * @note  更新後の値を取るにはUpdateParameters() の後に呼び出す。
     */
    getModelOpacityValue() {
      return 1;
    }
  };
  var Live2DCubismFramework19;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.ACubismMotion = ACubismMotion;
  })(Live2DCubismFramework19 || (Live2DCubismFramework19 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismexpressionmotion.ts
  var ExpressionKeyFadeIn = "FadeInTime";
  var ExpressionKeyFadeOut = "FadeOutTime";
  var ExpressionKeyParameters = "Parameters";
  var ExpressionKeyId = "Id";
  var ExpressionKeyValue = "Value";
  var ExpressionKeyBlend = "Blend";
  var BlendValueAdd = "Add";
  var BlendValueMultiply = "Multiply";
  var BlendValueOverwrite = "Overwrite";
  var DefaultFadeTime = 1;
  var _CubismExpressionMotion = class _CubismExpressionMotion extends ACubismMotion {
    // 乗算適用の初期値
    /**
     * インスタンスを作成する。
     * @param buffer expファイルが読み込まれているバッファ
     * @param size バッファのサイズ
     * @return 作成されたインスタンス
     */
    static create(buffer, size) {
      const expression = new _CubismExpressionMotion();
      expression.parse(buffer, size);
      return expression;
    }
    /**
     * モデルのパラメータの更新の実行
     * @param model 対象のモデル
     * @param userTimeSeconds デルタ時間の積算値[秒]
     * @param weight モーションの重み
     * @param motionQueueEntry CubismMotionQueueManagerで管理されているモーション
     */
    doUpdateParameters(model, userTimeSeconds, weight, motionQueueEntry) {
      for (let i = 0; i < this._parameters.getSize(); ++i) {
        const parameter = this._parameters.at(i);
        switch (parameter.blendType) {
          case 0 /* Additive */: {
            model.addParameterValueById(
              parameter.parameterId,
              parameter.value,
              weight
            );
            break;
          }
          case 1 /* Multiply */: {
            model.multiplyParameterValueById(
              parameter.parameterId,
              parameter.value,
              weight
            );
            break;
          }
          case 2 /* Overwrite */: {
            model.setParameterValueById(
              parameter.parameterId,
              parameter.value,
              weight
            );
            break;
          }
          default:
            break;
        }
      }
    }
    /**
     * @brief 表情によるモデルのパラメータの計算
     *
     * モデルの表情に関するパラメータを計算する。
     *
     * @param[in]   model                        対象のモデル
     * @param[in]   userTimeSeconds              デルタ時間の積算値[秒]
     * @param[in]   motionQueueEntry             CubismMotionQueueManagerで管理されているモーション
     * @param[in]   expressionParameterValues    モデルに適用する各パラメータの値
     * @param[in]   expressionIndex              表情のインデックス
     * @param[in]   fadeWeight                   表情のウェイト
     */
    calculateExpressionParameters(model, userTimeSeconds, motionQueueEntry, expressionParameterValues, expressionIndex, fadeWeight) {
      if (motionQueueEntry == null || expressionParameterValues == null) {
        return;
      }
      if (!motionQueueEntry.isAvailable()) {
        return;
      }
      this._fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);
      for (let i = 0; i < expressionParameterValues.getSize(); ++i) {
        const expressionParameterValue = expressionParameterValues.at(i);
        if (expressionParameterValue.parameterId == null) {
          continue;
        }
        const currentParameterValue = expressionParameterValue.overwriteValue = model.getParameterValueById(expressionParameterValue.parameterId);
        const expressionParameters = this.getExpressionParameters();
        let parameterIndex = -1;
        for (let j = 0; j < expressionParameters.getSize(); ++j) {
          if (expressionParameterValue.parameterId != expressionParameters.at(j).parameterId) {
            continue;
          }
          parameterIndex = j;
          break;
        }
        if (parameterIndex < 0) {
          if (expressionIndex == 0) {
            expressionParameterValue.additiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
            expressionParameterValue.multiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
            expressionParameterValue.overwriteValue = currentParameterValue;
          } else {
            expressionParameterValue.additiveValue = this.calculateValue(
              expressionParameterValue.additiveValue,
              _CubismExpressionMotion.DefaultAdditiveValue,
              fadeWeight
            );
            expressionParameterValue.multiplyValue = this.calculateValue(
              expressionParameterValue.multiplyValue,
              _CubismExpressionMotion.DefaultMultiplyValue,
              fadeWeight
            );
            expressionParameterValue.overwriteValue = this.calculateValue(
              expressionParameterValue.overwriteValue,
              currentParameterValue,
              fadeWeight
            );
          }
          continue;
        }
        const value = expressionParameters.at(parameterIndex).value;
        let newAdditiveValue, newMultiplyValue, newOverwriteValue;
        switch (expressionParameters.at(parameterIndex).blendType) {
          case 0 /* Additive */:
            newAdditiveValue = value;
            newMultiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
            newOverwriteValue = currentParameterValue;
            break;
          case 1 /* Multiply */:
            newAdditiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
            newMultiplyValue = value;
            newOverwriteValue = currentParameterValue;
            break;
          case 2 /* Overwrite */:
            newAdditiveValue = _CubismExpressionMotion.DefaultAdditiveValue;
            newMultiplyValue = _CubismExpressionMotion.DefaultMultiplyValue;
            newOverwriteValue = value;
            break;
          default:
            return;
        }
        if (expressionIndex == 0) {
          expressionParameterValue.additiveValue = newAdditiveValue;
          expressionParameterValue.multiplyValue = newMultiplyValue;
          expressionParameterValue.overwriteValue = newOverwriteValue;
        } else {
          expressionParameterValue.additiveValue = expressionParameterValue.additiveValue * (1 - fadeWeight) + newAdditiveValue * fadeWeight;
          expressionParameterValue.multiplyValue = expressionParameterValue.multiplyValue * (1 - fadeWeight) + newMultiplyValue * fadeWeight;
          expressionParameterValue.overwriteValue = expressionParameterValue.overwriteValue * (1 - fadeWeight) + newOverwriteValue * fadeWeight;
        }
      }
    }
    /**
     * @brief 表情が参照しているパラメータを取得
     *
     * 表情が参照しているパラメータを取得する
     *
     * @return 表情パラメータ
     */
    getExpressionParameters() {
      return this._parameters;
    }
    /**
     * @brief 表情のフェードの値を取得
     *
     * 現在の表情のフェードのウェイト値を取得する
     *
     * @returns 表情のフェードのウェイト値
     *
     * @deprecated CubismExpressionMotion.fadeWeightが削除予定のため非推奨。
     * CubismExpressionMotionManager.getFadeWeight(index: number): number を使用してください。
     * @see CubismExpressionMotionManager#getFadeWeight(index: number)
     */
    getFadeWeight() {
      return this._fadeWeight;
    }
    parse(buffer, size) {
      const json = CubismJson.create(buffer, size);
      if (!json) {
        return;
      }
      const root = json.getRoot();
      this.setFadeInTime(
        root.getValueByString(ExpressionKeyFadeIn).toFloat(DefaultFadeTime)
      );
      this.setFadeOutTime(
        root.getValueByString(ExpressionKeyFadeOut).toFloat(DefaultFadeTime)
      );
      const parameterCount = root.getValueByString(ExpressionKeyParameters).getSize();
      this._parameters.prepareCapacity(parameterCount);
      for (let i = 0; i < parameterCount; ++i) {
        const param = root.getValueByString(ExpressionKeyParameters).getValueByIndex(i);
        const parameterId = CubismFramework.getIdManager().getId(
          param.getValueByString(ExpressionKeyId).getRawString()
        );
        const value = param.getValueByString(ExpressionKeyValue).toFloat();
        let blendType;
        if (param.getValueByString(ExpressionKeyBlend).isNull() || param.getValueByString(ExpressionKeyBlend).getString() == BlendValueAdd) {
          blendType = 0 /* Additive */;
        } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueMultiply) {
          blendType = 1 /* Multiply */;
        } else if (param.getValueByString(ExpressionKeyBlend).getString() == BlendValueOverwrite) {
          blendType = 2 /* Overwrite */;
        } else {
          blendType = 0 /* Additive */;
        }
        const item = new ExpressionParameter();
        item.parameterId = parameterId;
        item.blendType = blendType;
        item.value = value;
        this._parameters.pushBack(item);
      }
      CubismJson.delete(json);
    }
    /**
     * @brief ブレンド計算
     *
     * 入力された値でブレンド計算をする。
     *
     * @param source 現在の値
     * @param destination 適用する値
     * @param weight ウェイト
     * @returns 計算結果
     */
    calculateValue(source, destination, fadeWeight) {
      return source * (1 - fadeWeight) + destination * fadeWeight;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._parameters = new csmVector();
      this._fadeWeight = 0;
    }
  };
  _CubismExpressionMotion.DefaultAdditiveValue = 0;
  // 加算適用の初期値
  _CubismExpressionMotion.DefaultMultiplyValue = 1;
  var CubismExpressionMotion = _CubismExpressionMotion;
  var ExpressionBlendType = /* @__PURE__ */ ((ExpressionBlendType2) => {
    ExpressionBlendType2[ExpressionBlendType2["Additive"] = 0] = "Additive";
    ExpressionBlendType2[ExpressionBlendType2["Multiply"] = 1] = "Multiply";
    ExpressionBlendType2[ExpressionBlendType2["Overwrite"] = 2] = "Overwrite";
    return ExpressionBlendType2;
  })(ExpressionBlendType || {});
  var ExpressionParameter = class {
    // 値
  };
  var Live2DCubismFramework20;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismExpressionMotion = CubismExpressionMotion;
    Live2DCubismFramework40.ExpressionBlendType = ExpressionBlendType;
    Live2DCubismFramework40.ExpressionParameter = ExpressionParameter;
  })(Live2DCubismFramework20 || (Live2DCubismFramework20 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotionqueueentry.ts
  var CubismMotionQueueEntry = class {
    /**
     * コンストラクタ
     */
    constructor() {
      this._autoDelete = false;
      this._motion = null;
      this._available = true;
      this._finished = false;
      this._started = false;
      this._startTimeSeconds = -1;
      this._fadeInStartTimeSeconds = 0;
      this._endTimeSeconds = -1;
      this._stateTimeSeconds = 0;
      this._stateWeight = 0;
      this._lastEventCheckSeconds = 0;
      this._motionQueueEntryHandle = this;
      this._fadeOutSeconds = 0;
      this._isTriggeredFadeOut = false;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      if (this._autoDelete && this._motion) {
        ACubismMotion.delete(this._motion);
      }
    }
    /**
     * フェードアウト時間と開始判定の設定
     * @param fadeOutSeconds フェードアウトにかかる時間[秒]
     */
    setFadeOut(fadeOutSeconds) {
      this._fadeOutSeconds = fadeOutSeconds;
      this._isTriggeredFadeOut = true;
    }
    /**
     * フェードアウトの開始
     * @param fadeOutSeconds フェードアウトにかかる時間[秒]
     * @param userTimeSeconds デルタ時間の積算値[秒]
     */
    startFadeOut(fadeOutSeconds, userTimeSeconds) {
      const newEndTimeSeconds = userTimeSeconds + fadeOutSeconds;
      this._isTriggeredFadeOut = true;
      if (this._endTimeSeconds < 0 || newEndTimeSeconds < this._endTimeSeconds) {
        this._endTimeSeconds = newEndTimeSeconds;
      }
    }
    /**
     * モーションの終了の確認
     *
     * @return true モーションが終了した
     * @return false 終了していない
     */
    isFinished() {
      return this._finished;
    }
    /**
     * モーションの開始の確認
     * @return true モーションが開始した
     * @return false 開始していない
     */
    isStarted() {
      return this._started;
    }
    /**
     * モーションの開始時刻の取得
     * @return モーションの開始時刻[秒]
     */
    getStartTime() {
      return this._startTimeSeconds;
    }
    /**
     * フェードインの開始時刻の取得
     * @return フェードインの開始時刻[秒]
     */
    getFadeInStartTime() {
      return this._fadeInStartTimeSeconds;
    }
    /**
     * フェードインの終了時刻の取得
     * @return フェードインの終了時刻の取得
     */
    getEndTime() {
      return this._endTimeSeconds;
    }
    /**
     * モーションの開始時刻の設定
     * @param startTime モーションの開始時刻
     */
    setStartTime(startTime) {
      this._startTimeSeconds = startTime;
    }
    /**
     * フェードインの開始時刻の設定
     * @param startTime フェードインの開始時刻[秒]
     */
    setFadeInStartTime(startTime) {
      this._fadeInStartTimeSeconds = startTime;
    }
    /**
     * フェードインの終了時刻の設定
     * @param endTime フェードインの終了時刻[秒]
     */
    setEndTime(endTime) {
      this._endTimeSeconds = endTime;
    }
    /**
     * モーションの終了の設定
     * @param f trueならモーションの終了
     */
    setIsFinished(f) {
      this._finished = f;
    }
    /**
     * モーション開始の設定
     * @param f trueならモーションの開始
     */
    setIsStarted(f) {
      this._started = f;
    }
    /**
     * モーションの有効性の確認
     * @return true モーションは有効
     * @return false モーションは無効
     */
    isAvailable() {
      return this._available;
    }
    /**
     * モーションの有効性の設定
     * @param v trueならモーションは有効
     */
    setIsAvailable(v) {
      this._available = v;
    }
    /**
     * モーションの状態の設定
     * @param timeSeconds 現在時刻[秒]
     * @param weight モーション尾重み
     */
    setState(timeSeconds, weight) {
      this._stateTimeSeconds = timeSeconds;
      this._stateWeight = weight;
    }
    /**
     * モーションの現在時刻の取得
     * @return モーションの現在時刻[秒]
     */
    getStateTime() {
      return this._stateTimeSeconds;
    }
    /**
     * モーションの重みの取得
     * @return モーションの重み
     */
    getStateWeight() {
      return this._stateWeight;
    }
    /**
     * 最後にイベントの発火をチェックした時間を取得
     *
     * @return 最後にイベントの発火をチェックした時間[秒]
     */
    getLastCheckEventSeconds() {
      return this._lastEventCheckSeconds;
    }
    /**
     * 最後にイベントをチェックした時間を設定
     * @param checkSeconds 最後にイベントをチェックした時間[秒]
     */
    setLastCheckEventSeconds(checkSeconds) {
      this._lastEventCheckSeconds = checkSeconds;
    }
    /**
     * フェードアウト開始判定の取得
     * @return フェードアウト開始するかどうか
     */
    isTriggeredFadeOut() {
      return this._isTriggeredFadeOut;
    }
    /**
     * フェードアウト時間の取得
     * @return フェードアウト時間[秒]
     */
    getFadeOutSeconds() {
      return this._fadeOutSeconds;
    }
    /**
     * モーションの取得
     *
     * @return モーション
     */
    getCubismMotion() {
      return this._motion;
    }
    // インスタンスごとに一意の値を持つ識別番号
  };
  var Live2DCubismFramework21;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotionQueueEntry = CubismMotionQueueEntry;
  })(Live2DCubismFramework21 || (Live2DCubismFramework21 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotionqueuemanager.ts
  var CubismMotionQueueManager = class {
    /**
     * コンストラクタ
     */
    constructor() {
      this._userTimeSeconds = 0;
      this._eventCallBack = null;
      this._eventCustomData = null;
      this._motions = new csmVector();
    }
    /**
     * デストラクタ
     */
    release() {
      for (let i = 0; i < this._motions.getSize(); ++i) {
        if (this._motions.at(i)) {
          this._motions.at(i).release();
          this._motions.set(i, null);
        }
      }
      this._motions = null;
    }
    /**
     * 指定したモーションの開始
     *
     * 指定したモーションを開始する。同じタイプのモーションが既にある場合は、既存のモーションに終了フラグを立て、フェードアウトを開始させる。
     *
     * @param   motion          開始するモーション
     * @param   autoDelete      再生が終了したモーションのインスタンスを削除するなら true
     * @param   userTimeSeconds Deprecated: デルタ時間の積算値[秒] 関数内で参照していないため使用は非推奨。
     * @return                      開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するIsFinished()の引数で使用する。開始できない時は「-1」
     */
    startMotion(motion, autoDelete, userTimeSeconds) {
      if (motion == null) {
        return InvalidMotionQueueEntryHandleValue;
      }
      let motionQueueEntry = null;
      for (let i = 0; i < this._motions.getSize(); ++i) {
        motionQueueEntry = this._motions.at(i);
        if (motionQueueEntry == null) {
          continue;
        }
        motionQueueEntry.setFadeOut(motionQueueEntry._motion.getFadeOutTime());
      }
      motionQueueEntry = new CubismMotionQueueEntry();
      motionQueueEntry._autoDelete = autoDelete;
      motionQueueEntry._motion = motion;
      this._motions.pushBack(motionQueueEntry);
      return motionQueueEntry._motionQueueEntryHandle;
    }
    /**
     * 全てのモーションの終了の確認
     * @return true 全て終了している
     * @return false 終了していない
     */
    isFinished() {
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
        let motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          ite = this._motions.erase(ite);
          continue;
        }
        const motion = motionQueueEntry._motion;
        if (motion == null) {
          motionQueueEntry.release();
          motionQueueEntry = null;
          ite = this._motions.erase(ite);
          continue;
        }
        if (!motionQueueEntry.isFinished()) {
          return false;
        } else {
          ite.preIncrement();
        }
      }
      return true;
    }
    /**
     * 指定したモーションの終了の確認
     * @param motionQueueEntryNumber モーションの識別番号
     * @return true 全て終了している
     * @return false 終了していない
     */
    isFinishedByHandle(motionQueueEntryNumber) {
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ite.increment()) {
        const motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          continue;
        }
        if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber && !motionQueueEntry.isFinished()) {
          return false;
        }
      }
      return true;
    }
    /**
     * 全てのモーションを停止する
     */
    stopAllMotions() {
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
        let motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          ite = this._motions.erase(ite);
          continue;
        }
        motionQueueEntry.release();
        motionQueueEntry = null;
        ite = this._motions.erase(ite);
      }
    }
    /**
     * @brief CubismMotionQueueEntryの配列の取得
     *
     * CubismMotionQueueEntryの配列を取得する。
     *
     * @return  CubismMotionQueueEntryの配列へのポインタ
     * @retval  NULL   見つからなかった
     */
    getCubismMotionQueueEntries() {
      return this._motions;
    }
    /**
       * 指定したCubismMotionQueueEntryの取得
    
       * @param   motionQueueEntryNumber  モーションの識別番号
       * @return  指定したCubismMotionQueueEntry
       * @return  null   見つからなかった
       */
    getCubismMotionQueueEntry(motionQueueEntryNumber) {
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ite.preIncrement()) {
        const motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          continue;
        }
        if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber) {
          return motionQueueEntry;
        }
      }
      return null;
    }
    /**
     * イベントを受け取るCallbackの登録
     *
     * @param callback コールバック関数
     * @param customData コールバックに返されるデータ
     */
    setEventCallback(callback, customData = null) {
      this._eventCallBack = callback;
      this._eventCustomData = customData;
    }
    /**
     * モーションを更新して、モデルにパラメータ値を反映する。
     *
     * @param   model   対象のモデル
     * @param   userTimeSeconds   デルタ時間の積算値[秒]
     * @return  true    モデルへパラメータ値の反映あり
     * @return  false   モデルへパラメータ値の反映なし(モーションの変化なし)
     */
    doUpdateMotion(model, userTimeSeconds) {
      let updated = false;
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
        let motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          ite = this._motions.erase(ite);
          continue;
        }
        const motion = motionQueueEntry._motion;
        if (motion == null) {
          motionQueueEntry.release();
          motionQueueEntry = null;
          ite = this._motions.erase(ite);
          continue;
        }
        motion.updateParameters(model, motionQueueEntry, userTimeSeconds);
        updated = true;
        const firedList = motion.getFiredEvent(
          motionQueueEntry.getLastCheckEventSeconds() - motionQueueEntry.getStartTime(),
          userTimeSeconds - motionQueueEntry.getStartTime()
        );
        for (let i = 0; i < firedList.getSize(); ++i) {
          this._eventCallBack(this, firedList.at(i), this._eventCustomData);
        }
        motionQueueEntry.setLastCheckEventSeconds(userTimeSeconds);
        if (motionQueueEntry.isFinished()) {
          motionQueueEntry.release();
          motionQueueEntry = null;
          ite = this._motions.erase(ite);
        } else {
          if (motionQueueEntry.isTriggeredFadeOut()) {
            motionQueueEntry.startFadeOut(
              motionQueueEntry.getFadeOutSeconds(),
              userTimeSeconds
            );
          }
          ite.preIncrement();
        }
      }
      return updated;
    }
    // コールバックに戻されるデータ
  };
  var InvalidMotionQueueEntryHandleValue = -1;
  var Live2DCubismFramework22;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotionQueueManager = CubismMotionQueueManager;
    Live2DCubismFramework40.InvalidMotionQueueEntryHandleValue = InvalidMotionQueueEntryHandleValue;
  })(Live2DCubismFramework22 || (Live2DCubismFramework22 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismexpressionmotionmanager.ts
  var ExpressionParameterValue = class {
    // 上書き値
  };
  var CubismExpressionMotionManager = class extends CubismMotionQueueManager {
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._currentPriority = 0;
      this._reservePriority = 0;
      this._expressionParameterValues = new csmVector();
      this._fadeWeights = new csmVector();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      if (this._expressionParameterValues) {
        csmDelete(this._expressionParameterValues);
        this._expressionParameterValues = null;
      }
      if (this._fadeWeights) {
        csmDelete(this._fadeWeights);
        this._fadeWeights = null;
      }
    }
    /**
     * @brief 再生中のモーションの優先度の取得
     *
     * 再生中のモーションの優先度を取得する。
     *
     * @returns モーションの優先度
     */
    getCurrentPriority() {
      return this._currentPriority;
    }
    /**
     * @brief 予約中のモーションの優先度の取得
     *
     * 予約中のモーションの優先度を取得する。
     *
     * @return  モーションの優先度
     */
    getReservePriority() {
      return this._reservePriority;
    }
    /**
     * @brief 再生中のモーションのウェイトを取得する。
     *
     * @param[in]    index    表情のインデックス
     * @returns               表情モーションのウェイト
     */
    getFadeWeight(index) {
      return this._fadeWeights.at(index);
    }
    /**
     * @brief 予約中のモーションの優先度の設定
     *
     * 予約中のモーションの優先度を設定する。
     *
     * @param[in]   priority     優先度
     */
    setReservePriority(priority) {
      this._reservePriority = priority;
    }
    /**
     * @brief 優先度を設定してモーションの開始
     *
     * 優先度を設定してモーションを開始する。
     *
     * @param[in]   motion          モーション
     * @param[in]   autoDelete      再生が終了したモーションのインスタンスを削除するならtrue
     * @param[in]   priority        優先度
     * @return                      開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するIsFinished()の引数で使用する。開始できない時は「-1」
     */
    startMotionPriority(motion, autoDelete, priority) {
      if (priority == this.getReservePriority()) {
        this.setReservePriority(0);
      }
      this._currentPriority = priority;
      this._fadeWeights.pushBack(0);
      return this.startMotion(motion, autoDelete);
    }
    /**
     * @brief モーションの更新
     *
     * モーションを更新して、モデルにパラメータ値を反映する。
     *
     * @param[in]   model   対象のモデル
     * @param[in]   deltaTimeSeconds    デルタ時間[秒]
     * @retval  true    更新されている
     * @retval  false   更新されていない
     */
    updateMotion(model, deltaTimeSeconds) {
      this._userTimeSeconds += deltaTimeSeconds;
      let updated = false;
      const motions = this.getCubismMotionQueueEntries();
      let expressionWeight = 0;
      let expressionIndex = 0;
      for (let ite = this._motions.begin(); ite.notEqual(this._motions.end()); ) {
        const motionQueueEntry = ite.ptr();
        if (motionQueueEntry == null) {
          ite = motions.erase(ite);
          continue;
        }
        const expressionMotion = motionQueueEntry.getCubismMotion();
        if (expressionMotion == null) {
          csmDelete(motionQueueEntry);
          ite = motions.erase(ite);
          continue;
        }
        const expressionParameters = expressionMotion.getExpressionParameters();
        if (motionQueueEntry.isAvailable()) {
          for (let i = 0; i < expressionParameters.getSize(); ++i) {
            if (expressionParameters.at(i).parameterId == null) {
              continue;
            }
            let index = -1;
            for (let j = 0; j < this._expressionParameterValues.getSize(); ++j) {
              if (this._expressionParameterValues.at(j).parameterId != expressionParameters.at(i).parameterId) {
                continue;
              }
              index = j;
              break;
            }
            if (index >= 0) {
              continue;
            }
            const item = new ExpressionParameterValue();
            item.parameterId = expressionParameters.at(i).parameterId;
            item.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
            item.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
            item.overwriteValue = model.getParameterValueById(item.parameterId);
            this._expressionParameterValues.pushBack(item);
          }
        }
        expressionMotion.setupMotionQueueEntry(
          motionQueueEntry,
          this._userTimeSeconds
        );
        this._fadeWeights.set(
          expressionIndex,
          expressionMotion.updateFadeWeight(
            motionQueueEntry,
            this._userTimeSeconds
          )
        );
        expressionMotion.calculateExpressionParameters(
          model,
          this._userTimeSeconds,
          motionQueueEntry,
          this._expressionParameterValues,
          expressionIndex,
          this._fadeWeights.at(expressionIndex)
        );
        expressionWeight += expressionMotion.getFadeInTime() == 0 ? 1 : CubismMath.getEasingSine(
          (this._userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / expressionMotion.getFadeInTime()
        );
        updated = true;
        if (motionQueueEntry.isTriggeredFadeOut()) {
          motionQueueEntry.startFadeOut(
            motionQueueEntry.getFadeOutSeconds(),
            this._userTimeSeconds
          );
        }
        ite.preIncrement();
        ++expressionIndex;
      }
      if (motions.getSize() > 1) {
        const expressionMotion = motions.at(motions.getSize() - 1).getCubismMotion();
        const latestFadeWeight = this._fadeWeights.at(
          this._fadeWeights.getSize() - 1
        );
        if (latestFadeWeight >= 1) {
          for (let i = motions.getSize() - 2; i >= 0; --i) {
            const motionQueueEntry = motions.at(i);
            csmDelete(motionQueueEntry);
            motions.remove(i);
            this._fadeWeights.remove(i);
          }
        }
      }
      if (expressionWeight > 1) {
        expressionWeight = 1;
      }
      for (let i = 0; i < this._expressionParameterValues.getSize(); ++i) {
        const expressionParameterValue = this._expressionParameterValues.at(i);
        model.setParameterValueById(
          expressionParameterValue.parameterId,
          (expressionParameterValue.overwriteValue + expressionParameterValue.additiveValue) * expressionParameterValue.multiplyValue,
          expressionWeight
        );
        expressionParameterValue.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
        expressionParameterValue.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
      }
      return updated;
    }
    ///< 表情の再生開始時刻
  };
  var Live2DCubismFramework23;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismExpressionMotionManager = CubismExpressionMotionManager;
  })(Live2DCubismFramework23 || (Live2DCubismFramework23 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotioninternal.ts
  var CubismMotionCurveTarget = /* @__PURE__ */ ((CubismMotionCurveTarget2) => {
    CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_Model"] = 0] = "CubismMotionCurveTarget_Model";
    CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_Parameter"] = 1] = "CubismMotionCurveTarget_Parameter";
    CubismMotionCurveTarget2[CubismMotionCurveTarget2["CubismMotionCurveTarget_PartOpacity"] = 2] = "CubismMotionCurveTarget_PartOpacity";
    return CubismMotionCurveTarget2;
  })(CubismMotionCurveTarget || {});
  var CubismMotionSegmentType = /* @__PURE__ */ ((CubismMotionSegmentType2) => {
    CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Linear"] = 0] = "CubismMotionSegmentType_Linear";
    CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Bezier"] = 1] = "CubismMotionSegmentType_Bezier";
    CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_Stepped"] = 2] = "CubismMotionSegmentType_Stepped";
    CubismMotionSegmentType2[CubismMotionSegmentType2["CubismMotionSegmentType_InverseStepped"] = 3] = "CubismMotionSegmentType_InverseStepped";
    return CubismMotionSegmentType2;
  })(CubismMotionSegmentType || {});
  var CubismMotionPoint = class {
    constructor() {
      this.time = 0;
      // 時間[秒]
      this.value = 0;
    }
    // 値
  };
  var CubismMotionSegment = class {
    /**
     * @brief コンストラクタ
     *
     * コンストラクタ。
     */
    constructor() {
      this.evaluate = null;
      this.basePointIndex = 0;
      this.segmentType = 0;
    }
    // セグメントの種類
  };
  var CubismMotionCurve = class {
    constructor() {
      this.type = 0 /* CubismMotionCurveTarget_Model */;
      this.segmentCount = 0;
      this.baseSegmentIndex = 0;
      this.fadeInTime = 0;
      this.fadeOutTime = 0;
    }
    // フェードアウトにかかる時間[秒]
  };
  var CubismMotionEvent = class {
    constructor() {
      this.fireTime = 0;
    }
  };
  var CubismMotionData = class {
    constructor() {
      this.duration = 0;
      this.loop = false;
      this.curveCount = 0;
      this.eventCount = 0;
      this.fps = 0;
      this.curves = new csmVector();
      this.segments = new csmVector();
      this.points = new csmVector();
      this.events = new csmVector();
    }
    // イベントのリスト
  };
  var Live2DCubismFramework24;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotionCurve = CubismMotionCurve;
    Live2DCubismFramework40.CubismMotionCurveTarget = CubismMotionCurveTarget;
    Live2DCubismFramework40.CubismMotionData = CubismMotionData;
    Live2DCubismFramework40.CubismMotionEvent = CubismMotionEvent;
    Live2DCubismFramework40.CubismMotionPoint = CubismMotionPoint;
    Live2DCubismFramework40.CubismMotionSegment = CubismMotionSegment;
    Live2DCubismFramework40.CubismMotionSegmentType = CubismMotionSegmentType;
  })(Live2DCubismFramework24 || (Live2DCubismFramework24 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotionjson.ts
  var Meta = "Meta";
  var Duration = "Duration";
  var Loop = "Loop";
  var AreBeziersRestricted = "AreBeziersRestricted";
  var CurveCount = "CurveCount";
  var Fps = "Fps";
  var TotalSegmentCount = "TotalSegmentCount";
  var TotalPointCount = "TotalPointCount";
  var Curves = "Curves";
  var Target = "Target";
  var Id2 = "Id";
  var FadeInTime = "FadeInTime";
  var FadeOutTime = "FadeOutTime";
  var Segments = "Segments";
  var UserData = "UserData";
  var UserDataCount = "UserDataCount";
  var TotalUserDataSize = "TotalUserDataSize";
  var Time = "Time";
  var Value5 = "Value";
  var CubismMotionJson = class {
    /**
     * コンストラクタ
     * @param buffer motion3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     */
    constructor(buffer, size) {
      this._json = CubismJson.create(buffer, size);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      CubismJson.delete(this._json);
    }
    /**
     * モーションの長さを取得する
     * @return モーションの長さ[秒]
     */
    getMotionDuration() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(Duration).toFloat();
    }
    /**
     * モーションのループ情報の取得
     * @return true ループする
     * @return false ループしない
     */
    isMotionLoop() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(Loop).toBoolean();
    }
    getEvaluationOptionFlag(flagType) {
      if (0 /* EvaluationOptionFlag_AreBeziersRistricted */ == flagType) {
        return this._json.getRoot().getValueByString(Meta).getValueByString(AreBeziersRestricted).toBoolean();
      }
      return false;
    }
    /**
     * モーションカーブの個数の取得
     * @return モーションカーブの個数
     */
    getMotionCurveCount() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(CurveCount).toInt();
    }
    /**
     * モーションのフレームレートの取得
     * @return フレームレート[FPS]
     */
    getMotionFps() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(Fps).toFloat();
    }
    /**
     * モーションのセグメントの総合計の取得
     * @return モーションのセグメントの取得
     */
    getMotionTotalSegmentCount() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(TotalSegmentCount).toInt();
    }
    /**
     * モーションのカーブの制御店の総合計の取得
     * @return モーションのカーブの制御点の総合計
     */
    getMotionTotalPointCount() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(TotalPointCount).toInt();
    }
    /**
     * モーションのフェードイン時間の存在
     * @return true 存在する
     * @return false 存在しない
     */
    isExistMotionFadeInTime() {
      return !this._json.getRoot().getValueByString(Meta).getValueByString(FadeInTime).isNull();
    }
    /**
     * モーションのフェードアウト時間の存在
     * @return true 存在する
     * @return false 存在しない
     */
    isExistMotionFadeOutTime() {
      return !this._json.getRoot().getValueByString(Meta).getValueByString(FadeOutTime).isNull();
    }
    /**
     * モーションのフェードイン時間の取得
     * @return フェードイン時間[秒]
     */
    getMotionFadeInTime() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(FadeInTime).toFloat();
    }
    /**
     * モーションのフェードアウト時間の取得
     * @return フェードアウト時間[秒]
     */
    getMotionFadeOutTime() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(FadeOutTime).toFloat();
    }
    /**
     * モーションのカーブの種類の取得
     * @param curveIndex カーブのインデックス
     * @return カーブの種類
     */
    getMotionCurveTarget(curveIndex) {
      return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Target).getRawString();
    }
    /**
     * モーションのカーブのIDの取得
     * @param curveIndex カーブのインデックス
     * @return カーブのID
     */
    getMotionCurveId(curveIndex) {
      return CubismFramework.getIdManager().getId(
        this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Id2).getRawString()
      );
    }
    /**
     * モーションのカーブのフェードイン時間の存在
     * @param curveIndex カーブのインデックス
     * @return true 存在する
     * @return false 存在しない
     */
    isExistMotionCurveFadeInTime(curveIndex) {
      return !this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeInTime).isNull();
    }
    /**
     * モーションのカーブのフェードアウト時間の存在
     * @param curveIndex カーブのインデックス
     * @return true 存在する
     * @return false 存在しない
     */
    isExistMotionCurveFadeOutTime(curveIndex) {
      return !this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeOutTime).isNull();
    }
    /**
     * モーションのカーブのフェードイン時間の取得
     * @param curveIndex カーブのインデックス
     * @return フェードイン時間[秒]
     */
    getMotionCurveFadeInTime(curveIndex) {
      return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeInTime).toFloat();
    }
    /**
     * モーションのカーブのフェードアウト時間の取得
     * @param curveIndex カーブのインデックス
     * @return フェードアウト時間[秒]
     */
    getMotionCurveFadeOutTime(curveIndex) {
      return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(FadeOutTime).toFloat();
    }
    /**
     * モーションのカーブのセグメントの個数を取得する
     * @param curveIndex カーブのインデックス
     * @return モーションのカーブのセグメントの個数
     */
    getMotionCurveSegmentCount(curveIndex) {
      return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Segments).getVector().getSize();
    }
    /**
     * モーションのカーブのセグメントの値の取得
     * @param curveIndex カーブのインデックス
     * @param segmentIndex セグメントのインデックス
     * @return セグメントの値
     */
    getMotionCurveSegment(curveIndex, segmentIndex) {
      return this._json.getRoot().getValueByString(Curves).getValueByIndex(curveIndex).getValueByString(Segments).getValueByIndex(segmentIndex).toFloat();
    }
    /**
     * イベントの個数の取得
     * @return イベントの個数
     */
    getEventCount() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(UserDataCount).toInt();
    }
    /**
     *  イベントの総文字数の取得
     * @return イベントの総文字数
     */
    getTotalEventValueSize() {
      return this._json.getRoot().getValueByString(Meta).getValueByString(TotalUserDataSize).toInt();
    }
    /**
     * イベントの時間の取得
     * @param userDataIndex イベントのインデックス
     * @return イベントの時間[秒]
     */
    getEventTime(userDataIndex) {
      return this._json.getRoot().getValueByString(UserData).getValueByIndex(userDataIndex).getValueByString(Time).toFloat();
    }
    /**
     * イベントの取得
     * @param userDataIndex イベントのインデックス
     * @return イベントの文字列
     */
    getEventValue(userDataIndex) {
      return new csmString(
        this._json.getRoot().getValueByString(UserData).getValueByIndex(userDataIndex).getValueByString(Value5).getRawString()
      );
    }
    // motion3.jsonのデータ
  };
  var Live2DCubismFramework25;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotionJson = CubismMotionJson;
  })(Live2DCubismFramework25 || (Live2DCubismFramework25 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotion.ts
  var EffectNameEyeBlink = "EyeBlink";
  var EffectNameLipSync = "LipSync";
  var TargetNameModel = "Model";
  var TargetNameParameter = "Parameter";
  var TargetNamePartOpacity = "PartOpacity";
  var IdNameOpacity = "Opacity";
  var UseOldBeziersCurveMotion = false;
  function lerpPoints(a, b, t) {
    const result = new CubismMotionPoint();
    result.time = a.time + (b.time - a.time) * t;
    result.value = a.value + (b.value - a.value) * t;
    return result;
  }
  function linearEvaluate(points, time) {
    let t = (time - points[0].time) / (points[1].time - points[0].time);
    if (t < 0) {
      t = 0;
    }
    return points[0].value + (points[1].value - points[0].value) * t;
  }
  function bezierEvaluate(points, time) {
    let t = (time - points[0].time) / (points[3].time - points[0].time);
    if (t < 0) {
      t = 0;
    }
    const p01 = lerpPoints(points[0], points[1], t);
    const p12 = lerpPoints(points[1], points[2], t);
    const p23 = lerpPoints(points[2], points[3], t);
    const p012 = lerpPoints(p01, p12, t);
    const p123 = lerpPoints(p12, p23, t);
    return lerpPoints(p012, p123, t).value;
  }
  function bezierEvaluateCardanoInterpretation(points, time) {
    const x = time;
    const x1 = points[0].time;
    const x2 = points[3].time;
    const cx1 = points[1].time;
    const cx2 = points[2].time;
    const a = x2 - 3 * cx2 + 3 * cx1 - x1;
    const b = 3 * cx2 - 6 * cx1 + 3 * x1;
    const c = 3 * cx1 - 3 * x1;
    const d = x1 - x;
    const t = CubismMath.cardanoAlgorithmForBezier(a, b, c, d);
    const p01 = lerpPoints(points[0], points[1], t);
    const p12 = lerpPoints(points[1], points[2], t);
    const p23 = lerpPoints(points[2], points[3], t);
    const p012 = lerpPoints(p01, p12, t);
    const p123 = lerpPoints(p12, p23, t);
    return lerpPoints(p012, p123, t).value;
  }
  function steppedEvaluate(points, time) {
    return points[0].value;
  }
  function inverseSteppedEvaluate(points, time) {
    return points[1].value;
  }
  function evaluateCurve(motionData, index, time) {
    const curve = motionData.curves.at(index);
    let target = -1;
    const totalSegmentCount = curve.baseSegmentIndex + curve.segmentCount;
    let pointPosition = 0;
    for (let i = curve.baseSegmentIndex; i < totalSegmentCount; ++i) {
      pointPosition = motionData.segments.at(i).basePointIndex + (motionData.segments.at(i).segmentType == 1 /* CubismMotionSegmentType_Bezier */ ? 3 : 1);
      if (motionData.points.at(pointPosition).time > time) {
        target = i;
        break;
      }
    }
    if (target == -1) {
      return motionData.points.at(pointPosition).value;
    }
    const segment = motionData.segments.at(target);
    return segment.evaluate(motionData.points.get(segment.basePointIndex), time);
  }
  var CubismMotion = class _CubismMotion extends ACubismMotion {
    /**
     * インスタンスを作成する
     *
     * @param buffer motion3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
     * @return 作成されたインスタンス
     */
    static create(buffer, size, onFinishedMotionHandler) {
      const ret = new _CubismMotion();
      ret.parse(buffer, size);
      ret._sourceFrameRate = ret._motionData.fps;
      ret._loopDurationSeconds = ret._motionData.duration;
      ret._onFinishedMotion = onFinishedMotionHandler;
      return ret;
    }
    /**
     * モデルのパラメータの更新の実行
     * @param model             対象のモデル
     * @param userTimeSeconds   現在の時刻[秒]
     * @param fadeWeight        モーションの重み
     * @param motionQueueEntry  CubismMotionQueueManagerで管理されているモーション
     */
    doUpdateParameters(model, userTimeSeconds, fadeWeight, motionQueueEntry) {
      if (this._modelCurveIdEyeBlink == null) {
        this._modelCurveIdEyeBlink = CubismFramework.getIdManager().getId(EffectNameEyeBlink);
      }
      if (this._modelCurveIdLipSync == null) {
        this._modelCurveIdLipSync = CubismFramework.getIdManager().getId(EffectNameLipSync);
      }
      if (this._modelCurveIdOpacity == null) {
        this._modelCurveIdOpacity = CubismFramework.getIdManager().getId(IdNameOpacity);
      }
      let timeOffsetSeconds = userTimeSeconds - motionQueueEntry.getStartTime();
      if (timeOffsetSeconds < 0) {
        timeOffsetSeconds = 0;
      }
      let lipSyncValue = Number.MAX_VALUE;
      let eyeBlinkValue = Number.MAX_VALUE;
      const maxTargetSize = 64;
      let lipSyncFlags = 0;
      let eyeBlinkFlags = 0;
      if (this._eyeBlinkParameterIds.getSize() > maxTargetSize) {
        CubismLogDebug(
          "too many eye blink targets : {0}",
          this._eyeBlinkParameterIds.getSize()
        );
      }
      if (this._lipSyncParameterIds.getSize() > maxTargetSize) {
        CubismLogDebug(
          "too many lip sync targets : {0}",
          this._lipSyncParameterIds.getSize()
        );
      }
      const tmpFadeIn = this._fadeInSeconds <= 0 ? 1 : CubismMath.getEasingSine(
        (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / this._fadeInSeconds
      );
      const tmpFadeOut = this._fadeOutSeconds <= 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
        (motionQueueEntry.getEndTime() - userTimeSeconds) / this._fadeOutSeconds
      );
      let value;
      let c, parameterIndex;
      let time = timeOffsetSeconds;
      if (this._isLoop) {
        while (time > this._motionData.duration) {
          time -= this._motionData.duration;
        }
      }
      const curves = this._motionData.curves;
      for (c = 0; c < this._motionData.curveCount && curves.at(c).type == 0 /* CubismMotionCurveTarget_Model */; ++c) {
        value = evaluateCurve(this._motionData, c, time);
        if (curves.at(c).id == this._modelCurveIdEyeBlink) {
          eyeBlinkValue = value;
        } else if (curves.at(c).id == this._modelCurveIdLipSync) {
          lipSyncValue = value;
        } else if (curves.at(c).id == this._modelCurveIdOpacity) {
          this._modelOpacity = value;
          model.setModelOapcity(this.getModelOpacityValue());
        }
      }
      let parameterMotionCurveCount = 0;
      for (; c < this._motionData.curveCount && curves.at(c).type == 1 /* CubismMotionCurveTarget_Parameter */; ++c) {
        parameterMotionCurveCount++;
        parameterIndex = model.getParameterIndex(curves.at(c).id);
        if (parameterIndex == -1) {
          continue;
        }
        const sourceValue = model.getParameterValueByIndex(parameterIndex);
        value = evaluateCurve(this._motionData, c, time);
        if (eyeBlinkValue != Number.MAX_VALUE) {
          for (let i = 0; i < this._eyeBlinkParameterIds.getSize() && i < maxTargetSize; ++i) {
            if (this._eyeBlinkParameterIds.at(i) == curves.at(c).id) {
              value *= eyeBlinkValue;
              eyeBlinkFlags |= 1 << i;
              break;
            }
          }
        }
        if (lipSyncValue != Number.MAX_VALUE) {
          for (let i = 0; i < this._lipSyncParameterIds.getSize() && i < maxTargetSize; ++i) {
            if (this._lipSyncParameterIds.at(i) == curves.at(c).id) {
              value += lipSyncValue;
              lipSyncFlags |= 1 << i;
              break;
            }
          }
        }
        let v;
        if (curves.at(c).fadeInTime < 0 && curves.at(c).fadeOutTime < 0) {
          v = sourceValue + (value - sourceValue) * fadeWeight;
        } else {
          let fin;
          let fout;
          if (curves.at(c).fadeInTime < 0) {
            fin = tmpFadeIn;
          } else {
            fin = curves.at(c).fadeInTime == 0 ? 1 : CubismMath.getEasingSine(
              (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) / curves.at(c).fadeInTime
            );
          }
          if (curves.at(c).fadeOutTime < 0) {
            fout = tmpFadeOut;
          } else {
            fout = curves.at(c).fadeOutTime == 0 || motionQueueEntry.getEndTime() < 0 ? 1 : CubismMath.getEasingSine(
              (motionQueueEntry.getEndTime() - userTimeSeconds) / curves.at(c).fadeOutTime
            );
          }
          const paramWeight = this._weight * fin * fout;
          v = sourceValue + (value - sourceValue) * paramWeight;
        }
        model.setParameterValueByIndex(parameterIndex, v, 1);
      }
      {
        if (eyeBlinkValue != Number.MAX_VALUE) {
          for (let i = 0; i < this._eyeBlinkParameterIds.getSize() && i < maxTargetSize; ++i) {
            const sourceValue = model.getParameterValueById(
              this._eyeBlinkParameterIds.at(i)
            );
            if (eyeBlinkFlags >> i & 1) {
              continue;
            }
            const v = sourceValue + (eyeBlinkValue - sourceValue) * fadeWeight;
            model.setParameterValueById(this._eyeBlinkParameterIds.at(i), v);
          }
        }
        if (lipSyncValue != Number.MAX_VALUE) {
          for (let i = 0; i < this._lipSyncParameterIds.getSize() && i < maxTargetSize; ++i) {
            const sourceValue = model.getParameterValueById(
              this._lipSyncParameterIds.at(i)
            );
            if (lipSyncFlags >> i & 1) {
              continue;
            }
            const v = sourceValue + (lipSyncValue - sourceValue) * fadeWeight;
            model.setParameterValueById(this._lipSyncParameterIds.at(i), v);
          }
        }
      }
      for (; c < this._motionData.curveCount && curves.at(c).type == 2 /* CubismMotionCurveTarget_PartOpacity */; ++c) {
        parameterIndex = model.getParameterIndex(curves.at(c).id);
        if (parameterIndex == -1) {
          continue;
        }
        value = evaluateCurve(this._motionData, c, time);
        model.setParameterValueByIndex(parameterIndex, value);
      }
      if (timeOffsetSeconds >= this._motionData.duration) {
        if (this._isLoop) {
          motionQueueEntry.setStartTime(userTimeSeconds);
          if (this._isLoopFadeIn) {
            motionQueueEntry.setFadeInStartTime(userTimeSeconds);
          }
        } else {
          if (this._onFinishedMotion) {
            this._onFinishedMotion(this);
          }
          motionQueueEntry.setIsFinished(true);
        }
      }
      this._lastWeight = fadeWeight;
    }
    /**
     * ループ情報の設定
     * @param loop ループ情報
     */
    setIsLoop(loop) {
      this._isLoop = loop;
    }
    /**
     * ループ情報の取得
     * @return true ループする
     * @return false ループしない
     */
    isLoop() {
      return this._isLoop;
    }
    /**
     * ループ時のフェードイン情報の設定
     * @param loopFadeIn  ループ時のフェードイン情報
     */
    setIsLoopFadeIn(loopFadeIn) {
      this._isLoopFadeIn = loopFadeIn;
    }
    /**
     * ループ時のフェードイン情報の取得
     *
     * @return  true    する
     * @return  false   しない
     */
    isLoopFadeIn() {
      return this._isLoopFadeIn;
    }
    /**
     * モーションの長さを取得する。
     *
     * @return  モーションの長さ[秒]
     */
    getDuration() {
      return this._isLoop ? -1 : this._loopDurationSeconds;
    }
    /**
     * モーションのループ時の長さを取得する。
     *
     * @return  モーションのループ時の長さ[秒]
     */
    getLoopDuration() {
      return this._loopDurationSeconds;
    }
    /**
     * パラメータに対するフェードインの時間を設定する。
     *
     * @param parameterId     パラメータID
     * @param value           フェードインにかかる時間[秒]
     */
    setParameterFadeInTime(parameterId, value) {
      const curves = this._motionData.curves;
      for (let i = 0; i < this._motionData.curveCount; ++i) {
        if (parameterId == curves.at(i).id) {
          curves.at(i).fadeInTime = value;
          return;
        }
      }
    }
    /**
     * パラメータに対するフェードアウトの時間の設定
     * @param parameterId     パラメータID
     * @param value           フェードアウトにかかる時間[秒]
     */
    setParameterFadeOutTime(parameterId, value) {
      const curves = this._motionData.curves;
      for (let i = 0; i < this._motionData.curveCount; ++i) {
        if (parameterId == curves.at(i).id) {
          curves.at(i).fadeOutTime = value;
          return;
        }
      }
    }
    /**
     * パラメータに対するフェードインの時間の取得
     * @param    parameterId     パラメータID
     * @return   フェードインにかかる時間[秒]
     */
    getParameterFadeInTime(parameterId) {
      const curves = this._motionData.curves;
      for (let i = 0; i < this._motionData.curveCount; ++i) {
        if (parameterId == curves.at(i).id) {
          return curves.at(i).fadeInTime;
        }
      }
      return -1;
    }
    /**
     * パラメータに対するフェードアウトの時間を取得
     *
     * @param   parameterId     パラメータID
     * @return   フェードアウトにかかる時間[秒]
     */
    getParameterFadeOutTime(parameterId) {
      const curves = this._motionData.curves;
      for (let i = 0; i < this._motionData.curveCount; ++i) {
        if (parameterId == curves.at(i).id) {
          return curves.at(i).fadeOutTime;
        }
      }
      return -1;
    }
    /**
     * 自動エフェクトがかかっているパラメータIDリストの設定
     * @param eyeBlinkParameterIds    自動まばたきがかかっているパラメータIDのリスト
     * @param lipSyncParameterIds     リップシンクがかかっているパラメータIDのリスト
     */
    setEffectIds(eyeBlinkParameterIds, lipSyncParameterIds) {
      this._eyeBlinkParameterIds = eyeBlinkParameterIds;
      this._lipSyncParameterIds = lipSyncParameterIds;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._sourceFrameRate = 30;
      this._loopDurationSeconds = -1;
      this._isLoop = false;
      this._isLoopFadeIn = true;
      this._lastWeight = 0;
      this._motionData = null;
      this._modelCurveIdEyeBlink = null;
      this._modelCurveIdLipSync = null;
      this._modelCurveIdOpacity = null;
      this._eyeBlinkParameterIds = null;
      this._lipSyncParameterIds = null;
      this._modelOpacity = 1;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      this._motionData = void 0;
      this._motionData = null;
    }
    /**
     * motion3.jsonをパースする。
     *
     * @param motionJson  motion3.jsonが読み込まれているバッファ
     * @param size        バッファのサイズ
     */
    parse(motionJson, size) {
      this._motionData = new CubismMotionData();
      let json = new CubismMotionJson(motionJson, size);
      if (!json) {
        json.release();
        json = void 0;
        return;
      }
      this._motionData.duration = json.getMotionDuration();
      this._motionData.loop = json.isMotionLoop();
      this._motionData.curveCount = json.getMotionCurveCount();
      this._motionData.fps = json.getMotionFps();
      this._motionData.eventCount = json.getEventCount();
      const areBeziersRestructed = json.getEvaluationOptionFlag(
        0 /* EvaluationOptionFlag_AreBeziersRistricted */
      );
      if (json.isExistMotionFadeInTime()) {
        this._fadeInSeconds = json.getMotionFadeInTime() < 0 ? 1 : json.getMotionFadeInTime();
      } else {
        this._fadeInSeconds = 1;
      }
      if (json.isExistMotionFadeOutTime()) {
        this._fadeOutSeconds = json.getMotionFadeOutTime() < 0 ? 1 : json.getMotionFadeOutTime();
      } else {
        this._fadeOutSeconds = 1;
      }
      this._motionData.curves.updateSize(
        this._motionData.curveCount,
        CubismMotionCurve,
        true
      );
      this._motionData.segments.updateSize(
        json.getMotionTotalSegmentCount(),
        CubismMotionSegment,
        true
      );
      this._motionData.points.updateSize(
        json.getMotionTotalPointCount(),
        CubismMotionPoint,
        true
      );
      this._motionData.events.updateSize(
        this._motionData.eventCount,
        CubismMotionEvent,
        true
      );
      let totalPointCount = 0;
      let totalSegmentCount = 0;
      for (let curveCount = 0; curveCount < this._motionData.curveCount; ++curveCount) {
        if (json.getMotionCurveTarget(curveCount) == TargetNameModel) {
          this._motionData.curves.at(curveCount).type = 0 /* CubismMotionCurveTarget_Model */;
        } else if (json.getMotionCurveTarget(curveCount) == TargetNameParameter) {
          this._motionData.curves.at(curveCount).type = 1 /* CubismMotionCurveTarget_Parameter */;
        } else if (json.getMotionCurveTarget(curveCount) == TargetNamePartOpacity) {
          this._motionData.curves.at(curveCount).type = 2 /* CubismMotionCurveTarget_PartOpacity */;
        } else {
          CubismLogWarning(
            'Warning : Unable to get segment type from Curve! The number of "CurveCount" may be incorrect!'
          );
        }
        this._motionData.curves.at(curveCount).id = json.getMotionCurveId(curveCount);
        this._motionData.curves.at(curveCount).baseSegmentIndex = totalSegmentCount;
        this._motionData.curves.at(curveCount).fadeInTime = json.isExistMotionCurveFadeInTime(curveCount) ? json.getMotionCurveFadeInTime(curveCount) : -1;
        this._motionData.curves.at(curveCount).fadeOutTime = json.isExistMotionCurveFadeOutTime(curveCount) ? json.getMotionCurveFadeOutTime(curveCount) : -1;
        for (let segmentPosition = 0; segmentPosition < json.getMotionCurveSegmentCount(curveCount); ) {
          if (segmentPosition == 0) {
            this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount;
            this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition);
            this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            totalPointCount += 1;
            segmentPosition += 2;
          } else {
            this._motionData.segments.at(totalSegmentCount).basePointIndex = totalPointCount - 1;
          }
          const segment = json.getMotionCurveSegment(
            curveCount,
            segmentPosition
          );
          const segmentType = segment;
          switch (segmentType) {
            case 0 /* CubismMotionSegmentType_Linear */: {
              this._motionData.segments.at(totalSegmentCount).segmentType = 0 /* CubismMotionSegmentType_Linear */;
              this._motionData.segments.at(totalSegmentCount).evaluate = linearEvaluate;
              this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
              this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
              totalPointCount += 1;
              segmentPosition += 3;
              break;
            }
            case 1 /* CubismMotionSegmentType_Bezier */: {
              this._motionData.segments.at(totalSegmentCount).segmentType = 1 /* CubismMotionSegmentType_Bezier */;
              if (areBeziersRestructed || UseOldBeziersCurveMotion) {
                this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluate;
              } else {
                this._motionData.segments.at(totalSegmentCount).evaluate = bezierEvaluateCardanoInterpretation;
              }
              this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
              this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
              this._motionData.points.at(totalPointCount + 1).time = json.getMotionCurveSegment(curveCount, segmentPosition + 3);
              this._motionData.points.at(totalPointCount + 1).value = json.getMotionCurveSegment(curveCount, segmentPosition + 4);
              this._motionData.points.at(totalPointCount + 2).time = json.getMotionCurveSegment(curveCount, segmentPosition + 5);
              this._motionData.points.at(totalPointCount + 2).value = json.getMotionCurveSegment(curveCount, segmentPosition + 6);
              totalPointCount += 3;
              segmentPosition += 7;
              break;
            }
            case 2 /* CubismMotionSegmentType_Stepped */: {
              this._motionData.segments.at(totalSegmentCount).segmentType = 2 /* CubismMotionSegmentType_Stepped */;
              this._motionData.segments.at(totalSegmentCount).evaluate = steppedEvaluate;
              this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
              this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
              totalPointCount += 1;
              segmentPosition += 3;
              break;
            }
            case 3 /* CubismMotionSegmentType_InverseStepped */: {
              this._motionData.segments.at(totalSegmentCount).segmentType = 3 /* CubismMotionSegmentType_InverseStepped */;
              this._motionData.segments.at(totalSegmentCount).evaluate = inverseSteppedEvaluate;
              this._motionData.points.at(totalPointCount).time = json.getMotionCurveSegment(curveCount, segmentPosition + 1);
              this._motionData.points.at(totalPointCount).value = json.getMotionCurveSegment(curveCount, segmentPosition + 2);
              totalPointCount += 1;
              segmentPosition += 3;
              break;
            }
            default: {
              CSM_ASSERT(0);
              break;
            }
          }
          ++this._motionData.curves.at(curveCount).segmentCount;
          ++totalSegmentCount;
        }
      }
      for (let userdatacount = 0; userdatacount < json.getEventCount(); ++userdatacount) {
        this._motionData.events.at(userdatacount).fireTime = json.getEventTime(userdatacount);
        this._motionData.events.at(userdatacount).value = json.getEventValue(userdatacount);
      }
      json.release();
      json = void 0;
      json = null;
    }
    /**
     * モデルのパラメータ更新
     *
     * イベント発火のチェック。
     * 入力する時間は呼ばれるモーションタイミングを０とした秒数で行う。
     *
     * @param beforeCheckTimeSeconds   前回のイベントチェック時間[秒]
     * @param motionTimeSeconds        今回の再生時間[秒]
     */
    getFiredEvent(beforeCheckTimeSeconds, motionTimeSeconds) {
      this._firedEventValues.updateSize(0);
      for (let u = 0; u < this._motionData.eventCount; ++u) {
        if (this._motionData.events.at(u).fireTime > beforeCheckTimeSeconds && this._motionData.events.at(u).fireTime <= motionTimeSeconds) {
          this._firedEventValues.pushBack(
            new csmString(this._motionData.events.at(u).value.s)
          );
        }
      }
      return this._firedEventValues;
    }
    /**
     * 透明度のカーブが存在するかどうかを確認する
     *
     * @returns true  -> キーが存在する
     *          false -> キーが存在しない
     */
    isExistModelOpacity() {
      for (let i = 0; i < this._motionData.curveCount; i++) {
        const curve = this._motionData.curves.at(i);
        if (curve.type != 0 /* CubismMotionCurveTarget_Model */) {
          continue;
        }
        if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
          return true;
        }
      }
      return false;
    }
    /**
     * 透明度のカーブのインデックスを返す
     *
     * @returns success:透明度のカーブのインデックス
     */
    getModelOpacityIndex() {
      if (this.isExistModelOpacity()) {
        for (let i = 0; i < this._motionData.curveCount; i++) {
          const curve = this._motionData.curves.at(i);
          if (curve.type != 0 /* CubismMotionCurveTarget_Model */) {
            continue;
          }
          if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
            return i;
          }
        }
      }
      return -1;
    }
    /**
     * 透明度のIdを返す
     *
     * @param index モーションカーブのインデックス
     * @returns success:透明度のカーブのインデックス
     */
    getModelOpacityId(index) {
      if (index != -1) {
        const curve = this._motionData.curves.at(index);
        if (curve.type == 0 /* CubismMotionCurveTarget_Model */) {
          if (curve.id.getString().s.localeCompare(IdNameOpacity) == 0) {
            return CubismFramework.getIdManager().getId(curve.id.getString().s);
          }
        }
      }
      return null;
    }
    /**
     * 現在時間の透明度の値を返す
     *
     * @returns success:モーションの当該時間におけるOpacityの値
     */
    getModelOpacityValue() {
      return this._modelOpacity;
    }
    // モーションから取得した不透明度
  };
  var Live2DCubismFramework26;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotion = CubismMotion;
  })(Live2DCubismFramework26 || (Live2DCubismFramework26 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/motion/cubismmotionmanager.ts
  var CubismMotionManager = class extends CubismMotionQueueManager {
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._currentPriority = 0;
      this._reservePriority = 0;
    }
    /**
     * 再生中のモーションの優先度の取得
     * @return  モーションの優先度
     */
    getCurrentPriority() {
      return this._currentPriority;
    }
    /**
     * 予約中のモーションの優先度を取得する。
     * @return  モーションの優先度
     */
    getReservePriority() {
      return this._reservePriority;
    }
    /**
     * 予約中のモーションの優先度を設定する。
     * @param   val     優先度
     */
    setReservePriority(val) {
      this._reservePriority = val;
    }
    /**
     * 優先度を設定してモーションを開始する。
     *
     * @param motion          モーション
     * @param autoDelete      再生が狩猟したモーションのインスタンスを削除するならtrue
     * @param priority        優先度
     * @return                開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するIsFinished()の引数で使用する。開始できない時は「-1」
     */
    startMotionPriority(motion, autoDelete, priority) {
      if (priority == this._reservePriority) {
        this._reservePriority = 0;
      }
      this._currentPriority = priority;
      return super.startMotion(motion, autoDelete);
    }
    /**
     * モーションを更新して、モデルにパラメータ値を反映する。
     *
     * @param model   対象のモデル
     * @param deltaTimeSeconds    デルタ時間[秒]
     * @return  true    更新されている
     * @return  false   更新されていない
     */
    updateMotion(model, deltaTimeSeconds) {
      this._userTimeSeconds += deltaTimeSeconds;
      const updated = super.doUpdateMotion(model, this._userTimeSeconds);
      if (this.isFinished()) {
        this._currentPriority = 0;
      }
      return updated;
    }
    /**
     * モーションを予約する。
     *
     * @param   priority    優先度
     * @return  true    予約できた
     * @return  false   予約できなかった
     */
    reserveMotion(priority) {
      if (priority <= this._reservePriority || priority <= this._currentPriority) {
        return false;
      }
      this._reservePriority = priority;
      return true;
    }
    // 再生予定のモーションの優先度。再生中は0になる。モーションファイルを別スレッドで読み込むときの機能。
  };
  var Live2DCubismFramework27;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMotionManager = CubismMotionManager;
  })(Live2DCubismFramework27 || (Live2DCubismFramework27 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/physics/cubismphysicsinternal.ts
  var CubismPhysicsTargetType = /* @__PURE__ */ ((CubismPhysicsTargetType2) => {
    CubismPhysicsTargetType2[CubismPhysicsTargetType2["CubismPhysicsTargetType_Parameter"] = 0] = "CubismPhysicsTargetType_Parameter";
    return CubismPhysicsTargetType2;
  })(CubismPhysicsTargetType || {});
  var CubismPhysicsSource = /* @__PURE__ */ ((CubismPhysicsSource2) => {
    CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_X"] = 0] = "CubismPhysicsSource_X";
    CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Y"] = 1] = "CubismPhysicsSource_Y";
    CubismPhysicsSource2[CubismPhysicsSource2["CubismPhysicsSource_Angle"] = 2] = "CubismPhysicsSource_Angle";
    return CubismPhysicsSource2;
  })(CubismPhysicsSource || {});
  var PhysicsJsonEffectiveForces = class {
    constructor() {
      this.gravity = new CubismVector2(0, 0);
      this.wind = new CubismVector2(0, 0);
    }
    // 風
  };
  var CubismPhysicsParameter = class {
    // 適用先の種類
  };
  var CubismPhysicsNormalization = class {
    // デフォルト値
  };
  var CubismPhysicsParticle = class {
    constructor() {
      this.initialPosition = new CubismVector2(0, 0);
      this.position = new CubismVector2(0, 0);
      this.lastPosition = new CubismVector2(0, 0);
      this.lastGravity = new CubismVector2(0, 0);
      this.force = new CubismVector2(0, 0);
      this.velocity = new CubismVector2(0, 0);
    }
    // 現在の速度
  };
  var CubismPhysicsSubRig = class {
    constructor() {
      this.normalizationPosition = new CubismPhysicsNormalization();
      this.normalizationAngle = new CubismPhysicsNormalization();
    }
    // 正規化された角度
  };
  var CubismPhysicsInput = class {
    constructor() {
      this.source = new CubismPhysicsParameter();
    }
    // 正規化されたパラメータ値の取得関数
  };
  var CubismPhysicsOutput = class {
    constructor() {
      this.destination = new CubismPhysicsParameter();
      this.translationScale = new CubismVector2(0, 0);
    }
    // 物理演算のスケール値の取得関数
  };
  var CubismPhysicsRig = class {
    constructor() {
      this.settings = new csmVector();
      this.inputs = new csmVector();
      this.outputs = new csmVector();
      this.particles = new csmVector();
      this.gravity = new CubismVector2(0, 0);
      this.wind = new CubismVector2(0, 0);
      this.fps = 0;
    }
    //物理演算動作FPS
  };
  var Live2DCubismFramework28;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismPhysicsInput = CubismPhysicsInput;
    Live2DCubismFramework40.CubismPhysicsNormalization = CubismPhysicsNormalization;
    Live2DCubismFramework40.CubismPhysicsOutput = CubismPhysicsOutput;
    Live2DCubismFramework40.CubismPhysicsParameter = CubismPhysicsParameter;
    Live2DCubismFramework40.CubismPhysicsParticle = CubismPhysicsParticle;
    Live2DCubismFramework40.CubismPhysicsRig = CubismPhysicsRig;
    Live2DCubismFramework40.CubismPhysicsSource = CubismPhysicsSource;
    Live2DCubismFramework40.CubismPhysicsSubRig = CubismPhysicsSubRig;
    Live2DCubismFramework40.CubismPhysicsTargetType = CubismPhysicsTargetType;
    Live2DCubismFramework40.PhysicsJsonEffectiveForces = PhysicsJsonEffectiveForces;
  })(Live2DCubismFramework28 || (Live2DCubismFramework28 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/physics/cubismphysicsjson.ts
  var Position = "Position";
  var X = "X";
  var Y = "Y";
  var Angle = "Angle";
  var Type = "Type";
  var Id3 = "Id";
  var Meta2 = "Meta";
  var EffectiveForces = "EffectiveForces";
  var TotalInputCount = "TotalInputCount";
  var TotalOutputCount = "TotalOutputCount";
  var PhysicsSettingCount = "PhysicsSettingCount";
  var Gravity = "Gravity";
  var Wind = "Wind";
  var VertexCount = "VertexCount";
  var Fps2 = "Fps";
  var PhysicsSettings = "PhysicsSettings";
  var Normalization = "Normalization";
  var Minimum = "Minimum";
  var Maximum = "Maximum";
  var Default = "Default";
  var Reflect2 = "Reflect";
  var Weight = "Weight";
  var Input = "Input";
  var Source = "Source";
  var Output = "Output";
  var Scale = "Scale";
  var VertexIndex = "VertexIndex";
  var Destination = "Destination";
  var Vertices = "Vertices";
  var Mobility = "Mobility";
  var Delay = "Delay";
  var Radius = "Radius";
  var Acceleration = "Acceleration";
  var CubismPhysicsJson = class {
    /**
     * コンストラクタ
     * @param buffer physics3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     */
    constructor(buffer, size) {
      this._json = CubismJson.create(buffer, size);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      CubismJson.delete(this._json);
    }
    /**
     * 重力の取得
     * @return 重力
     */
    getGravity() {
      const ret = new CubismVector2(0, 0);
      ret.x = this._json.getRoot().getValueByString(Meta2).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(X).toFloat();
      ret.y = this._json.getRoot().getValueByString(Meta2).getValueByString(EffectiveForces).getValueByString(Gravity).getValueByString(Y).toFloat();
      return ret;
    }
    /**
     * 風の取得
     * @return 風
     */
    getWind() {
      const ret = new CubismVector2(0, 0);
      ret.x = this._json.getRoot().getValueByString(Meta2).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(X).toFloat();
      ret.y = this._json.getRoot().getValueByString(Meta2).getValueByString(EffectiveForces).getValueByString(Wind).getValueByString(Y).toFloat();
      return ret;
    }
    /**
     * 物理演算設定FPSの取得
     * @return 物理演算設定FPS
     */
    getFps() {
      return this._json.getRoot().getValueByString(Meta2).getValueByString(Fps2).toFloat(0);
    }
    /**
     * 物理店の管理の個数の取得
     * @return 物理店の管理の個数
     */
    getSubRigCount() {
      return this._json.getRoot().getValueByString(Meta2).getValueByString(PhysicsSettingCount).toInt();
    }
    /**
     * 入力の総合計の取得
     * @return 入力の総合計
     */
    getTotalInputCount() {
      return this._json.getRoot().getValueByString(Meta2).getValueByString(TotalInputCount).toInt();
    }
    /**
     * 出力の総合計の取得
     * @return 出力の総合計
     */
    getTotalOutputCount() {
      return this._json.getRoot().getValueByString(Meta2).getValueByString(TotalOutputCount).toInt();
    }
    /**
     * 物理点の個数の取得
     * @return 物理点の個数
     */
    getVertexCount() {
      return this._json.getRoot().getValueByString(Meta2).getValueByString(VertexCount).toInt();
    }
    /**
     * 正規化された位置の最小値の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 正規化された位置の最小値
     */
    getNormalizationPositionMinimumValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Minimum).toFloat();
    }
    /**
     * 正規化された位置の最大値の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 正規化された位置の最大値
     */
    getNormalizationPositionMaximumValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Maximum).toFloat();
    }
    /**
     * 正規化された位置のデフォルト値の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 正規化された位置のデフォルト値
     */
    getNormalizationPositionDefaultValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Position).getValueByString(Default).toFloat();
    }
    /**
     * 正規化された角度の最小値の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 正規化された角度の最小値
     */
    getNormalizationAngleMinimumValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Minimum).toFloat();
    }
    /**
     * 正規化された角度の最大値の取得
     * @param physicsSettingIndex
     * @return 正規化された角度の最大値
     */
    getNormalizationAngleMaximumValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Maximum).toFloat();
    }
    /**
     * 正規化された角度のデフォルト値の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 正規化された角度のデフォルト値
     */
    getNormalizationAngleDefaultValue(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Normalization).getValueByString(Angle).getValueByString(Default).toFloat();
    }
    /**
     * 入力の個数の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 入力の個数
     */
    getInputCount(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getVector().getSize();
    }
    /**
     * 入力の重みの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param inputIndex 入力のインデックス
     * @return 入力の重み
     */
    getInputWeight(physicsSettingIndex, inputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Weight).toFloat();
    }
    /**
     * 入力の反転の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param inputIndex 入力のインデックス
     * @return 入力の反転
     */
    getInputReflect(physicsSettingIndex, inputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Reflect2).toBoolean();
    }
    /**
     * 入力の種類の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param inputIndex 入力のインデックス
     * @return 入力の種類
     */
    getInputType(physicsSettingIndex, inputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Type).getRawString();
    }
    /**
     * 入力元のIDの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param inputIndex 入力のインデックス
     * @return 入力元のID
     */
    getInputSourceId(physicsSettingIndex, inputIndex) {
      return CubismFramework.getIdManager().getId(
        this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Input).getValueByIndex(inputIndex).getValueByString(Source).getValueByString(Id3).getRawString()
      );
    }
    /**
     * 出力の個数の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @return 出力の個数
     */
    getOutputCount(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getVector().getSize();
    }
    /**
     * 出力の物理点のインデックスの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力の物理点のインデックス
     */
    getOutputVertexIndex(physicsSettingIndex, outputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(VertexIndex).toInt();
    }
    /**
     * 出力の角度のスケールを取得する
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力の角度のスケール
     */
    getOutputAngleScale(physicsSettingIndex, outputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Scale).toFloat();
    }
    /**
     * 出力の重みの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力の重み
     */
    getOutputWeight(physicsSettingIndex, outputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Weight).toFloat();
    }
    /**
     * 出力先のIDの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力先のID
     */
    getOutputDestinationId(physicsSettingIndex, outputIndex) {
      return CubismFramework.getIdManager().getId(
        this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Destination).getValueByString(Id3).getRawString()
      );
    }
    /**
     * 出力の種類の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力の種類
     */
    getOutputType(physicsSettingIndex, outputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Type).getRawString();
    }
    /**
     * 出力の反転の取得
     * @param physicsSettingIndex 物理演算のインデックス
     * @param outputIndex 出力のインデックス
     * @return 出力の反転
     */
    getOutputReflect(physicsSettingIndex, outputIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Output).getValueByIndex(outputIndex).getValueByString(Reflect2).toBoolean();
    }
    /**
     * 物理点の個数の取得
     * @param physicsSettingIndex 物理演算男設定のインデックス
     * @return 物理点の個数
     */
    getParticleCount(physicsSettingIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getVector().getSize();
    }
    /**
     * 物理点の動きやすさの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param vertexIndex 物理点のインデックス
     * @return 物理点の動きやすさ
     */
    getParticleMobility(physicsSettingIndex, vertexIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Mobility).toFloat();
    }
    /**
     * 物理点の遅れの取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param vertexIndex 物理点のインデックス
     * @return 物理点の遅れ
     */
    getParticleDelay(physicsSettingIndex, vertexIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Delay).toFloat();
    }
    /**
     * 物理点の加速度の取得
     * @param physicsSettingIndex 物理演算の設定
     * @param vertexIndex 物理点のインデックス
     * @return 物理点の加速度
     */
    getParticleAcceleration(physicsSettingIndex, vertexIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Acceleration).toFloat();
    }
    /**
     * 物理点の距離の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param vertexIndex 物理点のインデックス
     * @return 物理点の距離
     */
    getParticleRadius(physicsSettingIndex, vertexIndex) {
      return this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Radius).toFloat();
    }
    /**
     * 物理点の位置の取得
     * @param physicsSettingIndex 物理演算の設定のインデックス
     * @param vertexInde 物理点のインデックス
     * @return 物理点の位置
     */
    getParticlePosition(physicsSettingIndex, vertexIndex) {
      const ret = new CubismVector2(0, 0);
      ret.x = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(X).toFloat();
      ret.y = this._json.getRoot().getValueByString(PhysicsSettings).getValueByIndex(physicsSettingIndex).getValueByString(Vertices).getValueByIndex(vertexIndex).getValueByString(Position).getValueByString(Y).toFloat();
      return ret;
    }
    // physics3.jsonデータ
  };
  var Live2DCubismFramework29;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismPhysicsJson = CubismPhysicsJson;
  })(Live2DCubismFramework29 || (Live2DCubismFramework29 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/physics/cubismphysics.ts
  var PhysicsTypeTagX = "X";
  var PhysicsTypeTagY = "Y";
  var PhysicsTypeTagAngle = "Angle";
  var AirResistance = 5;
  var MaximumWeight = 100;
  var MovementThreshold = 1e-3;
  var MaxDeltaTime = 5;
  var CubismPhysics = class _CubismPhysics {
    /**
     * インスタンスの作成
     * @param buffer    physics3.jsonが読み込まれているバッファ
     * @param size      バッファのサイズ
     * @return 作成されたインスタンス
     */
    static create(buffer, size) {
      const ret = new _CubismPhysics();
      ret.parse(buffer, size);
      ret._physicsRig.gravity.y = 0;
      return ret;
    }
    /**
     * インスタンスを破棄する
     * @param physics 破棄するインスタンス
     */
    static delete(physics) {
      if (physics != null) {
        physics.release();
        physics = null;
      }
    }
    /**
     * physics3.jsonをパースする。
     * @param physicsJson physics3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     */
    parse(physicsJson, size) {
      this._physicsRig = new CubismPhysicsRig();
      let json = new CubismPhysicsJson(physicsJson, size);
      this._physicsRig.gravity = json.getGravity();
      this._physicsRig.wind = json.getWind();
      this._physicsRig.subRigCount = json.getSubRigCount();
      this._physicsRig.fps = json.getFps();
      this._physicsRig.settings.updateSize(
        this._physicsRig.subRigCount,
        CubismPhysicsSubRig,
        true
      );
      this._physicsRig.inputs.updateSize(
        json.getTotalInputCount(),
        CubismPhysicsInput,
        true
      );
      this._physicsRig.outputs.updateSize(
        json.getTotalOutputCount(),
        CubismPhysicsOutput,
        true
      );
      this._physicsRig.particles.updateSize(
        json.getVertexCount(),
        CubismPhysicsParticle,
        true
      );
      this._currentRigOutputs.clear();
      this._previousRigOutputs.clear();
      let inputIndex = 0, outputIndex = 0, particleIndex = 0;
      for (let i = 0; i < this._physicsRig.settings.getSize(); ++i) {
        this._physicsRig.settings.at(i).normalizationPosition.minimum = json.getNormalizationPositionMinimumValue(i);
        this._physicsRig.settings.at(i).normalizationPosition.maximum = json.getNormalizationPositionMaximumValue(i);
        this._physicsRig.settings.at(i).normalizationPosition.defalut = json.getNormalizationPositionDefaultValue(i);
        this._physicsRig.settings.at(i).normalizationAngle.minimum = json.getNormalizationAngleMinimumValue(i);
        this._physicsRig.settings.at(i).normalizationAngle.maximum = json.getNormalizationAngleMaximumValue(i);
        this._physicsRig.settings.at(i).normalizationAngle.defalut = json.getNormalizationAngleDefaultValue(i);
        this._physicsRig.settings.at(i).inputCount = json.getInputCount(i);
        this._physicsRig.settings.at(i).baseInputIndex = inputIndex;
        for (let j = 0; j < this._physicsRig.settings.at(i).inputCount; ++j) {
          this._physicsRig.inputs.at(inputIndex + j).sourceParameterIndex = -1;
          this._physicsRig.inputs.at(inputIndex + j).weight = json.getInputWeight(
            i,
            j
          );
          this._physicsRig.inputs.at(inputIndex + j).reflect = json.getInputReflect(i, j);
          if (json.getInputType(i, j) == PhysicsTypeTagX) {
            this._physicsRig.inputs.at(inputIndex + j).type = 0 /* CubismPhysicsSource_X */;
            this._physicsRig.inputs.at(
              inputIndex + j
            ).getNormalizedParameterValue = getInputTranslationXFromNormalizedParameterValue;
          } else if (json.getInputType(i, j) == PhysicsTypeTagY) {
            this._physicsRig.inputs.at(inputIndex + j).type = 1 /* CubismPhysicsSource_Y */;
            this._physicsRig.inputs.at(
              inputIndex + j
            ).getNormalizedParameterValue = getInputTranslationYFromNormalizedParamterValue;
          } else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
            this._physicsRig.inputs.at(inputIndex + j).type = 2 /* CubismPhysicsSource_Angle */;
            this._physicsRig.inputs.at(
              inputIndex + j
            ).getNormalizedParameterValue = getInputAngleFromNormalizedParameterValue;
          }
          this._physicsRig.inputs.at(inputIndex + j).source.targetType = 0 /* CubismPhysicsTargetType_Parameter */;
          this._physicsRig.inputs.at(inputIndex + j).source.id = json.getInputSourceId(i, j);
        }
        inputIndex += this._physicsRig.settings.at(i).inputCount;
        this._physicsRig.settings.at(i).outputCount = json.getOutputCount(i);
        this._physicsRig.settings.at(i).baseOutputIndex = outputIndex;
        const currentRigOutput = new PhysicsOutput();
        currentRigOutput.outputs.resize(
          this._physicsRig.settings.at(i).outputCount
        );
        const previousRigOutput = new PhysicsOutput();
        previousRigOutput.outputs.resize(
          this._physicsRig.settings.at(i).outputCount
        );
        for (let j = 0; j < this._physicsRig.settings.at(i).outputCount; ++j) {
          currentRigOutput.outputs.set(j, 0);
          previousRigOutput.outputs.set(j, 0);
          this._physicsRig.outputs.at(outputIndex + j).destinationParameterIndex = -1;
          this._physicsRig.outputs.at(outputIndex + j).vertexIndex = json.getOutputVertexIndex(i, j);
          this._physicsRig.outputs.at(outputIndex + j).angleScale = json.getOutputAngleScale(i, j);
          this._physicsRig.outputs.at(outputIndex + j).weight = json.getOutputWeight(i, j);
          this._physicsRig.outputs.at(outputIndex + j).destination.targetType = 0 /* CubismPhysicsTargetType_Parameter */;
          this._physicsRig.outputs.at(outputIndex + j).destination.id = json.getOutputDestinationId(i, j);
          if (json.getOutputType(i, j) == PhysicsTypeTagX) {
            this._physicsRig.outputs.at(outputIndex + j).type = 0 /* CubismPhysicsSource_X */;
            this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputTranslationX;
            this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleTranslationX;
          } else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
            this._physicsRig.outputs.at(outputIndex + j).type = 1 /* CubismPhysicsSource_Y */;
            this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputTranslationY;
            this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleTranslationY;
          } else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
            this._physicsRig.outputs.at(outputIndex + j).type = 2 /* CubismPhysicsSource_Angle */;
            this._physicsRig.outputs.at(outputIndex + j).getValue = getOutputAngle;
            this._physicsRig.outputs.at(outputIndex + j).getScale = getOutputScaleAngle;
          }
          this._physicsRig.outputs.at(outputIndex + j).reflect = json.getOutputReflect(i, j);
        }
        this._currentRigOutputs.pushBack(currentRigOutput);
        this._previousRigOutputs.pushBack(previousRigOutput);
        outputIndex += this._physicsRig.settings.at(i).outputCount;
        this._physicsRig.settings.at(i).particleCount = json.getParticleCount(i);
        this._physicsRig.settings.at(i).baseParticleIndex = particleIndex;
        for (let j = 0; j < this._physicsRig.settings.at(i).particleCount; ++j) {
          this._physicsRig.particles.at(particleIndex + j).mobility = json.getParticleMobility(i, j);
          this._physicsRig.particles.at(particleIndex + j).delay = json.getParticleDelay(i, j);
          this._physicsRig.particles.at(particleIndex + j).acceleration = json.getParticleAcceleration(i, j);
          this._physicsRig.particles.at(particleIndex + j).radius = json.getParticleRadius(i, j);
          this._physicsRig.particles.at(particleIndex + j).position = json.getParticlePosition(i, j);
        }
        particleIndex += this._physicsRig.settings.at(i).particleCount;
      }
      this.initialize();
      json.release();
      json = void 0;
      json = null;
    }
    /**
     * 現在のパラメータ値で物理演算が安定化する状態を演算する。
     * @param model 物理演算の結果を適用するモデル
     */
    stabilization(model) {
      let totalAngle;
      let weight;
      let radAngle;
      let outputValue;
      const totalTranslation = new CubismVector2();
      let currentSetting;
      let currentInputs;
      let currentOutputs;
      let currentParticles;
      const parameterValues = model.getModel().parameters.values;
      const parameterMaximumValues = model.getModel().parameters.maximumValues;
      const parameterMinimumValues = model.getModel().parameters.minimumValues;
      const parameterDefaultValues = model.getModel().parameters.defaultValues;
      if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
        this._parameterCaches = new Float32Array(model.getParameterCount());
      }
      if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
        this._parameterInputCaches = new Float32Array(model.getParameterCount());
      }
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterCaches[j] = parameterValues[j];
        this._parameterInputCaches[j] = parameterValues[j];
      }
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        totalAngle = { angle: 0 };
        totalTranslation.x = 0;
        totalTranslation.y = 0;
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentInputs = this._physicsRig.inputs.get(
          currentSetting.baseInputIndex
        );
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        currentParticles = this._physicsRig.particles.get(
          currentSetting.baseParticleIndex
        );
        for (let i = 0; i < currentSetting.inputCount; ++i) {
          weight = currentInputs[i].weight / MaximumWeight;
          if (currentInputs[i].sourceParameterIndex == -1) {
            currentInputs[i].sourceParameterIndex = model.getParameterIndex(
              currentInputs[i].source.id
            );
          }
          currentInputs[i].getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            parameterValues[currentInputs[i].sourceParameterIndex],
            parameterMinimumValues[currentInputs[i].sourceParameterIndex],
            parameterMaximumValues[currentInputs[i].sourceParameterIndex],
            parameterDefaultValues[currentInputs[i].sourceParameterIndex],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            currentInputs[i].reflect,
            weight
          );
          this._parameterCaches[currentInputs[i].sourceParameterIndex] = parameterValues[currentInputs[i].sourceParameterIndex];
        }
        radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
        totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
        totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
        updateParticlesForStabilization(
          currentParticles,
          currentSetting.particleCount,
          totalTranslation,
          totalAngle.angle,
          this._options.wind,
          MovementThreshold * currentSetting.normalizationPosition.maximum
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          const particleIndex = currentOutputs[i].vertexIndex;
          if (currentOutputs[i].destinationParameterIndex == -1) {
            currentOutputs[i].destinationParameterIndex = model.getParameterIndex(
              currentOutputs[i].destination.id
            );
          }
          if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
            continue;
          }
          let translation = new CubismVector2();
          translation = currentParticles[particleIndex].position.substract(
            currentParticles[particleIndex - 1].position
          );
          outputValue = currentOutputs[i].getValue(
            translation,
            currentParticles,
            particleIndex,
            currentOutputs[i].reflect,
            this._options.gravity
          );
          this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);
          this._previousRigOutputs.at(settingIndex).outputs.set(i, outputValue);
          const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
          const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
            JSON.stringify(
              parameterValues.subarray(destinationParameterIndex)
            )
          ) : parameterValues.slice(destinationParameterIndex);
          updateOutputParameterValue(
            outParameterCaches,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            outputValue,
            currentOutputs[i]
          );
          for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
            parameterValues[offset] = this._parameterCaches[offset] = outParameterCaches[outParamIndex];
          }
        }
      }
    }
    /**
     * 物理演算の評価
     *
     * Pendulum interpolation weights
     *
     * 振り子の計算結果は保存され、パラメータへの出力は保存された前回の結果で補間されます。
     * The result of the pendulum calculation is saved and
     * the output to the parameters is interpolated with the saved previous result of the pendulum calculation.
     *
     * 図で示すと[1]と[2]で補間されます。
     * The figure shows the interpolation between [1] and [2].
     *
     * 補間の重みは最新の振り子計算タイミングと次回のタイミングの間で見た現在時間で決定する。
     * The weight of the interpolation are determined by the current time seen between
     * the latest pendulum calculation timing and the next timing.
     *
     * 図で示すと[2]と[4]の間でみた(3)の位置の重みになる。
     * Figure shows the weight of position (3) as seen between [2] and [4].
     *
     * 解釈として振り子計算のタイミングと重み計算のタイミングがズレる。
     * As an interpretation, the pendulum calculation and weights are misaligned.
     *
     * physics3.jsonにFPS情報が存在しない場合は常に前の振り子状態で設定される。
     * If there is no FPS information in physics3.json, it is always set in the previous pendulum state.
     *
     * この仕様は補間範囲を逸脱したことが原因の震えたような見た目を回避を目的にしている。
     * The purpose of this specification is to avoid the quivering appearance caused by deviations from the interpolation range.
     *
     * ------------ time -------------->
     *
     *                 |+++++|------| <- weight
     * ==[1]====#=====[2]---(3)----(4)
     *          ^ output contents
     *
     * 1:_previousRigOutputs
     * 2:_currentRigOutputs
     * 3:_currentRemainTime (now rendering)
     * 4:next particles timing
     * @param model 物理演算の結果を適用するモデル
     * @param deltaTimeSeconds デルタ時間[秒]
     */
    evaluate(model, deltaTimeSeconds) {
      let totalAngle;
      let weight;
      let radAngle;
      let outputValue;
      const totalTranslation = new CubismVector2();
      let currentSetting;
      let currentInputs;
      let currentOutputs;
      let currentParticles;
      if (0 >= deltaTimeSeconds) {
        return;
      }
      const parameterValues = model.getModel().parameters.values;
      const parameterMaximumValues = model.getModel().parameters.maximumValues;
      const parameterMinimumValues = model.getModel().parameters.minimumValues;
      const parameterDefaultValues = model.getModel().parameters.defaultValues;
      let physicsDeltaTime;
      this._currentRemainTime += deltaTimeSeconds;
      if (this._currentRemainTime > MaxDeltaTime) {
        this._currentRemainTime = 0;
      }
      if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
        this._parameterCaches = new Float32Array(model.getParameterCount());
      }
      if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
        this._parameterInputCaches = new Float32Array(model.getParameterCount());
        for (let j = 0; j < model.getParameterCount(); ++j) {
          this._parameterInputCaches[j] = parameterValues[j];
        }
      }
      if (this._physicsRig.fps > 0) {
        physicsDeltaTime = 1 / this._physicsRig.fps;
      } else {
        physicsDeltaTime = deltaTimeSeconds;
      }
      while (this._currentRemainTime >= physicsDeltaTime) {
        for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
          currentSetting = this._physicsRig.settings.at(settingIndex);
          currentOutputs = this._physicsRig.outputs.get(
            currentSetting.baseOutputIndex
          );
          for (let i = 0; i < currentSetting.outputCount; ++i) {
            this._previousRigOutputs.at(settingIndex).outputs.set(
              i,
              this._currentRigOutputs.at(settingIndex).outputs.at(i)
            );
          }
        }
        const inputWeight = physicsDeltaTime / this._currentRemainTime;
        for (let j = 0; j < model.getParameterCount(); ++j) {
          this._parameterCaches[j] = this._parameterInputCaches[j] * (1 - inputWeight) + parameterValues[j] * inputWeight;
          this._parameterInputCaches[j] = this._parameterCaches[j];
        }
        for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
          totalAngle = { angle: 0 };
          totalTranslation.x = 0;
          totalTranslation.y = 0;
          currentSetting = this._physicsRig.settings.at(settingIndex);
          currentInputs = this._physicsRig.inputs.get(
            currentSetting.baseInputIndex
          );
          currentOutputs = this._physicsRig.outputs.get(
            currentSetting.baseOutputIndex
          );
          currentParticles = this._physicsRig.particles.get(
            currentSetting.baseParticleIndex
          );
          for (let i = 0; i < currentSetting.inputCount; ++i) {
            weight = currentInputs[i].weight / MaximumWeight;
            if (currentInputs[i].sourceParameterIndex == -1) {
              currentInputs[i].sourceParameterIndex = model.getParameterIndex(
                currentInputs[i].source.id
              );
            }
            currentInputs[i].getNormalizedParameterValue(
              totalTranslation,
              totalAngle,
              this._parameterCaches[currentInputs[i].sourceParameterIndex],
              parameterMinimumValues[currentInputs[i].sourceParameterIndex],
              parameterMaximumValues[currentInputs[i].sourceParameterIndex],
              parameterDefaultValues[currentInputs[i].sourceParameterIndex],
              currentSetting.normalizationPosition,
              currentSetting.normalizationAngle,
              currentInputs[i].reflect,
              weight
            );
          }
          radAngle = CubismMath.degreesToRadian(-totalAngle.angle);
          totalTranslation.x = totalTranslation.x * CubismMath.cos(radAngle) - totalTranslation.y * CubismMath.sin(radAngle);
          totalTranslation.y = totalTranslation.x * CubismMath.sin(radAngle) + totalTranslation.y * CubismMath.cos(radAngle);
          updateParticles(
            currentParticles,
            currentSetting.particleCount,
            totalTranslation,
            totalAngle.angle,
            this._options.wind,
            MovementThreshold * currentSetting.normalizationPosition.maximum,
            physicsDeltaTime,
            AirResistance
          );
          for (let i = 0; i < currentSetting.outputCount; ++i) {
            const particleIndex = currentOutputs[i].vertexIndex;
            if (currentOutputs[i].destinationParameterIndex == -1) {
              currentOutputs[i].destinationParameterIndex = model.getParameterIndex(currentOutputs[i].destination.id);
            }
            if (particleIndex < 1 || particleIndex >= currentSetting.particleCount) {
              continue;
            }
            const translation = new CubismVector2();
            translation.x = currentParticles[particleIndex].position.x - currentParticles[particleIndex - 1].position.x;
            translation.y = currentParticles[particleIndex].position.y - currentParticles[particleIndex - 1].position.y;
            outputValue = currentOutputs[i].getValue(
              translation,
              currentParticles,
              particleIndex,
              currentOutputs[i].reflect,
              this._options.gravity
            );
            this._currentRigOutputs.at(settingIndex).outputs.set(i, outputValue);
            const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
            const outParameterCaches = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
              JSON.stringify(
                this._parameterCaches.subarray(destinationParameterIndex)
              )
            ) : this._parameterCaches.slice(destinationParameterIndex);
            updateOutputParameterValue(
              outParameterCaches,
              parameterMinimumValues[destinationParameterIndex],
              parameterMaximumValues[destinationParameterIndex],
              outputValue,
              currentOutputs[i]
            );
            for (let offset = destinationParameterIndex, outParamIndex = 0; offset < this._parameterCaches.length; offset++, outParamIndex++) {
              this._parameterCaches[offset] = outParameterCaches[outParamIndex];
            }
          }
        }
        this._currentRemainTime -= physicsDeltaTime;
      }
      const alpha = this._currentRemainTime / physicsDeltaTime;
      this.interpolate(model, alpha);
    }
    /**
     * 物理演算結果の適用
     * 振り子演算の最新の結果と一つ前の結果から指定した重みで適用する。
     * @param model 物理演算の結果を適用するモデル
     * @param weight 最新結果の重み
     */
    interpolate(model, weight) {
      let currentOutputs;
      let currentSetting;
      const parameterValues = model.getModel().parameters.values;
      const parameterMaximumValues = model.getModel().parameters.maximumValues;
      const parameterMinimumValues = model.getModel().parameters.minimumValues;
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        currentSetting = this._physicsRig.settings.at(settingIndex);
        currentOutputs = this._physicsRig.outputs.get(
          currentSetting.baseOutputIndex
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          if (currentOutputs[i].destinationParameterIndex == -1) {
            continue;
          }
          const destinationParameterIndex = currentOutputs[i].destinationParameterIndex;
          const outParameterValues = !Float32Array.prototype.slice && "subarray" in Float32Array.prototype ? JSON.parse(
            JSON.stringify(
              parameterValues.subarray(destinationParameterIndex)
            )
          ) : parameterValues.slice(destinationParameterIndex);
          updateOutputParameterValue(
            outParameterValues,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            this._previousRigOutputs.at(settingIndex).outputs.at(i) * (1 - weight) + this._currentRigOutputs.at(settingIndex).outputs.at(i) * weight,
            currentOutputs[i]
          );
          for (let offset = destinationParameterIndex, outParamIndex = 0; offset < parameterValues.length; offset++, outParamIndex++) {
            parameterValues[offset] = outParameterValues[outParamIndex];
          }
        }
      }
    }
    /**
     * オプションの設定
     * @param options オプション
     */
    setOptions(options) {
      this._options = options;
    }
    /**
     * オプションの取得
     * @return オプション
     */
    getOption() {
      return this._options;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._physicsRig = null;
      this._options = new Options();
      this._options.gravity.y = -1;
      this._options.gravity.x = 0;
      this._options.wind.x = 0;
      this._options.wind.y = 0;
      this._currentRigOutputs = new csmVector();
      this._previousRigOutputs = new csmVector();
      this._currentRemainTime = 0;
      this._parameterCaches = null;
      this._parameterInputCaches = null;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      this._physicsRig = void 0;
      this._physicsRig = null;
    }
    /**
     * 初期化する
     */
    initialize() {
      let strand;
      let currentSetting;
      let radius;
      for (let settingIndex = 0; settingIndex < this._physicsRig.subRigCount; ++settingIndex) {
        currentSetting = this._physicsRig.settings.at(settingIndex);
        strand = this._physicsRig.particles.get(currentSetting.baseParticleIndex);
        strand[0].initialPosition = new CubismVector2(0, 0);
        strand[0].lastPosition = new CubismVector2(
          strand[0].initialPosition.x,
          strand[0].initialPosition.y
        );
        strand[0].lastGravity = new CubismVector2(0, -1);
        strand[0].lastGravity.y *= -1;
        strand[0].velocity = new CubismVector2(0, 0);
        strand[0].force = new CubismVector2(0, 0);
        for (let i = 1; i < currentSetting.particleCount; ++i) {
          radius = new CubismVector2(0, 0);
          radius.y = strand[i].radius;
          strand[i].initialPosition = new CubismVector2(
            strand[i - 1].initialPosition.x + radius.x,
            strand[i - 1].initialPosition.y + radius.y
          );
          strand[i].position = new CubismVector2(
            strand[i].initialPosition.x,
            strand[i].initialPosition.y
          );
          strand[i].lastPosition = new CubismVector2(
            strand[i].initialPosition.x,
            strand[i].initialPosition.y
          );
          strand[i].lastGravity = new CubismVector2(0, -1);
          strand[i].lastGravity.y *= -1;
          strand[i].velocity = new CubismVector2(0, 0);
          strand[i].force = new CubismVector2(0, 0);
        }
      }
    }
    ///< UpdateParticlesが動くときの入力をキャッシュ
  };
  var Options = class {
    constructor() {
      this.gravity = new CubismVector2(0, 0);
      this.wind = new CubismVector2(0, 0);
    }
    // 風の方向
  };
  var PhysicsOutput = class {
    constructor() {
      this.outputs = new csmVector(0);
    }
    // 物理演算出力結果
  };
  function sign(value) {
    let ret = 0;
    if (value > 0) {
      ret = 1;
    } else if (value < 0) {
      ret = -1;
    }
    return ret;
  }
  function getInputTranslationXFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
    targetTranslation.x += normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
  }
  function getInputTranslationYFromNormalizedParamterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizationPosition, normalizationAngle, isInverted, weight) {
    targetTranslation.y += normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
  }
  function getInputAngleFromNormalizedParameterValue(targetTranslation, targetAngle, value, parameterMinimumValue, parameterMaximumValue, parameterDefaultValue, normalizaitionPosition, normalizationAngle, isInverted, weight) {
    targetAngle.angle += normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationAngle.minimum,
      normalizationAngle.maximum,
      normalizationAngle.defalut,
      isInverted
    ) * weight;
  }
  function getOutputTranslationX(translation, particles, particleIndex, isInverted, parentGravity) {
    let outputValue = translation.x;
    if (isInverted) {
      outputValue *= -1;
    }
    return outputValue;
  }
  function getOutputTranslationY(translation, particles, particleIndex, isInverted, parentGravity) {
    let outputValue = translation.y;
    if (isInverted) {
      outputValue *= -1;
    }
    return outputValue;
  }
  function getOutputAngle(translation, particles, particleIndex, isInverted, parentGravity) {
    let outputValue;
    if (particleIndex >= 2) {
      parentGravity = particles[particleIndex - 1].position.substract(
        particles[particleIndex - 2].position
      );
    } else {
      parentGravity = parentGravity.multiplyByScaler(-1);
    }
    outputValue = CubismMath.directionToRadian(parentGravity, translation);
    if (isInverted) {
      outputValue *= -1;
    }
    return outputValue;
  }
  function getRangeValue(min, max) {
    const maxValue = CubismMath.max(min, max);
    const minValue = CubismMath.min(min, max);
    return CubismMath.abs(maxValue - minValue);
  }
  function getDefaultValue(min, max) {
    const minValue = CubismMath.min(min, max);
    return minValue + getRangeValue(min, max) / 2;
  }
  function getOutputScaleTranslationX(translationScale, angleScale) {
    return JSON.parse(JSON.stringify(translationScale.x));
  }
  function getOutputScaleTranslationY(translationScale, angleScale) {
    return JSON.parse(JSON.stringify(translationScale.y));
  }
  function getOutputScaleAngle(translationScale, angleScale) {
    return JSON.parse(JSON.stringify(angleScale));
  }
  function updateParticles(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue, deltaTimeSeconds, airResistance) {
    let delay;
    let radian;
    let direction = new CubismVector2(0, 0);
    let velocity = new CubismVector2(0, 0);
    let force = new CubismVector2(0, 0);
    let newDirection = new CubismVector2(0, 0);
    strand[0].position = new CubismVector2(
      totalTranslation.x,
      totalTranslation.y
    );
    const totalRadian = CubismMath.degreesToRadian(totalAngle);
    const currentGravity = CubismMath.radianToDirection(totalRadian);
    currentGravity.normalize();
    for (let i = 1; i < strandCount; ++i) {
      strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
      strand[i].lastPosition = new CubismVector2(
        strand[i].position.x,
        strand[i].position.y
      );
      delay = strand[i].delay * deltaTimeSeconds * 30;
      direction = strand[i].position.substract(strand[i - 1].position);
      radian = CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) / airResistance;
      direction.x = CubismMath.cos(radian) * direction.x - direction.y * CubismMath.sin(radian);
      direction.y = CubismMath.sin(radian) * direction.x + direction.y * CubismMath.cos(radian);
      strand[i].position = strand[i - 1].position.add(direction);
      velocity = strand[i].velocity.multiplyByScaler(delay);
      force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);
      strand[i].position = strand[i].position.add(velocity).add(force);
      newDirection = strand[i].position.substract(strand[i - 1].position);
      newDirection.normalize();
      strand[i].position = strand[i - 1].position.add(
        newDirection.multiplyByScaler(strand[i].radius)
      );
      if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
        strand[i].position.x = 0;
      }
      if (delay != 0) {
        strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
        strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
        strand[i].velocity = strand[i].velocity.multiplyByScaler(
          strand[i].mobility
        );
      }
      strand[i].force = new CubismVector2(0, 0);
      strand[i].lastGravity = new CubismVector2(
        currentGravity.x,
        currentGravity.y
      );
    }
  }
  function updateParticlesForStabilization(strand, strandCount, totalTranslation, totalAngle, windDirection, thresholdValue) {
    let force = new CubismVector2(0, 0);
    strand[0].position = new CubismVector2(
      totalTranslation.x,
      totalTranslation.y
    );
    const totalRadian = CubismMath.degreesToRadian(totalAngle);
    const currentGravity = CubismMath.radianToDirection(totalRadian);
    currentGravity.normalize();
    for (let i = 1; i < strandCount; ++i) {
      strand[i].force = currentGravity.multiplyByScaler(strand[i].acceleration).add(windDirection);
      strand[i].lastPosition = new CubismVector2(
        strand[i].position.x,
        strand[i].position.y
      );
      strand[i].velocity = new CubismVector2(0, 0);
      force = strand[i].force;
      force.normalize();
      force = force.multiplyByScaler(strand[i].radius);
      strand[i].position = strand[i - 1].position.add(force);
      if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
        strand[i].position.x = 0;
      }
      strand[i].force = new CubismVector2(0, 0);
      strand[i].lastGravity = new CubismVector2(
        currentGravity.x,
        currentGravity.y
      );
    }
  }
  function updateOutputParameterValue(parameterValue, parameterValueMinimum, parameterValueMaximum, translation, output) {
    let value;
    const outputScale = output.getScale(
      output.translationScale,
      output.angleScale
    );
    value = translation * outputScale;
    if (value < parameterValueMinimum) {
      if (value < output.valueBelowMinimum) {
        output.valueBelowMinimum = value;
      }
      value = parameterValueMinimum;
    } else if (value > parameterValueMaximum) {
      if (value > output.valueExceededMaximum) {
        output.valueExceededMaximum = value;
      }
      value = parameterValueMaximum;
    }
    const weight = output.weight / MaximumWeight;
    if (weight >= 1) {
      parameterValue[0] = value;
    } else {
      value = parameterValue[0] * (1 - weight) + value * weight;
      parameterValue[0] = value;
    }
  }
  function normalizeParameterValue(value, parameterMinimum, parameterMaximum, parameterDefault, normalizedMinimum, normalizedMaximum, normalizedDefault, isInverted) {
    let result = 0;
    const maxValue = CubismMath.max(parameterMaximum, parameterMinimum);
    if (maxValue < value) {
      value = maxValue;
    }
    const minValue = CubismMath.min(parameterMaximum, parameterMinimum);
    if (minValue > value) {
      value = minValue;
    }
    const minNormValue = CubismMath.min(
      normalizedMinimum,
      normalizedMaximum
    );
    const maxNormValue = CubismMath.max(
      normalizedMinimum,
      normalizedMaximum
    );
    const middleNormValue = normalizedDefault;
    const middleValue = getDefaultValue(minValue, maxValue);
    const paramValue = value - middleValue;
    switch (sign(paramValue)) {
      case 1: {
        const nLength = maxNormValue - middleNormValue;
        const pLength = maxValue - middleValue;
        if (pLength != 0) {
          result = paramValue * (nLength / pLength);
          result += middleNormValue;
        }
        break;
      }
      case -1: {
        const nLength = minNormValue - middleNormValue;
        const pLength = minValue - middleValue;
        if (pLength != 0) {
          result = paramValue * (nLength / pLength);
          result += middleNormValue;
        }
        break;
      }
      case 0: {
        result = middleNormValue;
        break;
      }
      default: {
        break;
      }
    }
    return isInverted ? result : result * -1;
  }
  var Live2DCubismFramework30;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismPhysics = CubismPhysics;
    Live2DCubismFramework40.Options = Options;
  })(Live2DCubismFramework30 || (Live2DCubismFramework30 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/rendering/cubismclippingmanager.ts
  var ColorChannelCount = 4;
  var ClippingMaskMaxCountOnDefault = 36;
  var ClippingMaskMaxCountOnMultiRenderTexture = 32;
  var CubismClippingManager = class {
    /**
     * コンストラクタ
     */
    constructor(clippingContextFactory) {
      this._renderTextureCount = 0;
      this._clippingMaskBufferSize = 256;
      this._clippingContextListForMask = new csmVector();
      this._clippingContextListForDraw = new csmVector();
      this._channelColors = new csmVector();
      this._tmpBoundsOnModel = new csmRect();
      this._tmpMatrix = new CubismMatrix44();
      this._tmpMatrixForMask = new CubismMatrix44();
      this._tmpMatrixForDraw = new CubismMatrix44();
      this._clippingContexttConstructor = clippingContextFactory;
      let tmp = new CubismTextureColor();
      tmp.r = 1;
      tmp.g = 0;
      tmp.b = 0;
      tmp.a = 0;
      this._channelColors.pushBack(tmp);
      tmp = new CubismTextureColor();
      tmp.r = 0;
      tmp.g = 1;
      tmp.b = 0;
      tmp.a = 0;
      this._channelColors.pushBack(tmp);
      tmp = new CubismTextureColor();
      tmp.r = 0;
      tmp.g = 0;
      tmp.b = 1;
      tmp.a = 0;
      this._channelColors.pushBack(tmp);
      tmp = new CubismTextureColor();
      tmp.r = 0;
      tmp.g = 0;
      tmp.b = 0;
      tmp.a = 1;
      this._channelColors.pushBack(tmp);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      for (let i = 0; i < this._clippingContextListForMask.getSize(); i++) {
        if (this._clippingContextListForMask.at(i)) {
          this._clippingContextListForMask.at(i).release();
          this._clippingContextListForMask.set(i, void 0);
        }
        this._clippingContextListForMask.set(i, null);
      }
      this._clippingContextListForMask = null;
      for (let i = 0; i < this._clippingContextListForDraw.getSize(); i++) {
        this._clippingContextListForDraw.set(i, null);
      }
      this._clippingContextListForDraw = null;
      for (let i = 0; i < this._channelColors.getSize(); i++) {
        this._channelColors.set(i, null);
      }
      this._channelColors = null;
      if (this._clearedFrameBufferFlags != null) {
        this._clearedFrameBufferFlags.clear();
      }
      this._clearedFrameBufferFlags = null;
    }
    /**
     * マネージャの初期化処理
     * クリッピングマスクを使う描画オブジェクトの登録を行う
     * @param model モデルのインスタンス
     * @param renderTextureCount バッファの生成数
     */
    initialize(model, renderTextureCount) {
      if (renderTextureCount % 1 != 0) {
        CubismLogWarning(
          "The number of render textures must be specified as an integer. The decimal point is rounded down and corrected to an integer."
        );
        renderTextureCount = ~~renderTextureCount;
      }
      if (renderTextureCount < 1) {
        CubismLogWarning(
          "The number of render textures must be an integer greater than or equal to 1. Set the number of render textures to 1."
        );
      }
      this._renderTextureCount = renderTextureCount < 1 ? 1 : renderTextureCount;
      this._clearedFrameBufferFlags = new csmVector(
        this._renderTextureCount
      );
      for (let i = 0; i < model.getDrawableCount(); i++) {
        if (model.getDrawableMaskCounts()[i] <= 0) {
          this._clippingContextListForDraw.pushBack(null);
          continue;
        }
        let clippingContext = this.findSameClip(
          model.getDrawableMasks()[i],
          model.getDrawableMaskCounts()[i]
        );
        if (clippingContext == null) {
          clippingContext = new this._clippingContexttConstructor(
            this,
            model.getDrawableMasks()[i],
            model.getDrawableMaskCounts()[i]
          );
          this._clippingContextListForMask.pushBack(clippingContext);
        }
        clippingContext.addClippedDrawable(i);
        this._clippingContextListForDraw.pushBack(clippingContext);
      }
    }
    /**
     * 既にマスクを作っているかを確認
     * 作っている様であれば該当するクリッピングマスクのインスタンスを返す
     * 作っていなければNULLを返す
     * @param drawableMasks 描画オブジェクトをマスクする描画オブジェクトのリスト
     * @param drawableMaskCounts 描画オブジェクトをマスクする描画オブジェクトの数
     * @return 該当するクリッピングマスクが存在すればインスタンスを返し、なければNULLを返す
     */
    findSameClip(drawableMasks, drawableMaskCounts) {
      for (let i = 0; i < this._clippingContextListForMask.getSize(); i++) {
        const clippingContext = this._clippingContextListForMask.at(i);
        const count = clippingContext._clippingIdCount;
        if (count != drawableMaskCounts) {
          continue;
        }
        let sameCount = 0;
        for (let j = 0; j < count; j++) {
          const clipId = clippingContext._clippingIdList[j];
          for (let k = 0; k < count; k++) {
            if (drawableMasks[k] == clipId) {
              sameCount++;
              break;
            }
          }
        }
        if (sameCount == count) {
          return clippingContext;
        }
      }
      return null;
    }
    /**
     * 高精細マスク処理用の行列を計算する
     * @param model モデルのインスタンス
     * @param isRightHanded 処理が右手系であるか
     */
    setupMatrixForHighPrecision(model, isRightHanded) {
      let usingClipCount = 0;
      for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
        const cc = this._clippingContextListForMask.at(clipIndex);
        this.calcClippedDrawTotalBounds(model, cc);
        if (cc._isUsing) {
          usingClipCount++;
        }
      }
      if (usingClipCount > 0) {
        this.setupLayoutBounds(0);
        if (this._clearedFrameBufferFlags.getSize() != this._renderTextureCount) {
          this._clearedFrameBufferFlags.clear();
          for (let i = 0; i < this._renderTextureCount; i++) {
            this._clearedFrameBufferFlags.pushBack(false);
          }
        } else {
          for (let i = 0; i < this._renderTextureCount; i++) {
            this._clearedFrameBufferFlags.set(i, false);
          }
        }
        for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
          const clipContext = this._clippingContextListForMask.at(clipIndex);
          const allClippedDrawRect = clipContext._allClippedDrawRect;
          const layoutBoundsOnTex01 = clipContext._layoutBounds;
          const margin = 0.05;
          let scaleX = 0;
          let scaleY = 0;
          const ppu = model.getPixelsPerUnit();
          const maskPixelSize = clipContext.getClippingManager().getClippingMaskBufferSize();
          const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixelSize;
          const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixelSize;
          this._tmpBoundsOnModel.setRect(allClippedDrawRect);
          if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
            this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0);
            scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
          } else {
            scaleX = ppu / physicalMaskWidth;
          }
          if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
            this._tmpBoundsOnModel.expand(
              0,
              allClippedDrawRect.height * margin
            );
            scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
          } else {
            scaleY = ppu / physicalMaskHeight;
          }
          this.createMatrixForMask(
            isRightHanded,
            layoutBoundsOnTex01,
            scaleX,
            scaleY
          );
          clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
          clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
        }
      }
    }
    /**
     * マスク作成・描画用の行列を作成する。
     * @param isRightHanded 座標を右手系として扱うかを指定
     * @param layoutBoundsOnTex01 マスクを収める領域
     * @param scaleX 描画オブジェクトの伸縮率
     * @param scaleY 描画オブジェクトの伸縮率
     */
    createMatrixForMask(isRightHanded, layoutBoundsOnTex01, scaleX, scaleY) {
      this._tmpMatrix.loadIdentity();
      {
        this._tmpMatrix.translateRelative(-1, -1);
        this._tmpMatrix.scaleRelative(2, 2);
      }
      {
        this._tmpMatrix.translateRelative(
          layoutBoundsOnTex01.x,
          layoutBoundsOnTex01.y
        );
        this._tmpMatrix.scaleRelative(scaleX, scaleY);
        this._tmpMatrix.translateRelative(
          -this._tmpBoundsOnModel.x,
          -this._tmpBoundsOnModel.y
        );
      }
      this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
      this._tmpMatrix.loadIdentity();
      {
        this._tmpMatrix.translateRelative(
          layoutBoundsOnTex01.x,
          layoutBoundsOnTex01.y * (isRightHanded ? -1 : 1)
        );
        this._tmpMatrix.scaleRelative(
          scaleX,
          scaleY * (isRightHanded ? -1 : 1)
        );
        this._tmpMatrix.translateRelative(
          -this._tmpBoundsOnModel.x,
          -this._tmpBoundsOnModel.y
        );
      }
      this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
    }
    /**
     * クリッピングコンテキストを配置するレイアウト
     * 指定された数のレンダーテクスチャを極力いっぱいに使ってマスクをレイアウトする
     * マスクグループの数が4以下ならRGBA各チャンネルに一つずつマスクを配置し、5以上6以下ならRGBAを2,2,1,1と配置する。
     *
     * @param usingClipCount 配置するクリッピングコンテキストの数
     */
    setupLayoutBounds(usingClipCount) {
      const useClippingMaskMaxCount = this._renderTextureCount <= 1 ? ClippingMaskMaxCountOnDefault : ClippingMaskMaxCountOnMultiRenderTexture * this._renderTextureCount;
      if (usingClipCount <= 0 || usingClipCount > useClippingMaskMaxCount) {
        if (usingClipCount > useClippingMaskMaxCount) {
          CubismLogError(
            "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
            usingClipCount - useClippingMaskMaxCount,
            this._renderTextureCount,
            usingClipCount
          );
        }
        for (let index = 0; index < this._clippingContextListForMask.getSize(); index++) {
          const clipContext = this._clippingContextListForMask.at(index);
          clipContext._layoutChannelIndex = 0;
          clipContext._layoutBounds.x = 0;
          clipContext._layoutBounds.y = 0;
          clipContext._layoutBounds.width = 1;
          clipContext._layoutBounds.height = 1;
          clipContext._bufferIndex = 0;
        }
        return;
      }
      const layoutCountMaxValue = this._renderTextureCount <= 1 ? 9 : 8;
      let countPerSheetDiv = usingClipCount / this._renderTextureCount;
      const reduceLayoutTextureCount = usingClipCount % this._renderTextureCount;
      countPerSheetDiv = Math.ceil(countPerSheetDiv);
      let divCount = countPerSheetDiv / ColorChannelCount;
      const modCount = countPerSheetDiv % ColorChannelCount;
      divCount = ~~divCount;
      let curClipIndex = 0;
      for (let renderTextureIndex = 0; renderTextureIndex < this._renderTextureCount; renderTextureIndex++) {
        for (let channelIndex = 0; channelIndex < ColorChannelCount; channelIndex++) {
          let layoutCount = divCount + (channelIndex < modCount ? 1 : 0);
          const checkChannelIndex = modCount + (divCount < 1 ? -1 : 0);
          if (channelIndex == checkChannelIndex && reduceLayoutTextureCount > 0) {
            layoutCount -= !(renderTextureIndex < reduceLayoutTextureCount) ? 1 : 0;
          }
          if (layoutCount == 0) {
          } else if (layoutCount == 1) {
            const clipContext = this._clippingContextListForMask.at(curClipIndex++);
            clipContext._layoutChannelIndex = channelIndex;
            clipContext._layoutBounds.x = 0;
            clipContext._layoutBounds.y = 0;
            clipContext._layoutBounds.width = 1;
            clipContext._layoutBounds.height = 1;
            clipContext._bufferIndex = renderTextureIndex;
          } else if (layoutCount == 2) {
            for (let i = 0; i < layoutCount; i++) {
              let xpos = i % 2;
              xpos = ~~xpos;
              const cc = this._clippingContextListForMask.at(
                curClipIndex++
              );
              cc._layoutChannelIndex = channelIndex;
              cc._layoutBounds.x = xpos * 0.5;
              cc._layoutBounds.y = 0;
              cc._layoutBounds.width = 0.5;
              cc._layoutBounds.height = 1;
              cc._bufferIndex = renderTextureIndex;
            }
          } else if (layoutCount <= 4) {
            for (let i = 0; i < layoutCount; i++) {
              let xpos = i % 2;
              let ypos = i / 2;
              xpos = ~~xpos;
              ypos = ~~ypos;
              const cc = this._clippingContextListForMask.at(curClipIndex++);
              cc._layoutChannelIndex = channelIndex;
              cc._layoutBounds.x = xpos * 0.5;
              cc._layoutBounds.y = ypos * 0.5;
              cc._layoutBounds.width = 0.5;
              cc._layoutBounds.height = 0.5;
              cc._bufferIndex = renderTextureIndex;
            }
          } else if (layoutCount <= layoutCountMaxValue) {
            for (let i = 0; i < layoutCount; i++) {
              let xpos = i % 3;
              let ypos = i / 3;
              xpos = ~~xpos;
              ypos = ~~ypos;
              const cc = this._clippingContextListForMask.at(
                curClipIndex++
              );
              cc._layoutChannelIndex = channelIndex;
              cc._layoutBounds.x = xpos / 3;
              cc._layoutBounds.y = ypos / 3;
              cc._layoutBounds.width = 1 / 3;
              cc._layoutBounds.height = 1 / 3;
              cc._bufferIndex = renderTextureIndex;
            }
          } else {
            CubismLogError(
              "not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}",
              usingClipCount - useClippingMaskMaxCount,
              this._renderTextureCount,
              usingClipCount
            );
            for (let index = 0; index < layoutCount; index++) {
              const cc = this._clippingContextListForMask.at(
                curClipIndex++
              );
              cc._layoutChannelIndex = 0;
              cc._layoutBounds.x = 0;
              cc._layoutBounds.y = 0;
              cc._layoutBounds.width = 1;
              cc._layoutBounds.height = 1;
              cc._bufferIndex = 0;
            }
          }
        }
      }
    }
    /**
     * マスクされる描画オブジェクト群全体を囲む矩形（モデル座標系）を計算する
     * @param model モデルのインスタンス
     * @param clippingContext クリッピングマスクのコンテキスト
     */
    calcClippedDrawTotalBounds(model, clippingContext) {
      let clippedDrawTotalMinX = Number.MAX_VALUE;
      let clippedDrawTotalMinY = Number.MAX_VALUE;
      let clippedDrawTotalMaxX = Number.MIN_VALUE;
      let clippedDrawTotalMaxY = Number.MIN_VALUE;
      const clippedDrawCount = clippingContext._clippedDrawableIndexList.length;
      for (let clippedDrawableIndex = 0; clippedDrawableIndex < clippedDrawCount; clippedDrawableIndex++) {
        const drawableIndex = clippingContext._clippedDrawableIndexList[clippedDrawableIndex];
        const drawableVertexCount = model.getDrawableVertexCount(drawableIndex);
        const drawableVertexes = model.getDrawableVertices(drawableIndex);
        let minX = Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;
        let maxX = -Number.MAX_VALUE;
        let maxY = -Number.MAX_VALUE;
        const loop = drawableVertexCount * Constant.vertexStep;
        for (let pi = Constant.vertexOffset; pi < loop; pi += Constant.vertexStep) {
          const x = drawableVertexes[pi];
          const y = drawableVertexes[pi + 1];
          if (x < minX) {
            minX = x;
          }
          if (x > maxX) {
            maxX = x;
          }
          if (y < minY) {
            minY = y;
          }
          if (y > maxY) {
            maxY = y;
          }
        }
        if (minX == Number.MAX_VALUE) {
          continue;
        }
        if (minX < clippedDrawTotalMinX) {
          clippedDrawTotalMinX = minX;
        }
        if (minY < clippedDrawTotalMinY) {
          clippedDrawTotalMinY = minY;
        }
        if (maxX > clippedDrawTotalMaxX) {
          clippedDrawTotalMaxX = maxX;
        }
        if (maxY > clippedDrawTotalMaxY) {
          clippedDrawTotalMaxY = maxY;
        }
        if (clippedDrawTotalMinX == Number.MAX_VALUE) {
          clippingContext._allClippedDrawRect.x = 0;
          clippingContext._allClippedDrawRect.y = 0;
          clippingContext._allClippedDrawRect.width = 0;
          clippingContext._allClippedDrawRect.height = 0;
          clippingContext._isUsing = false;
        } else {
          clippingContext._isUsing = true;
          const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
          const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
          clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
          clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
          clippingContext._allClippedDrawRect.width = w;
          clippingContext._allClippedDrawRect.height = h;
        }
      }
    }
    /**
     * 画面描画に使用するクリッピングマスクのリストを取得する
     * @return 画面描画に使用するクリッピングマスクのリスト
     */
    getClippingContextListForDraw() {
      return this._clippingContextListForDraw;
    }
    /**
     * クリッピングマスクバッファのサイズを取得する
     * @return クリッピングマスクバッファのサイズ
     */
    getClippingMaskBufferSize() {
      return this._clippingMaskBufferSize;
    }
    /**
     * このバッファのレンダーテクスチャの枚数を取得する
     * @return このバッファのレンダーテクスチャの枚数
     */
    getRenderTextureCount() {
      return this._renderTextureCount;
    }
    /**
     * カラーチャンネル（RGBA）のフラグを取得する
     * @param channelNo カラーチャンネル（RGBA）の番号（0:R, 1:G, 2:B, 3:A）
     */
    getChannelFlagAsColor(channelNo) {
      return this._channelColors.at(channelNo);
    }
    /**
     * クリッピングマスクバッファのサイズを設定する
     * @param size クリッピングマスクバッファのサイズ
     */
    setClippingMaskBufferSize(size) {
      this._clippingMaskBufferSize = size;
    }
  };

  // desktop-pet/_sdk/samples2/Framework/src/rendering/cubismshader_webgl.ts
  var s_instance;
  var ShaderCount = 10;
  var CubismShader_WebGL = class _CubismShader_WebGL {
    /**
     * インスタンスを取得する（シングルトン）
     * @return インスタンス
     */
    static getInstance() {
      if (s_instance == null) {
        s_instance = new _CubismShader_WebGL();
        return s_instance;
      }
      return s_instance;
    }
    /**
     * インスタンスを開放する（シングルトン）
     */
    static deleteInstance() {
      if (s_instance) {
        s_instance.release();
        s_instance = null;
      }
    }
    /**
     * privateなコンストラクタ
     */
    constructor() {
      this._shaderSets = new csmVector();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      this.releaseShaderProgram();
    }
    /**
     * 描画用のシェーダプログラムの一連のセットアップを実行する
     * @param renderer レンダラー
     * @param model 描画対象のモデル
     * @param index 描画対象のメッシュのインデックス
     */
    setupShaderProgramForDraw(renderer, model, index) {
      if (!renderer.isPremultipliedAlpha()) {
        CubismLogError("NoPremultipliedAlpha is not allowed");
      }
      if (this._shaderSets.getSize() == 0) {
        this.generateShaders();
      }
      let srcColor;
      let dstColor;
      let srcAlpha;
      let dstAlpha;
      const masked = renderer.getClippingContextBufferForDraw() != null;
      const invertedMask = model.getDrawableInvertedMaskBit(index);
      const offset = masked ? invertedMask ? 2 : 1 : 0;
      let shaderSet;
      switch (model.getDrawableBlendMode(index)) {
        case 0 /* CubismBlendMode_Normal */:
        default:
          shaderSet = this._shaderSets.at(
            1 /* ShaderNames_NormalPremultipliedAlpha */ + offset
          );
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ONE;
          dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
          break;
        case 1 /* CubismBlendMode_Additive */:
          shaderSet = this._shaderSets.at(
            4 /* ShaderNames_AddPremultipliedAlpha */ + offset
          );
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        case 2 /* CubismBlendMode_Multiplicative */:
          shaderSet = this._shaderSets.at(
            7 /* ShaderNames_MultPremultipliedAlpha */ + offset
          );
          srcColor = this.gl.DST_COLOR;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
      }
      this.gl.useProgram(shaderSet.shaderProgram);
      if (renderer._bufferData.vertex == null) {
        renderer._bufferData.vertex = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
      const vertexArray = model.getDrawableVertices(index);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
      this.gl.vertexAttribPointer(
        shaderSet.attributePositionLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      if (renderer._bufferData.uv == null) {
        renderer._bufferData.uv = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
      const uvArray = model.getDrawableVertexUvs(index);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
      this.gl.vertexAttribPointer(
        shaderSet.attributeTexCoordLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      if (masked) {
        this.gl.activeTexture(this.gl.TEXTURE1);
        const tex = renderer.getClippingContextBufferForDraw().getClippingManager().getColorBuffer().at(renderer.getClippingContextBufferForDraw()._bufferIndex);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);
        this.gl.uniformMatrix4fv(
          shaderSet.uniformClipMatrixLocation,
          false,
          renderer.getClippingContextBufferForDraw()._matrixForDraw.getArray()
        );
        const channelIndex = renderer.getClippingContextBufferForDraw()._layoutChannelIndex;
        const colorChannel = renderer.getClippingContextBufferForDraw().getClippingManager().getChannelFlagAsColor(channelIndex);
        this.gl.uniform4f(
          shaderSet.uniformChannelFlagLocation,
          colorChannel.r,
          colorChannel.g,
          colorChannel.b,
          colorChannel.a
        );
      }
      const textureNo = model.getDrawableTextureIndex(index);
      const textureId = renderer.getBindedTextures().getValue(textureNo);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
      this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
      const matrix4x4 = renderer.getMvpMatrix();
      this.gl.uniformMatrix4fv(
        shaderSet.uniformMatrixLocation,
        false,
        matrix4x4.getArray()
      );
      const baseColor = renderer.getModelColorWithOpacity(
        model.getDrawableOpacity(index)
      );
      const multiplyColor = model.getMultiplyColor(index);
      const screenColor = model.getScreenColor(index);
      this.gl.uniform4f(
        shaderSet.uniformBaseColorLocation,
        baseColor.r,
        baseColor.g,
        baseColor.b,
        baseColor.a
      );
      this.gl.uniform4f(
        shaderSet.uniformMultiplyColorLocation,
        multiplyColor.r,
        multiplyColor.g,
        multiplyColor.b,
        multiplyColor.a
      );
      this.gl.uniform4f(
        shaderSet.uniformScreenColorLocation,
        screenColor.r,
        screenColor.g,
        screenColor.b,
        screenColor.a
      );
      if (renderer._bufferData.index == null) {
        renderer._bufferData.index = this.gl.createBuffer();
      }
      const indexArray = model.getDrawableVertexIndices(index);
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        renderer._bufferData.index
      );
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        indexArray,
        this.gl.DYNAMIC_DRAW
      );
      this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * マスク用のシェーダプログラムの一連のセットアップを実行する
     * @param renderer レンダラー
     * @param model 描画対象のモデル
     * @param index 描画対象のメッシュのインデックス
     */
    setupShaderProgramForMask(renderer, model, index) {
      if (!renderer.isPremultipliedAlpha()) {
        CubismLogError("NoPremultipliedAlpha is not allowed");
      }
      if (this._shaderSets.getSize() == 0) {
        this.generateShaders();
      }
      const shaderSet = this._shaderSets.at(
        0 /* ShaderNames_SetupMask */
      );
      this.gl.useProgram(shaderSet.shaderProgram);
      if (renderer._bufferData.vertex == null) {
        renderer._bufferData.vertex = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
      const vertexArray = model.getDrawableVertices(index);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
      this.gl.vertexAttribPointer(
        shaderSet.attributePositionLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      if (renderer._bufferData.uv == null) {
        renderer._bufferData.uv = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
      const textureNo = model.getDrawableTextureIndex(index);
      const textureId = renderer.getBindedTextures().getValue(textureNo);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
      this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);
      if (renderer._bufferData.uv == null) {
        renderer._bufferData.uv = this.gl.createBuffer();
      }
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
      const uvArray = model.getDrawableVertexUvs(index);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
      this.gl.vertexAttribPointer(
        shaderSet.attributeTexCoordLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      const context = renderer.getClippingContextBufferForMask();
      const channelIndex = renderer.getClippingContextBufferForMask()._layoutChannelIndex;
      const colorChannel = renderer.getClippingContextBufferForMask().getClippingManager().getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForMask()._matrixForMask.getArray()
      );
      const rect = renderer.getClippingContextBufferForMask()._layoutBounds;
      this.gl.uniform4f(
        shaderSet.uniformBaseColorLocation,
        rect.x * 2 - 1,
        rect.y * 2 - 1,
        rect.getRight() * 2 - 1,
        rect.getBottom() * 2 - 1
      );
      const multiplyColor = model.getMultiplyColor(index);
      const screenColor = model.getScreenColor(index);
      this.gl.uniform4f(
        shaderSet.uniformMultiplyColorLocation,
        multiplyColor.r,
        multiplyColor.g,
        multiplyColor.b,
        multiplyColor.a
      );
      this.gl.uniform4f(
        shaderSet.uniformScreenColorLocation,
        screenColor.r,
        screenColor.g,
        screenColor.b,
        screenColor.a
      );
      const srcColor = this.gl.ZERO;
      const dstColor = this.gl.ONE_MINUS_SRC_COLOR;
      const srcAlpha = this.gl.ZERO;
      const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
      if (renderer._bufferData.index == null) {
        renderer._bufferData.index = this.gl.createBuffer();
      }
      const indexArray = model.getDrawableVertexIndices(index);
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        renderer._bufferData.index
      );
      this.gl.bufferData(
        this.gl.ELEMENT_ARRAY_BUFFER,
        indexArray,
        this.gl.DYNAMIC_DRAW
      );
      this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
    }
    /**
     * シェーダープログラムを解放する
     */
    releaseShaderProgram() {
      for (let i = 0; i < this._shaderSets.getSize(); i++) {
        this.gl.deleteProgram(this._shaderSets.at(i).shaderProgram);
        this._shaderSets.at(i).shaderProgram = 0;
        this._shaderSets.set(i, void 0);
        this._shaderSets.set(i, null);
      }
    }
    /**
     * シェーダープログラムを初期化する
     * @param vertShaderSrc 頂点シェーダのソース
     * @param fragShaderSrc フラグメントシェーダのソース
     */
    generateShaders() {
      for (let i = 0; i < ShaderCount; i++) {
        this._shaderSets.pushBack(new CubismShaderSet());
      }
      this._shaderSets.at(0).shaderProgram = this.loadShaderProgram(
        vertexShaderSrcSetupMask,
        fragmentShaderSrcsetupMask
      );
      this._shaderSets.at(1).shaderProgram = this.loadShaderProgram(
        vertexShaderSrc,
        fragmentShaderSrcPremultipliedAlpha
      );
      this._shaderSets.at(2).shaderProgram = this.loadShaderProgram(
        vertexShaderSrcMasked,
        fragmentShaderSrcMaskPremultipliedAlpha
      );
      this._shaderSets.at(3).shaderProgram = this.loadShaderProgram(
        vertexShaderSrcMasked,
        fragmentShaderSrcMaskInvertedPremultipliedAlpha
      );
      this._shaderSets.at(4).shaderProgram = this._shaderSets.at(1).shaderProgram;
      this._shaderSets.at(5).shaderProgram = this._shaderSets.at(2).shaderProgram;
      this._shaderSets.at(6).shaderProgram = this._shaderSets.at(3).shaderProgram;
      this._shaderSets.at(7).shaderProgram = this._shaderSets.at(1).shaderProgram;
      this._shaderSets.at(8).shaderProgram = this._shaderSets.at(2).shaderProgram;
      this._shaderSets.at(9).shaderProgram = this._shaderSets.at(3).shaderProgram;
      this._shaderSets.at(0).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(0).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(0).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(0).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(0).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(0).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(0).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(0).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(0).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(0).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(0).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(1).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(1).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(1).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(1).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(1).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(1).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(1).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(1).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(1).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(1).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(2).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(2).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(2).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(2).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(2).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(2).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(2).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(2).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(2).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(2).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(2).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(2).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(2).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(3).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(3).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(3).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(3).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(3).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(3).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(3).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(3).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(3).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(3).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(3).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(3).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(3).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(4).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(4).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(4).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(4).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(4).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(4).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(4).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(4).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(4).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(4).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(5).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(5).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(5).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(5).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(5).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(5).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(5).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(5).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(5).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(5).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(5).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(5).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(5).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(6).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(6).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(6).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(6).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(6).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(6).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(6).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(6).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(6).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(6).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(6).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(6).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(6).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(7).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(7).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(7).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(7).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(7).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(7).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(7).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(7).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(7).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(7).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(8).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(8).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(8).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(8).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(8).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(8).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(8).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(8).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(8).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(8).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(8).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(8).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(8).shaderProgram,
        "u_screenColor"
      );
      this._shaderSets.at(9).attributePositionLocation = this.gl.getAttribLocation(
        this._shaderSets.at(9).shaderProgram,
        "a_position"
      );
      this._shaderSets.at(9).attributeTexCoordLocation = this.gl.getAttribLocation(
        this._shaderSets.at(9).shaderProgram,
        "a_texCoord"
      );
      this._shaderSets.at(9).samplerTexture0Location = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "s_texture0"
      );
      this._shaderSets.at(9).samplerTexture1Location = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "s_texture1"
      );
      this._shaderSets.at(9).uniformMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_matrix"
      );
      this._shaderSets.at(9).uniformClipMatrixLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_clipMatrix"
      );
      this._shaderSets.at(9).uniformChannelFlagLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_channelFlag"
      );
      this._shaderSets.at(9).uniformBaseColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_baseColor"
      );
      this._shaderSets.at(9).uniformMultiplyColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_multiplyColor"
      );
      this._shaderSets.at(9).uniformScreenColorLocation = this.gl.getUniformLocation(
        this._shaderSets.at(9).shaderProgram,
        "u_screenColor"
      );
    }
    /**
     * シェーダプログラムをロードしてアドレスを返す
     * @param vertexShaderSource    頂点シェーダのソース
     * @param fragmentShaderSource  フラグメントシェーダのソース
     * @return シェーダプログラムのアドレス
     */
    loadShaderProgram(vertexShaderSource, fragmentShaderSource) {
      let shaderProgram = this.gl.createProgram();
      let vertShader = this.compileShaderSource(
        this.gl.VERTEX_SHADER,
        vertexShaderSource
      );
      if (!vertShader) {
        CubismLogError("Vertex shader compile error!");
        return 0;
      }
      let fragShader = this.compileShaderSource(
        this.gl.FRAGMENT_SHADER,
        fragmentShaderSource
      );
      if (!fragShader) {
        CubismLogError("Vertex shader compile error!");
        return 0;
      }
      this.gl.attachShader(shaderProgram, vertShader);
      this.gl.attachShader(shaderProgram, fragShader);
      this.gl.linkProgram(shaderProgram);
      const linkStatus = this.gl.getProgramParameter(
        shaderProgram,
        this.gl.LINK_STATUS
      );
      if (!linkStatus) {
        CubismLogError("Failed to link program: {0}", shaderProgram);
        this.gl.deleteShader(vertShader);
        vertShader = 0;
        this.gl.deleteShader(fragShader);
        fragShader = 0;
        if (shaderProgram) {
          this.gl.deleteProgram(shaderProgram);
          shaderProgram = 0;
        }
        return 0;
      }
      this.gl.deleteShader(vertShader);
      this.gl.deleteShader(fragShader);
      return shaderProgram;
    }
    /**
     * シェーダープログラムをコンパイルする
     * @param shaderType シェーダタイプ(Vertex/Fragment)
     * @param shaderSource シェーダソースコード
     *
     * @return コンパイルされたシェーダープログラム
     */
    compileShaderSource(shaderType, shaderSource) {
      const source = shaderSource;
      const shader = this.gl.createShader(shaderType);
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!shader) {
        const log = this.gl.getShaderInfoLog(shader);
        CubismLogError("Shader compile log: {0} ", log);
      }
      const status = this.gl.getShaderParameter(
        shader,
        this.gl.COMPILE_STATUS
      );
      if (!status) {
        this.gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    setGl(gl) {
      this.gl = gl;
    }
    // webglコンテキスト
  };
  var CubismShaderSet = class {
    // シェーダープログラムに渡す変数のアドレス（ScreenColor）
  };
  var ShaderNames = /* @__PURE__ */ ((ShaderNames2) => {
    ShaderNames2[ShaderNames2["ShaderNames_SetupMask"] = 0] = "ShaderNames_SetupMask";
    ShaderNames2[ShaderNames2["ShaderNames_NormalPremultipliedAlpha"] = 1] = "ShaderNames_NormalPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_NormalMaskedPremultipliedAlpha"] = 2] = "ShaderNames_NormalMaskedPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_NomralMaskedInvertedPremultipliedAlpha"] = 3] = "ShaderNames_NomralMaskedInvertedPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_AddPremultipliedAlpha"] = 4] = "ShaderNames_AddPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlpha"] = 5] = "ShaderNames_AddMaskedPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_AddMaskedPremultipliedAlphaInverted"] = 6] = "ShaderNames_AddMaskedPremultipliedAlphaInverted";
    ShaderNames2[ShaderNames2["ShaderNames_MultPremultipliedAlpha"] = 7] = "ShaderNames_MultPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlpha"] = 8] = "ShaderNames_MultMaskedPremultipliedAlpha";
    ShaderNames2[ShaderNames2["ShaderNames_MultMaskedPremultipliedAlphaInverted"] = 9] = "ShaderNames_MultMaskedPremultipliedAlphaInverted";
    return ShaderNames2;
  })(ShaderNames || {});
  var vertexShaderSrcSetupMask = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;varying vec4       v_myPos;uniform mat4       u_clipMatrix;void main(){   gl_Position = u_clipMatrix * a_position;   v_myPos = u_clipMatrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
  var fragmentShaderSrcsetupMask = "precision mediump float;varying vec2       v_texCoord;varying vec4       v_myPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;void main(){   float isInside =        step(u_baseColor.x, v_myPos.x/v_myPos.w)       * step(u_baseColor.y, v_myPos.y/v_myPos.w)       * step(v_myPos.x/v_myPos.w, u_baseColor.z)       * step(v_myPos.y/v_myPos.w, u_baseColor.w);   gl_FragColor = u_channelFlag * texture2D(s_texture0, v_texCoord).a * isInside;}";
  var vertexShaderSrc = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;uniform mat4       u_matrix;void main(){   gl_Position = u_matrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
  var vertexShaderSrcMasked = "attribute vec4     a_position;attribute vec2     a_texCoord;varying vec2       v_texCoord;varying vec4       v_clipPos;uniform mat4       u_matrix;uniform mat4       u_clipMatrix;void main(){   gl_Position = u_matrix * a_position;   v_clipPos = u_clipMatrix * a_position;   v_texCoord = a_texCoord;   v_texCoord.y = 1.0 - v_texCoord.y;}";
  var fragmentShaderSrcPremultipliedAlpha = "precision mediump float;varying vec2       v_texCoord;uniform vec4       u_baseColor;uniform sampler2D  s_texture0;uniform vec4       u_multiplyColor;uniform vec4       u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 color = texColor * u_baseColor;   gl_FragColor = vec4(color.rgb, color.a);}";
  var fragmentShaderSrcMaskPremultipliedAlpha = "precision mediump float;varying vec2       v_texCoord;varying vec4       v_clipPos;uniform vec4       u_baseColor;uniform vec4       u_channelFlag;uniform sampler2D  s_texture0;uniform sampler2D  s_texture1;uniform vec4       u_multiplyColor;uniform vec4       u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 col_formask = texColor * u_baseColor;   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;   col_formask = col_formask * maskVal;   gl_FragColor = col_formask;}";
  var fragmentShaderSrcMaskInvertedPremultipliedAlpha = "precision mediump float;varying vec2      v_texCoord;varying vec4      v_clipPos;uniform sampler2D s_texture0;uniform sampler2D s_texture1;uniform vec4      u_channelFlag;uniform vec4      u_baseColor;uniform vec4      u_multiplyColor;uniform vec4      u_screenColor;void main(){   vec4 texColor = texture2D(s_texture0, v_texCoord);   texColor.rgb = texColor.rgb * u_multiplyColor.rgb;   texColor.rgb = (texColor.rgb + u_screenColor.rgb * texColor.a) - (texColor.rgb * u_screenColor.rgb);   vec4 col_formask = texColor * u_baseColor;   vec4 clipMask = (1.0 - texture2D(s_texture1, v_clipPos.xy / v_clipPos.w)) * u_channelFlag;   float maskVal = clipMask.r + clipMask.g + clipMask.b + clipMask.a;   col_formask = col_formask * (1.0 - maskVal);   gl_FragColor = col_formask;}";
  var Live2DCubismFramework31;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismShaderSet = CubismShaderSet;
    Live2DCubismFramework40.CubismShader_WebGL = CubismShader_WebGL;
    Live2DCubismFramework40.ShaderNames = ShaderNames;
  })(Live2DCubismFramework31 || (Live2DCubismFramework31 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/rendering/cubismrenderer_webgl.ts
  var s_viewport;
  var s_fbo;
  var CubismClippingManager_WebGL = class extends CubismClippingManager {
    /**
     * テンポラリのレンダーテクスチャのアドレスを取得する
     * FrameBufferObjectが存在しない場合、新しく生成する
     *
     * @return レンダーテクスチャの配列
     */
    getMaskRenderTexture() {
      if (this._maskTexture && this._maskTexture.textures != null) {
        this._maskTexture.frameNo = this._currentFrameNo;
      } else {
        if (this._maskRenderTextures != null) {
          this._maskRenderTextures.clear();
        }
        this._maskRenderTextures = new csmVector();
        if (this._maskColorBuffers != null) {
          this._maskColorBuffers.clear();
        }
        this._maskColorBuffers = new csmVector();
        const size = this._clippingMaskBufferSize;
        for (let index = 0; index < this._renderTextureCount; index++) {
          this._maskColorBuffers.pushBack(this.gl.createTexture());
          this.gl.bindTexture(
            this.gl.TEXTURE_2D,
            this._maskColorBuffers.at(index)
          );
          this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            size,
            size,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            null
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_WRAP_S,
            this.gl.CLAMP_TO_EDGE
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_WRAP_T,
            this.gl.CLAMP_TO_EDGE
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_MIN_FILTER,
            this.gl.LINEAR
          );
          this.gl.texParameteri(
            this.gl.TEXTURE_2D,
            this.gl.TEXTURE_MAG_FILTER,
            this.gl.LINEAR
          );
          this.gl.bindTexture(this.gl.TEXTURE_2D, null);
          this._maskRenderTextures.pushBack(this.gl.createFramebuffer());
          this.gl.bindFramebuffer(
            this.gl.FRAMEBUFFER,
            this._maskRenderTextures.at(index)
          );
          this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.COLOR_ATTACHMENT0,
            this.gl.TEXTURE_2D,
            this._maskColorBuffers.at(index),
            0
          );
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
        this._maskTexture = new CubismRenderTextureResource(
          this._currentFrameNo,
          this._maskRenderTextures
        );
      }
      return this._maskTexture.textures;
    }
    /**
     * WebGLレンダリングコンテキストを設定する
     * @param gl WebGLレンダリングコンテキスト
     */
    setGL(gl) {
      this.gl = gl;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      super(CubismClippingContext_WebGL);
    }
    /**
     * クリッピングコンテキストを作成する。モデル描画時に実行する。
     * @param model モデルのインスタンス
     * @param renderer レンダラのインスタンス
     */
    setupClippingContext(model, renderer) {
      this._currentFrameNo++;
      let usingClipCount = 0;
      for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
        const cc = this._clippingContextListForMask.at(clipIndex);
        this.calcClippedDrawTotalBounds(model, cc);
        if (cc._isUsing) {
          usingClipCount++;
        }
      }
      if (usingClipCount > 0) {
        this.gl.viewport(
          0,
          0,
          this._clippingMaskBufferSize,
          this._clippingMaskBufferSize
        );
        this._currentMaskRenderTexture = this.getMaskRenderTexture().at(0);
        renderer.preDraw();
        this.setupLayoutBounds(usingClipCount);
        this.gl.bindFramebuffer(
          this.gl.FRAMEBUFFER,
          this._currentMaskRenderTexture
        );
        if (this._clearedFrameBufferFlags.getSize() != this._renderTextureCount) {
          this._clearedFrameBufferFlags.clear();
          this._clearedFrameBufferFlags = new csmVector(
            this._renderTextureCount
          );
        }
        for (let index = 0; index < this._clearedFrameBufferFlags.getSize(); index++) {
          this._clearedFrameBufferFlags.set(index, false);
        }
        for (let clipIndex = 0; clipIndex < this._clippingContextListForMask.getSize(); clipIndex++) {
          const clipContext = this._clippingContextListForMask.at(clipIndex);
          const allClipedDrawRect = clipContext._allClippedDrawRect;
          const layoutBoundsOnTex01 = clipContext._layoutBounds;
          const margin = 0.05;
          let scaleX = 0;
          let scaleY = 0;
          const clipContextRenderTexture = this.getMaskRenderTexture().at(
            clipContext._bufferIndex
          );
          if (this._currentMaskRenderTexture != clipContextRenderTexture) {
            this._currentMaskRenderTexture = clipContextRenderTexture;
            renderer.preDraw();
            this.gl.bindFramebuffer(
              this.gl.FRAMEBUFFER,
              this._currentMaskRenderTexture
            );
          }
          this._tmpBoundsOnModel.setRect(allClipedDrawRect);
          this._tmpBoundsOnModel.expand(
            allClipedDrawRect.width * margin,
            allClipedDrawRect.height * margin
          );
          scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
          scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
          {
            this._tmpMatrix.loadIdentity();
            {
              this._tmpMatrix.translateRelative(-1, -1);
              this._tmpMatrix.scaleRelative(2, 2);
            }
            {
              this._tmpMatrix.translateRelative(
                layoutBoundsOnTex01.x,
                layoutBoundsOnTex01.y
              );
              this._tmpMatrix.scaleRelative(scaleX, scaleY);
              this._tmpMatrix.translateRelative(
                -this._tmpBoundsOnModel.x,
                -this._tmpBoundsOnModel.y
              );
            }
            this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());
          }
          {
            this._tmpMatrix.loadIdentity();
            {
              this._tmpMatrix.translateRelative(
                layoutBoundsOnTex01.x,
                layoutBoundsOnTex01.y
              );
              this._tmpMatrix.scaleRelative(scaleX, scaleY);
              this._tmpMatrix.translateRelative(
                -this._tmpBoundsOnModel.x,
                -this._tmpBoundsOnModel.y
              );
            }
            this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
          }
          clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
          clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
          const clipDrawCount = clipContext._clippingIdCount;
          for (let i = 0; i < clipDrawCount; i++) {
            const clipDrawIndex = clipContext._clippingIdList[i];
            if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
              continue;
            }
            renderer.setIsCulling(
              model.getDrawableCulling(clipDrawIndex) != false
            );
            if (!this._clearedFrameBufferFlags.at(clipContext._bufferIndex)) {
              this.gl.clearColor(1, 1, 1, 1);
              this.gl.clear(this.gl.COLOR_BUFFER_BIT);
              this._clearedFrameBufferFlags.set(clipContext._bufferIndex, true);
            }
            renderer.setClippingContextBufferForMask(clipContext);
            renderer.drawMeshWebGL(model, clipDrawIndex);
          }
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
        renderer.setClippingContextBufferForMask(null);
        this.gl.viewport(
          s_viewport[0],
          s_viewport[1],
          s_viewport[2],
          s_viewport[3]
        );
      }
    }
    /**
     * カラーバッファを取得する
     * @return カラーバッファ
     */
    getColorBuffer() {
      return this._maskColorBuffers;
    }
    /**
     * マスクの合計数をカウント
     * @returns
     */
    getClippingMaskCount() {
      return this._clippingContextListForMask.getSize();
    }
    // WebGLレンダリングコンテキスト
  };
  var CubismRenderTextureResource = class {
    /**
     * 引数付きコンストラクタ
     * @param frameNo レンダラーのフレーム番号
     * @param texture テクスチャのアドレス
     */
    constructor(frameNo, texture) {
      this.frameNo = frameNo;
      this.textures = texture;
    }
    // テクスチャのアドレス
  };
  var CubismClippingContext_WebGL = class extends CubismClippingContext {
    /**
     * 引数付きコンストラクタ
     */
    constructor(manager, clippingDrawableIndices, clipCount) {
      super(clippingDrawableIndices, clipCount);
      this._owner = manager;
    }
    /**
     * このマスクを管理するマネージャのインスタンスを取得する
     * @return クリッピングマネージャのインスタンス
     */
    getClippingManager() {
      return this._owner;
    }
    setGl(gl) {
      this._owner.setGL(gl);
    }
    // このマスクを管理しているマネージャのインスタンス
  };
  var CubismRendererProfile_WebGL = class {
    setGlEnable(index, enabled) {
      if (enabled) this.gl.enable(index);
      else this.gl.disable(index);
    }
    setGlEnableVertexAttribArray(index, enabled) {
      if (enabled) this.gl.enableVertexAttribArray(index);
      else this.gl.disableVertexAttribArray(index);
    }
    save() {
      if (this.gl == null) {
        CubismLogError(
          "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
        );
        return;
      }
      this._lastArrayBufferBinding = this.gl.getParameter(
        this.gl.ARRAY_BUFFER_BINDING
      );
      this._lastElementArrayBufferBinding = this.gl.getParameter(
        this.gl.ELEMENT_ARRAY_BUFFER_BINDING
      );
      this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
      this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
      this.gl.activeTexture(this.gl.TEXTURE1);
      this._lastTexture1Binding2D = this.gl.getParameter(
        this.gl.TEXTURE_BINDING_2D
      );
      this.gl.activeTexture(this.gl.TEXTURE0);
      this._lastTexture0Binding2D = this.gl.getParameter(
        this.gl.TEXTURE_BINDING_2D
      );
      this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(
        0,
        this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
      );
      this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(
        1,
        this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
      );
      this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(
        2,
        this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
      );
      this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(
        3,
        this.gl.VERTEX_ATTRIB_ARRAY_ENABLED
      );
      this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
      this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
      this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
      this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
      this._lastBlend = this.gl.isEnabled(this.gl.BLEND);
      this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
      this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);
      this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
      this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
      this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
      this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
      this._lastFBO = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
      this._lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
    }
    restore() {
      if (this.gl == null) {
        CubismLogError(
          "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
        );
        return;
      }
      this.gl.useProgram(this._lastProgram);
      this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
      this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
      this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
      this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);
      this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
      this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
      this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
      this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
      this.setGlEnable(this.gl.BLEND, this._lastBlend);
      this.gl.frontFace(this._lastFrontFace);
      this.gl.colorMask(
        this._lastColorMask[0],
        this._lastColorMask[1],
        this._lastColorMask[2],
        this._lastColorMask[3]
      );
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding);
      this.gl.bindBuffer(
        this.gl.ELEMENT_ARRAY_BUFFER,
        this._lastElementArrayBufferBinding
      );
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);
      this.gl.activeTexture(this._lastActiveTexture);
      this.gl.blendFuncSeparate(
        this._lastBlending[0],
        this._lastBlending[1],
        this._lastBlending[2],
        this._lastBlending[3]
      );
    }
    setGl(gl) {
      this.gl = gl;
    }
    constructor() {
      this._lastVertexAttribArrayEnabled = new Array(4);
      this._lastColorMask = new Array(4);
      this._lastBlending = new Array(4);
      this._lastViewport = new Array(4);
    }
  };
  var CubismRenderer_WebGL = class extends CubismRenderer {
    /**
     * レンダラの初期化処理を実行する
     * 引数に渡したモデルからレンダラの初期化処理に必要な情報を取り出すことができる
     *
     * @param model モデルのインスタンス
     * @param maskBufferCount バッファの生成数
     */
    initialize(model, maskBufferCount = 1) {
      if (model.isUsingMasking()) {
        this._clippingManager = new CubismClippingManager_WebGL();
        this._clippingManager.initialize(model, maskBufferCount);
      }
      this._sortedDrawableIndexList.resize(model.getDrawableCount(), 0);
      super.initialize(model);
    }
    /**
     * WebGLテクスチャのバインド処理
     * CubismRendererにテクスチャを設定し、CubismRenderer内でその画像を参照するためのIndex値を戻り値とする
     * @param modelTextureNo セットするモデルテクスチャの番号
     * @param glTextureNo WebGLテクスチャの番号
     */
    bindTexture(modelTextureNo, glTexture) {
      this._textures.setValue(modelTextureNo, glTexture);
    }
    /**
     * WebGLにバインドされたテクスチャのリストを取得する
     * @return テクスチャのリスト
     */
    getBindedTextures() {
      return this._textures;
    }
    /**
     * クリッピングマスクバッファのサイズを設定する
     * マスク用のFrameBufferを破棄、再作成する為処理コストは高い
     * @param size クリッピングマスクバッファのサイズ
     */
    setClippingMaskBufferSize(size) {
      if (!this._model.isUsingMasking()) {
        return;
      }
      const renderTextureCount = this._clippingManager.getRenderTextureCount();
      this._clippingManager.release();
      this._clippingManager = void 0;
      this._clippingManager = null;
      this._clippingManager = new CubismClippingManager_WebGL();
      this._clippingManager.setClippingMaskBufferSize(size);
      this._clippingManager.initialize(
        this.getModel(),
        renderTextureCount
        // インスタンス破棄前に保存したレンダーテクスチャの数
      );
    }
    /**
     * クリッピングマスクバッファのサイズを取得する
     * @return クリッピングマスクバッファのサイズ
     */
    getClippingMaskBufferSize() {
      return this._model.isUsingMasking() ? this._clippingManager.getClippingMaskBufferSize() : -1;
    }
    /**
     * レンダーテクスチャの枚数を取得する
     * @return レンダーテクスチャの枚数
     */
    getRenderTextureCount() {
      return this._model.isUsingMasking() ? this._clippingManager.getRenderTextureCount() : -1;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      super();
      this._clippingContextBufferForMask = null;
      this._clippingContextBufferForDraw = null;
      this._rendererProfile = new CubismRendererProfile_WebGL();
      this.firstDraw = true;
      this._textures = new csmMap();
      this._sortedDrawableIndexList = new csmVector();
      this._bufferData = {
        vertex: WebGLBuffer = null,
        uv: WebGLBuffer = null,
        index: WebGLBuffer = null
      };
      this._textures.prepareCapacity(32, true);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      if (this._clippingManager) {
        this._clippingManager.release();
        this._clippingManager = void 0;
        this._clippingManager = null;
      }
      if (this.gl == null) {
        return;
      }
      this.gl.deleteBuffer(this._bufferData.vertex);
      this._bufferData.vertex = null;
      this.gl.deleteBuffer(this._bufferData.uv);
      this._bufferData.uv = null;
      this.gl.deleteBuffer(this._bufferData.index);
      this._bufferData.index = null;
      this._bufferData = null;
      this._textures = null;
    }
    /**
     * モデルを描画する実際の処理
     */
    doDrawModel() {
      if (this.gl == null) {
        CubismLogError(
          "'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function."
        );
        return;
      }
      if (this._clippingManager != null) {
        this.preDraw();
        if (this.isUsingHighPrecisionMask()) {
          this._clippingManager.setupMatrixForHighPrecision(
            this.getModel(),
            false
          );
        } else {
          this._clippingManager.setupClippingContext(this.getModel(), this);
        }
      }
      this.preDraw();
      const drawableCount = this.getModel().getDrawableCount();
      const renderOrder = this.getModel().getDrawableRenderOrders();
      for (let i = 0; i < drawableCount; ++i) {
        const order = renderOrder[i];
        this._sortedDrawableIndexList.set(order, i);
      }
      for (let i = 0; i < drawableCount; ++i) {
        const drawableIndex = this._sortedDrawableIndexList.at(i);
        if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
          continue;
        }
        const clipContext = this._clippingManager != null ? this._clippingManager.getClippingContextListForDraw().at(drawableIndex) : null;
        if (clipContext != null && this.isUsingHighPrecisionMask()) {
          if (clipContext._isUsing) {
            this.gl.viewport(
              0,
              0,
              this._clippingManager.getClippingMaskBufferSize(),
              this._clippingManager.getClippingMaskBufferSize()
            );
            this.preDraw();
            this.gl.bindFramebuffer(
              this.gl.FRAMEBUFFER,
              clipContext.getClippingManager().getMaskRenderTexture().at(clipContext._bufferIndex)
            );
            this.gl.clearColor(1, 1, 1, 1);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
          }
          {
            const clipDrawCount = clipContext._clippingIdCount;
            for (let index = 0; index < clipDrawCount; index++) {
              const clipDrawIndex = clipContext._clippingIdList[index];
              if (!this._model.getDrawableDynamicFlagVertexPositionsDidChange(
                clipDrawIndex
              )) {
                continue;
              }
              this.setIsCulling(
                this._model.getDrawableCulling(clipDrawIndex) != false
              );
              this.setClippingContextBufferForMask(clipContext);
              this.drawMeshWebGL(this._model, clipDrawIndex);
            }
          }
          {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, s_fbo);
            this.setClippingContextBufferForMask(null);
            this.gl.viewport(
              s_viewport[0],
              s_viewport[1],
              s_viewport[2],
              s_viewport[3]
            );
            this.preDraw();
          }
        }
        this.setClippingContextBufferForDraw(clipContext);
        this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));
        this.drawMeshWebGL(this._model, drawableIndex);
      }
    }
    /**
     * 描画オブジェクト（アートメッシュ）を描画する。
     * @param model 描画対象のモデル
     * @param index 描画対象のメッシュのインデックス
     */
    drawMeshWebGL(model, index) {
      if (this.isCulling()) {
        this.gl.enable(this.gl.CULL_FACE);
      } else {
        this.gl.disable(this.gl.CULL_FACE);
      }
      this.gl.frontFace(this.gl.CCW);
      if (this.isGeneratingMask()) {
        CubismShader_WebGL.getInstance().setupShaderProgramForMask(
          this,
          model,
          index
        );
      } else {
        CubismShader_WebGL.getInstance().setupShaderProgramForDraw(
          this,
          model,
          index
        );
      }
      {
        const indexCount = model.getDrawableVertexIndexCount(index);
        this.gl.drawElements(
          this.gl.TRIANGLES,
          indexCount,
          this.gl.UNSIGNED_SHORT,
          0
        );
      }
      this.gl.useProgram(null);
      this.setClippingContextBufferForDraw(null);
      this.setClippingContextBufferForMask(null);
    }
    saveProfile() {
      this._rendererProfile.save();
    }
    restoreProfile() {
      this._rendererProfile.restore();
    }
    /**
     * レンダラが保持する静的なリソースを解放する
     * WebGLの静的なシェーダープログラムを解放する
     */
    static doStaticRelease() {
      CubismShader_WebGL.deleteInstance();
    }
    /**
     * レンダーステートを設定する
     * @param fbo アプリケーション側で指定しているフレームバッファ
     * @param viewport ビューポート
     */
    setRenderState(fbo, viewport) {
      s_fbo = fbo;
      s_viewport = viewport;
    }
    /**
     * 描画開始時の追加処理
     * モデルを描画する前にクリッピングマスクに必要な処理を実装している
     */
    preDraw() {
      if (this.firstDraw) {
        this.firstDraw = false;
      }
      this.gl.disable(this.gl.SCISSOR_TEST);
      this.gl.disable(this.gl.STENCIL_TEST);
      this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.frontFace(this.gl.CW);
      this.gl.enable(this.gl.BLEND);
      this.gl.colorMask(true, true, true, true);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
      if (this.getAnisotropy() > 0 && this._extension) {
        for (let i = 0; i < this._textures.getSize(); ++i) {
          this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.getValue(i));
          this.gl.texParameterf(
            this.gl.TEXTURE_2D,
            this._extension.TEXTURE_MAX_ANISOTROPY_EXT,
            this.getAnisotropy()
          );
        }
      }
    }
    /**
     * マスクテクスチャに描画するクリッピングコンテキストをセットする
     */
    setClippingContextBufferForMask(clip) {
      this._clippingContextBufferForMask = clip;
    }
    /**
     * マスクテクスチャに描画するクリッピングコンテキストを取得する
     * @return マスクテクスチャに描画するクリッピングコンテキスト
     */
    getClippingContextBufferForMask() {
      return this._clippingContextBufferForMask;
    }
    /**
     * 画面上に描画するクリッピングコンテキストをセットする
     */
    setClippingContextBufferForDraw(clip) {
      this._clippingContextBufferForDraw = clip;
    }
    /**
     * 画面上に描画するクリッピングコンテキストを取得する
     * @return 画面上に描画するクリッピングコンテキスト
     */
    getClippingContextBufferForDraw() {
      return this._clippingContextBufferForDraw;
    }
    /**
     * マスク生成時かを判定する
     * @returns 判定値
     */
    isGeneratingMask() {
      return this.getClippingContextBufferForMask() != null;
    }
    /**
     * glの設定
     */
    startUp(gl) {
      this.gl = gl;
      if (this._clippingManager) {
        this._clippingManager.setGL(gl);
      }
      CubismShader_WebGL.getInstance().setGl(gl);
      this._rendererProfile.setGl(gl);
      this._extension = this.gl.getExtension("EXT_texture_filter_anisotropic") || this.gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") || this.gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
    }
    // webglコンテキスト
  };
  CubismRenderer.staticRelease = () => {
    CubismRenderer_WebGL.doStaticRelease();
  };
  var Live2DCubismFramework32;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismClippingContext = CubismClippingContext_WebGL;
    Live2DCubismFramework40.CubismClippingManager_WebGL = CubismClippingManager_WebGL;
    Live2DCubismFramework40.CubismRenderTextureResource = CubismRenderTextureResource;
    Live2DCubismFramework40.CubismRenderer_WebGL = CubismRenderer_WebGL;
  })(Live2DCubismFramework32 || (Live2DCubismFramework32 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/model/cubismmodel.ts
  var DrawableColorData = class {
    constructor(isOverwritten = false, color = new CubismTextureColor()) {
      this.isOverwritten = isOverwritten;
      this.color = color;
    }
  };
  var PartColorData = class {
    constructor(isOverwritten = false, color = new CubismTextureColor()) {
      this.isOverwritten = isOverwritten;
      this.color = color;
    }
  };
  var DrawableCullingData = class {
    /**
     * コンストラクタ
     *
     * @param isOverwritten
     * @param isCulling
     */
    constructor(isOverwritten = false, isCulling = false) {
      this.isOverwritten = isOverwritten;
      this.isCulling = isCulling;
    }
  };
  var CubismModel = class {
    /**
     * モデルのパラメータの更新
     */
    update() {
      this._model.update();
      this._model.drawables.resetDynamicFlags();
    }
    /**
     * PixelsPerUnitを取得する
     * @returns PixelsPerUnit
     */
    getPixelsPerUnit() {
      if (this._model == null) {
        return 0;
      }
      return this._model.canvasinfo.PixelsPerUnit;
    }
    /**
     * キャンバスの幅を取得する
     */
    getCanvasWidth() {
      if (this._model == null) {
        return 0;
      }
      return this._model.canvasinfo.CanvasWidth / this._model.canvasinfo.PixelsPerUnit;
    }
    /**
     * キャンバスの高さを取得する
     */
    getCanvasHeight() {
      if (this._model == null) {
        return 0;
      }
      return this._model.canvasinfo.CanvasHeight / this._model.canvasinfo.PixelsPerUnit;
    }
    /**
     * パラメータを保存する
     */
    saveParameters() {
      const parameterCount = this._model.parameters.count;
      const savedParameterCount = this._savedParameters.getSize();
      for (let i = 0; i < parameterCount; ++i) {
        if (i < savedParameterCount) {
          this._savedParameters.set(i, this._parameterValues[i]);
        } else {
          this._savedParameters.pushBack(this._parameterValues[i]);
        }
      }
    }
    /**
     * 乗算色を取得する
     * @param index Drawablesのインデックス
     * @returns 指定したdrawableの乗算色(RGBA)
     */
    getMultiplyColor(index) {
      if (this.getOverwriteFlagForModelMultiplyColors() || this.getOverwriteFlagForDrawableMultiplyColors(index)) {
        return this._userMultiplyColors.at(index).color;
      }
      const color = this.getDrawableMultiplyColor(index);
      return color;
    }
    /**
     * スクリーン色を取得する
     * @param index Drawablesのインデックス
     * @returns 指定したdrawableのスクリーン色(RGBA)
     */
    getScreenColor(index) {
      if (this.getOverwriteFlagForModelScreenColors() || this.getOverwriteFlagForDrawableScreenColors(index)) {
        return this._userScreenColors.at(index).color;
      }
      const color = this.getDrawableScreenColor(index);
      return color;
    }
    /**
     * 乗算色をセットする
     * @param index Drawablesのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setMultiplyColorByTextureColor(index, color) {
      this.setMultiplyColorByRGBA(index, color.r, color.g, color.b, color.a);
    }
    /**
     * 乗算色をセットする
     * @param index Drawablesのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setMultiplyColorByRGBA(index, r, g, b, a = 1) {
      this._userMultiplyColors.at(index).color.r = r;
      this._userMultiplyColors.at(index).color.g = g;
      this._userMultiplyColors.at(index).color.b = b;
      this._userMultiplyColors.at(index).color.a = a;
    }
    /**
     * スクリーン色をセットする
     * @param index Drawablesのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setScreenColorByTextureColor(index, color) {
      this.setScreenColorByRGBA(index, color.r, color.g, color.b, color.a);
    }
    /**
     * スクリーン色をセットする
     * @param index Drawablesのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setScreenColorByRGBA(index, r, g, b, a = 1) {
      this._userScreenColors.at(index).color.r = r;
      this._userScreenColors.at(index).color.g = g;
      this._userScreenColors.at(index).color.b = b;
      this._userScreenColors.at(index).color.a = a;
    }
    /**
     * partの乗算色を取得する
     * @param partIndex partのインデックス
     * @returns 指定したpartの乗算色
     */
    getPartMultiplyColor(partIndex) {
      return this._userPartMultiplyColors.at(partIndex).color;
    }
    /**
     * partのスクリーン色を取得する
     * @param partIndex partのインデックス
     * @returns 指定したpartのスクリーン色
     */
    getPartScreenColor(partIndex) {
      return this._userPartScreenColors.at(partIndex).color;
    }
    /**
     * partのOverwriteColor setter関数
     * @param partIndex partのインデックス
     * @param r 設定する色のR値
     * @param g 設定する色のG値
     * @param b 設定する色のB値
     * @param a 設定する色のA値
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setPartColor(partIndex, r, g, b, a, partColors, drawableColors) {
      partColors.at(partIndex).color.r = r;
      partColors.at(partIndex).color.g = g;
      partColors.at(partIndex).color.b = b;
      partColors.at(partIndex).color.a = a;
      if (partColors.at(partIndex).isOverwritten) {
        for (let i = 0; i < this._partChildDrawables.at(partIndex).getSize(); ++i) {
          const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
          drawableColors.at(drawableIndex).color.r = r;
          drawableColors.at(drawableIndex).color.g = g;
          drawableColors.at(drawableIndex).color.b = b;
          drawableColors.at(drawableIndex).color.a = a;
        }
      }
    }
    /**
     * 乗算色をセットする
     * @param partIndex partのインデックス
     * @param color 設定する乗算色(CubismTextureColor)
     */
    setPartMultiplyColorByTextureColor(partIndex, color) {
      this.setPartMultiplyColorByRGBA(
        partIndex,
        color.r,
        color.g,
        color.b,
        color.a
      );
    }
    /**
     * 乗算色をセットする
     * @param partIndex partのインデックス
     * @param r 設定する乗算色のR値
     * @param g 設定する乗算色のG値
     * @param b 設定する乗算色のB値
     * @param a 設定する乗算色のA値
     */
    setPartMultiplyColorByRGBA(partIndex, r, g, b, a) {
      this.setPartColor(
        partIndex,
        r,
        g,
        b,
        a,
        this._userPartMultiplyColors,
        this._userMultiplyColors
      );
    }
    /**
     * スクリーン色をセットする
     * @param partIndex partのインデックス
     * @param color 設定するスクリーン色(CubismTextureColor)
     */
    setPartScreenColorByTextureColor(partIndex, color) {
      this.setPartScreenColorByRGBA(
        partIndex,
        color.r,
        color.g,
        color.b,
        color.a
      );
    }
    /**
     * スクリーン色をセットする
     * @param partIndex partのインデックス
     * @param r 設定するスクリーン色のR値
     * @param g 設定するスクリーン色のG値
     * @param b 設定するスクリーン色のB値
     * @param a 設定するスクリーン色のA値
     */
    setPartScreenColorByRGBA(partIndex, r, g, b, a) {
      this.setPartColor(
        partIndex,
        r,
        g,
        b,
        a,
        this._userPartScreenColors,
        this._userScreenColors
      );
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするか
     * @returns true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelMultiplyColors() {
      return this._isOverwrittenModelMultiplyColors;
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするか
     * @returns true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForModelScreenColors() {
      return this._isOverwrittenModelScreenColors;
    }
    /**
     * SDKから指定したモデルの乗算色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelMultiplyColors(value) {
      this._isOverwrittenModelMultiplyColors = value;
    }
    /**
     * SDKから指定したモデルのスクリーン色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForModelScreenColors(value) {
      this._isOverwrittenModelScreenColors = value;
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするか
     * @returns true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForDrawableMultiplyColors(drawableindex) {
      return this._userMultiplyColors.at(drawableindex).isOverwritten;
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするか
     * @returns true -> SDKからの情報を優先する
     *          false -> モデルに設定されている色情報を使用
     */
    getOverwriteFlagForDrawableScreenColors(drawableindex) {
      return this._userScreenColors.at(drawableindex).isOverwritten;
    }
    /**
     * SDKから指定したDrawableIndexの乗算色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableMultiplyColors(drawableindex, value) {
      this._userMultiplyColors.at(drawableindex).isOverwritten = value;
    }
    /**
     * SDKから指定したDrawableIndexのスクリーン色を上書きするかセットする
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteFlagForDrawableScreenColors(drawableindex, value) {
      this._userScreenColors.at(drawableindex).isOverwritten = value;
    }
    /**
     * SDKからpartの乗算色を上書きするか
     * @param partIndex partのインデックス
     * @returns true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverwriteColorForPartMultiplyColors(partIndex) {
      return this._userPartMultiplyColors.at(partIndex).isOverwritten;
    }
    /**
     * SDKからpartのスクリーン色を上書きするか
     * @param partIndex partのインデックス
     * @returns true    ->  SDKからの情報を優先する
     *          false   ->  モデルに設定されている色情報を使用
     */
    getOverwriteColorForPartScreenColors(partIndex) {
      return this._userPartScreenColors.at(partIndex).isOverwritten;
    }
    /**
     * partのOverwriteFlag setter関数
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     * @param partColors 設定するpartのカラーデータ配列
     * @param drawableColors partに関連するDrawableのカラーデータ配列
     */
    setOverwriteColorForPartColors(partIndex, value, partColors, drawableColors) {
      partColors.at(partIndex).isOverwritten = value;
      for (let i = 0; i < this._partChildDrawables.at(partIndex).getSize(); ++i) {
        const drawableIndex = this._partChildDrawables.at(partIndex).at(i);
        drawableColors.at(drawableIndex).isOverwritten = value;
        if (value) {
          drawableColors.at(drawableIndex).color.r = partColors.at(partIndex).color.r;
          drawableColors.at(drawableIndex).color.g = partColors.at(partIndex).color.g;
          drawableColors.at(drawableIndex).color.b = partColors.at(partIndex).color.b;
          drawableColors.at(drawableIndex).color.a = partColors.at(partIndex).color.a;
        }
      }
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartMultiplyColors(partIndex, value) {
      this._userPartMultiplyColors.at(partIndex).isOverwritten = value;
      this.setOverwriteColorForPartColors(
        partIndex,
        value,
        this._userPartMultiplyColors,
        this._userMultiplyColors
      );
    }
    /**
     * SDKからpartのスクリーン色を上書きするかをセットする
     * @param partIndex partのインデックス
     * @param value true -> SDKからの情報を優先する
     *              false -> モデルに設定されている色情報を使用
     */
    setOverwriteColorForPartScreenColors(partIndex, value) {
      this._userPartScreenColors.at(partIndex).isOverwritten = value;
      this.setOverwriteColorForPartColors(
        partIndex,
        value,
        this._userPartScreenColors,
        this._userScreenColors
      );
    }
    /**
     * Drawableのカリング情報を取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     * @return  Drawableのカリング情報
     */
    getDrawableCulling(drawableIndex) {
      if (this.getOverwriteFlagForModelCullings() || this.getOverwriteFlagForDrawableCullings(drawableIndex)) {
        return this._userCullings.at(drawableIndex).isCulling;
      }
      const constantFlags = this._model.drawables.constantFlags;
      return !Live2DCubismCore.Utils.hasIsDoubleSidedBit(
        constantFlags[drawableIndex]
      );
    }
    /**
     * Drawableのカリング情報を設定する。
     *
     * @param drawableIndex Drawableのインデックス
     * @param isCulling カリング情報
     */
    setDrawableCulling(drawableIndex, isCulling) {
      this._userCullings.at(drawableIndex).isCulling = isCulling;
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするか。
     *
     * @retval  true    ->  SDK上のカリング設定を使用
     * @retval  false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForModelCullings() {
      return this._isOverwrittenCullings;
    }
    /**
     * SDKからモデル全体のカリング設定を上書きするかを設定する。
     *
     * @param isOverwrittenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForModelCullings(isOverwrittenCullings) {
      this._isOverwrittenCullings = isOverwrittenCullings;
    }
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @retval  true    ->  SDK上のカリング設定を使用
     * @retval  false   ->  モデルのカリング設定を使用
     */
    getOverwriteFlagForDrawableCullings(drawableIndex) {
      return this._userCullings.at(drawableIndex).isOverwritten;
    }
    /**
     *
     * @param drawableIndex Drawableのインデックス
     * @param isOverwrittenCullings SDK上のカリング設定を使うならtrue、モデルのカリング設定を使うならfalse
     */
    setOverwriteFlagForDrawableCullings(drawableIndex, isOverwrittenCullings) {
      this._userCullings.at(drawableIndex).isOverwritten = isOverwrittenCullings;
    }
    /**
     * モデルの不透明度を取得する
     *
     * @returns 不透明度の値
     */
    getModelOapcity() {
      return this._modelOpacity;
    }
    /**
     * モデルの不透明度を設定する
     *
     * @param value 不透明度の値
     */
    setModelOapcity(value) {
      this._modelOpacity = value;
    }
    /**
     * モデルを取得
     */
    getModel() {
      return this._model;
    }
    /**
     * パーツのインデックスを取得
     * @param partId パーツのID
     * @return パーツのインデックス
     */
    getPartIndex(partId) {
      let partIndex;
      const partCount = this._model.parts.count;
      for (partIndex = 0; partIndex < partCount; ++partIndex) {
        if (partId == this._partIds.at(partIndex)) {
          return partIndex;
        }
      }
      if (this._notExistPartId.isExist(partId)) {
        return this._notExistPartId.getValue(partId);
      }
      partIndex = partCount + this._notExistPartId.getSize();
      this._notExistPartId.setValue(partId, partIndex);
      this._notExistPartOpacities.appendKey(partIndex);
      return partIndex;
    }
    /**
     * パーツのIDを取得する。
     *
     * @param partIndex 取得するパーツのインデックス
     * @return パーツのID
     */
    getPartId(partIndex) {
      const partId = this._model.parts.ids[partIndex];
      return CubismFramework.getIdManager().getId(partId);
    }
    /**
     * パーツの個数の取得
     * @return パーツの個数
     */
    getPartCount() {
      const partCount = this._model.parts.count;
      return partCount;
    }
    /**
     * パーツの不透明度の設定(Index)
     * @param partIndex パーツのインデックス
     * @param opacity 不透明度
     */
    setPartOpacityByIndex(partIndex, opacity) {
      if (this._notExistPartOpacities.isExist(partIndex)) {
        this._notExistPartOpacities.setValue(partIndex, opacity);
        return;
      }
      CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
      this._partOpacities[partIndex] = opacity;
    }
    /**
     * パーツの不透明度の設定(Id)
     * @param partId パーツのID
     * @param opacity パーツの不透明度
     */
    setPartOpacityById(partId, opacity) {
      const index = this.getPartIndex(partId);
      if (index < 0) {
        return;
      }
      this.setPartOpacityByIndex(index, opacity);
    }
    /**
     * パーツの不透明度の取得(index)
     * @param partIndex パーツのインデックス
     * @return パーツの不透明度
     */
    getPartOpacityByIndex(partIndex) {
      if (this._notExistPartOpacities.isExist(partIndex)) {
        return this._notExistPartOpacities.getValue(partIndex);
      }
      CSM_ASSERT(0 <= partIndex && partIndex < this.getPartCount());
      return this._partOpacities[partIndex];
    }
    /**
     * パーツの不透明度の取得(id)
     * @param partId パーツのＩｄ
     * @return パーツの不透明度
     */
    getPartOpacityById(partId) {
      const index = this.getPartIndex(partId);
      if (index < 0) {
        return 0;
      }
      return this.getPartOpacityByIndex(index);
    }
    /**
     * パラメータのインデックスの取得
     * @param パラメータID
     * @return パラメータのインデックス
     */
    getParameterIndex(parameterId) {
      let parameterIndex;
      const idCount = this._model.parameters.count;
      for (parameterIndex = 0; parameterIndex < idCount; ++parameterIndex) {
        if (parameterId != this._parameterIds.at(parameterIndex)) {
          continue;
        }
        return parameterIndex;
      }
      if (this._notExistParameterId.isExist(parameterId)) {
        return this._notExistParameterId.getValue(parameterId);
      }
      parameterIndex = this._model.parameters.count + this._notExistParameterId.getSize();
      this._notExistParameterId.setValue(parameterId, parameterIndex);
      this._notExistParameterValues.appendKey(parameterIndex);
      return parameterIndex;
    }
    /**
     * パラメータの個数の取得
     * @return パラメータの個数
     */
    getParameterCount() {
      return this._model.parameters.count;
    }
    /**
     * パラメータの種類の取得
     * @param parameterIndex パラメータのインデックス
     * @return csmParameterType_Normal -> 通常のパラメータ
     *          csmParameterType_BlendShape -> ブレンドシェイプパラメータ
     */
    getParameterType(parameterIndex) {
      return this._model.parameters.types[parameterIndex];
    }
    /**
     * パラメータの最大値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最大値
     */
    getParameterMaximumValue(parameterIndex) {
      return this._model.parameters.maximumValues[parameterIndex];
    }
    /**
     * パラメータの最小値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータの最小値
     */
    getParameterMinimumValue(parameterIndex) {
      return this._model.parameters.minimumValues[parameterIndex];
    }
    /**
     * パラメータのデフォルト値の取得
     * @param parameterIndex パラメータのインデックス
     * @return パラメータのデフォルト値
     */
    getParameterDefaultValue(parameterIndex) {
      return this._model.parameters.defaultValues[parameterIndex];
    }
    /**
     * 指定したパラメータindexのIDを取得
     *
     * @param parameterIndex パラメータのインデックス
     * @returns パラメータID
     */
    getParameterId(parameterIndex) {
      return CubismFramework.getIdManager().getId(
        this._model.parameters.ids[parameterIndex]
      );
    }
    /**
     * パラメータの値の取得
     * @param parameterIndex    パラメータのインデックス
     * @return パラメータの値
     */
    getParameterValueByIndex(parameterIndex) {
      if (this._notExistParameterValues.isExist(parameterIndex)) {
        return this._notExistParameterValues.getValue(parameterIndex);
      }
      CSM_ASSERT(
        0 <= parameterIndex && parameterIndex < this.getParameterCount()
      );
      return this._parameterValues[parameterIndex];
    }
    /**
     * パラメータの値の取得
     * @param parameterId    パラメータのID
     * @return パラメータの値
     */
    getParameterValueById(parameterId) {
      const parameterIndex = this.getParameterIndex(parameterId);
      return this.getParameterValueByIndex(parameterIndex);
    }
    /**
     * パラメータの値の設定
     * @param parameterIndex パラメータのインデックス
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueByIndex(parameterIndex, value, weight = 1) {
      if (this._notExistParameterValues.isExist(parameterIndex)) {
        this._notExistParameterValues.setValue(
          parameterIndex,
          weight == 1 ? value : this._notExistParameterValues.getValue(parameterIndex) * (1 - weight) + value * weight
        );
        return;
      }
      CSM_ASSERT(
        0 <= parameterIndex && parameterIndex < this.getParameterCount()
      );
      if (this._model.parameters.maximumValues[parameterIndex] < value) {
        value = this._model.parameters.maximumValues[parameterIndex];
      }
      if (this._model.parameters.minimumValues[parameterIndex] > value) {
        value = this._model.parameters.minimumValues[parameterIndex];
      }
      this._parameterValues[parameterIndex] = weight == 1 ? value : this._parameterValues[parameterIndex] = this._parameterValues[parameterIndex] * (1 - weight) + value * weight;
    }
    /**
     * パラメータの値の設定
     * @param parameterId パラメータのID
     * @param value パラメータの値
     * @param weight 重み
     */
    setParameterValueById(parameterId, value, weight = 1) {
      const index = this.getParameterIndex(parameterId);
      this.setParameterValueByIndex(index, value, weight);
    }
    /**
     * パラメータの値の加算(index)
     * @param parameterIndex パラメータインデックス
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueByIndex(parameterIndex, value, weight = 1) {
      this.setParameterValueByIndex(
        parameterIndex,
        this.getParameterValueByIndex(parameterIndex) + value * weight
      );
    }
    /**
     * パラメータの値の加算(id)
     * @param parameterId パラメータＩＤ
     * @param value 加算する値
     * @param weight 重み
     */
    addParameterValueById(parameterId, value, weight = 1) {
      const index = this.getParameterIndex(parameterId);
      this.addParameterValueByIndex(index, value, weight);
    }
    /**
     * パラメータの値の乗算
     * @param parameterId パラメータのID
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueById(parameterId, value, weight = 1) {
      const index = this.getParameterIndex(parameterId);
      this.multiplyParameterValueByIndex(index, value, weight);
    }
    /**
     * パラメータの値の乗算
     * @param parameterIndex パラメータのインデックス
     * @param value 乗算する値
     * @param weight 重み
     */
    multiplyParameterValueByIndex(parameterIndex, value, weight = 1) {
      this.setParameterValueByIndex(
        parameterIndex,
        this.getParameterValueByIndex(parameterIndex) * (1 + (value - 1) * weight)
      );
    }
    /**
     * Drawableのインデックスの取得
     * @param drawableId DrawableのID
     * @return Drawableのインデックス
     */
    getDrawableIndex(drawableId) {
      const drawableCount = this._model.drawables.count;
      for (let drawableIndex = 0; drawableIndex < drawableCount; ++drawableIndex) {
        if (this._drawableIds.at(drawableIndex) == drawableId) {
          return drawableIndex;
        }
      }
      return -1;
    }
    /**
     * Drawableの個数の取得
     * @return drawableの個数
     */
    getDrawableCount() {
      const drawableCount = this._model.drawables.count;
      return drawableCount;
    }
    /**
     * DrawableのIDを取得する
     * @param drawableIndex Drawableのインデックス
     * @return drawableのID
     */
    getDrawableId(drawableIndex) {
      const parameterIds = this._model.drawables.ids;
      return CubismFramework.getIdManager().getId(parameterIds[drawableIndex]);
    }
    /**
     * Drawableの描画順リストの取得
     * @return Drawableの描画順リスト
     */
    getDrawableRenderOrders() {
      const renderOrders = this._model.drawables.renderOrders;
      return renderOrders;
    }
    /**
     * @deprecated
     * 関数名が誤っていたため、代替となる getDrawableTextureIndex を追加し、この関数は非推奨となりました。
     *
     * Drawableのテクスチャインデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックスリスト
     */
    getDrawableTextureIndices(drawableIndex) {
      return this.getDrawableTextureIndex(drawableIndex);
    }
    /**
     * Drawableのテクスチャインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのテクスチャインデックス
     */
    getDrawableTextureIndex(drawableIndex) {
      const textureIndices = this._model.drawables.textureIndices;
      return textureIndices[drawableIndex];
    }
    /**
     * DrawableのVertexPositionsの変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの頂点情報が変化したかを取得する。
     *
     * @param   drawableIndex   Drawableのインデックス
     * @retval  true    Drawableの頂点情報が直近のCubismModel.update関数で変化した
     * @retval  false   Drawableの頂点情報が直近のCubismModel.update関数で変化していない
     */
    getDrawableDynamicFlagVertexPositionsDidChange(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasVertexPositionsDidChangeBit(
        dynamicFlags[drawableIndex]
      );
    }
    /**
     * Drawableの頂点インデックスの個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスの個数
     */
    getDrawableVertexIndexCount(drawableIndex) {
      const indexCounts = this._model.drawables.indexCounts;
      return indexCounts[drawableIndex];
    }
    /**
     * Drawableの頂点の個数の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点の個数
     */
    getDrawableVertexCount(drawableIndex) {
      const vertexCounts = this._model.drawables.vertexCounts;
      return vertexCounts[drawableIndex];
    }
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertices(drawableIndex) {
      return this.getDrawableVertexPositions(drawableIndex);
    }
    /**
     * Drawableの頂点インデックスリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点インデックスリスト
     */
    getDrawableVertexIndices(drawableIndex) {
      const indicesArray = this._model.drawables.indices;
      return indicesArray[drawableIndex];
    }
    /**
     * Drawableの頂点リストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点リスト
     */
    getDrawableVertexPositions(drawableIndex) {
      const verticesArray = this._model.drawables.vertexPositions;
      return verticesArray[drawableIndex];
    }
    /**
     * Drawableの頂点のUVリストの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの頂点UVリスト
     */
    getDrawableVertexUvs(drawableIndex) {
      const uvsArray = this._model.drawables.vertexUvs;
      return uvsArray[drawableIndex];
    }
    /**
     * Drawableの不透明度の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの不透明度
     */
    getDrawableOpacity(drawableIndex) {
      const opacities = this._model.drawables.opacities;
      return opacities[drawableIndex];
    }
    /**
     * Drawableの乗算色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの乗算色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableMultiplyColor(drawableIndex) {
      const multiplyColors = this._model.drawables.multiplyColors;
      const index = drawableIndex * 4;
      const multiplyColor = new CubismTextureColor();
      multiplyColor.r = multiplyColors[index];
      multiplyColor.g = multiplyColors[index + 1];
      multiplyColor.b = multiplyColors[index + 2];
      multiplyColor.a = multiplyColors[index + 3];
      return multiplyColor;
    }
    /**
     * Drawableのスクリーン色の取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのスクリーン色(RGBA)
     * スクリーン色はRGBAで取得されるが、Aは必ず0
     */
    getDrawableScreenColor(drawableIndex) {
      const screenColors = this._model.drawables.screenColors;
      const index = drawableIndex * 4;
      const screenColor = new CubismTextureColor();
      screenColor.r = screenColors[index];
      screenColor.g = screenColors[index + 1];
      screenColor.b = screenColors[index + 2];
      screenColor.a = screenColors[index + 3];
      return screenColor;
    }
    /**
     * Drawableの親パーツのインデックスの取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableの親パーツのインデックス
     */
    getDrawableParentPartIndex(drawableIndex) {
      return this._model.drawables.parentPartIndices[drawableIndex];
    }
    /**
     * Drawableのブレンドモードを取得
     * @param drawableIndex Drawableのインデックス
     * @return drawableのブレンドモード
     */
    getDrawableBlendMode(drawableIndex) {
      const constantFlags = this._model.drawables.constantFlags;
      return Live2DCubismCore.Utils.hasBlendAdditiveBit(
        constantFlags[drawableIndex]
      ) ? 1 /* CubismBlendMode_Additive */ : Live2DCubismCore.Utils.hasBlendMultiplicativeBit(
        constantFlags[drawableIndex]
      ) ? 2 /* CubismBlendMode_Multiplicative */ : 0 /* CubismBlendMode_Normal */;
    }
    /**
     * Drawableのマスクの反転使用の取得
     *
     * Drawableのマスク使用時の反転設定を取得する。
     * マスクを使用しない場合は無視される。
     *
     * @param drawableIndex Drawableのインデックス
     * @return Drawableの反転設定
     */
    getDrawableInvertedMaskBit(drawableIndex) {
      const constantFlags = this._model.drawables.constantFlags;
      return Live2DCubismCore.Utils.hasIsInvertedMaskBit(
        constantFlags[drawableIndex]
      );
    }
    /**
     * Drawableのクリッピングマスクリストの取得
     * @return Drawableのクリッピングマスクリスト
     */
    getDrawableMasks() {
      const masks = this._model.drawables.masks;
      return masks;
    }
    /**
     * Drawableのクリッピングマスクの個数リストの取得
     * @return Drawableのクリッピングマスクの個数リスト
     */
    getDrawableMaskCounts() {
      const maskCounts = this._model.drawables.maskCounts;
      return maskCounts;
    }
    /**
     * クリッピングマスクの使用状態
     *
     * @return true クリッピングマスクを使用している
     * @return false クリッピングマスクを使用していない
     */
    isUsingMasking() {
      for (let d = 0; d < this._model.drawables.count; ++d) {
        if (this._model.drawables.maskCounts[d] <= 0) {
          continue;
        }
        return true;
      }
      return false;
    }
    /**
     * Drawableの表示情報を取得する
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableが表示
     * @return false Drawableが非表示
     */
    getDrawableDynamicFlagIsVisible(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasIsVisibleBit(dynamicFlags[drawableIndex]);
    }
    /**
     * DrawableのDrawOrderの変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableのdrawOrderが変化したかを取得する。
     * drawOrderはartMesh上で指定する0から1000の情報
     * @param drawableIndex drawableのインデックス
     * @return true drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false drawableの不透明度が直近のCubismModel.update関数で変化している
     */
    getDrawableDynamicFlagVisibilityDidChange(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasVisibilityDidChangeBit(
        dynamicFlags[drawableIndex]
      );
    }
    /**
     * Drawableの不透明度の変化情報の取得
     *
     * 直近のCubismModel.update関数でdrawableの不透明度が変化したかを取得する。
     *
     * @param drawableIndex drawableのインデックス
     * @return true Drawableの不透明度が直近のCubismModel.update関数で変化した
     * @return false Drawableの不透明度が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagOpacityDidChange(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasOpacityDidChangeBit(
        dynamicFlags[drawableIndex]
      );
    }
    /**
     * Drawableの描画順序の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの描画の順序が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの描画の順序が直近のCubismModel.update関数で変化した
     * @return false Drawableの描画の順序が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagRenderOrderDidChange(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasRenderOrderDidChangeBit(
        dynamicFlags[drawableIndex]
      );
    }
    /**
     * Drawableの乗算色・スクリーン色の変化情報の取得
     *
     * 直近のCubismModel.update関数でDrawableの乗算色・スクリーン色が変化したかを取得する。
     *
     * @param drawableIndex Drawableのインデックス
     * @return true Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化した
     * @return false Drawableの乗算色・スクリーン色が直近のCubismModel.update関数で変化してない
     */
    getDrawableDynamicFlagBlendColorDidChange(drawableIndex) {
      const dynamicFlags = this._model.drawables.dynamicFlags;
      return Live2DCubismCore.Utils.hasBlendColorDidChangeBit(
        dynamicFlags[drawableIndex]
      );
    }
    /**
     * 保存されたパラメータの読み込み
     */
    loadParameters() {
      let parameterCount = this._model.parameters.count;
      const savedParameterCount = this._savedParameters.getSize();
      if (parameterCount > savedParameterCount) {
        parameterCount = savedParameterCount;
      }
      for (let i = 0; i < parameterCount; ++i) {
        this._parameterValues[i] = this._savedParameters.at(i);
      }
    }
    /**
     * 初期化する
     */
    initialize() {
      CSM_ASSERT(this._model);
      this._parameterValues = this._model.parameters.values;
      this._partOpacities = this._model.parts.opacities;
      this._parameterMaximumValues = this._model.parameters.maximumValues;
      this._parameterMinimumValues = this._model.parameters.minimumValues;
      {
        const parameterIds = this._model.parameters.ids;
        const parameterCount = this._model.parameters.count;
        this._parameterIds.prepareCapacity(parameterCount);
        for (let i = 0; i < parameterCount; ++i) {
          this._parameterIds.pushBack(
            CubismFramework.getIdManager().getId(parameterIds[i])
          );
        }
      }
      const partCount = this._model.parts.count;
      {
        const partIds = this._model.parts.ids;
        this._partIds.prepareCapacity(partCount);
        for (let i = 0; i < partCount; ++i) {
          this._partIds.pushBack(
            CubismFramework.getIdManager().getId(partIds[i])
          );
        }
        this._userPartMultiplyColors.prepareCapacity(partCount);
        this._userPartScreenColors.prepareCapacity(partCount);
        this._partChildDrawables.prepareCapacity(partCount);
      }
      {
        const drawableIds = this._model.drawables.ids;
        const drawableCount = this._model.drawables.count;
        this._userMultiplyColors.prepareCapacity(drawableCount);
        this._userScreenColors.prepareCapacity(drawableCount);
        this._userCullings.prepareCapacity(drawableCount);
        const userCulling = new DrawableCullingData(
          false,
          false
        );
        {
          for (let i = 0; i < partCount; ++i) {
            const multiplyColor = new CubismTextureColor(
              1,
              1,
              1,
              1
            );
            const screenColor = new CubismTextureColor(
              0,
              0,
              0,
              1
            );
            const userMultiplyColor = new PartColorData(
              false,
              multiplyColor
            );
            const userScreenColor = new PartColorData(
              false,
              screenColor
            );
            this._userPartMultiplyColors.pushBack(userMultiplyColor);
            this._userPartScreenColors.pushBack(userScreenColor);
            this._partChildDrawables.pushBack(new csmVector());
            this._partChildDrawables.at(i).prepareCapacity(drawableCount);
          }
        }
        {
          for (let i = 0; i < drawableCount; ++i) {
            const multiplyColor = new CubismTextureColor(
              1,
              1,
              1,
              1
            );
            const screenColor = new CubismTextureColor(
              0,
              0,
              0,
              1
            );
            const userMultiplyColor = new DrawableColorData(
              false,
              multiplyColor
            );
            const userScreenColor = new DrawableColorData(
              false,
              screenColor
            );
            this._drawableIds.pushBack(
              CubismFramework.getIdManager().getId(drawableIds[i])
            );
            this._userMultiplyColors.pushBack(userMultiplyColor);
            this._userScreenColors.pushBack(userScreenColor);
            this._userCullings.pushBack(userCulling);
            const parentIndex = this.getDrawableParentPartIndex(i);
            if (parentIndex >= 0) {
              this._partChildDrawables.at(parentIndex).pushBack(i);
            }
          }
        }
      }
    }
    /**
     * コンストラクタ
     * @param model モデル
     */
    constructor(model) {
      this._model = model;
      this._parameterValues = null;
      this._parameterMaximumValues = null;
      this._parameterMinimumValues = null;
      this._partOpacities = null;
      this._savedParameters = new csmVector();
      this._parameterIds = new csmVector();
      this._drawableIds = new csmVector();
      this._partIds = new csmVector();
      this._isOverwrittenModelMultiplyColors = false;
      this._isOverwrittenModelScreenColors = false;
      this._isOverwrittenCullings = false;
      this._modelOpacity = 1;
      this._userMultiplyColors = new csmVector();
      this._userScreenColors = new csmVector();
      this._userCullings = new csmVector();
      this._userPartMultiplyColors = new csmVector();
      this._userPartScreenColors = new csmVector();
      this._partChildDrawables = new csmVector();
      this._notExistPartId = new csmMap();
      this._notExistParameterId = new csmMap();
      this._notExistParameterValues = new csmMap();
      this._notExistPartOpacities = new csmMap();
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      this._model.release();
      this._model = null;
    }
    // カリング設定の配列
  };
  var Live2DCubismFramework33;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismModel = CubismModel;
  })(Live2DCubismFramework33 || (Live2DCubismFramework33 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/model/cubismmoc.ts
  var CubismMoc = class _CubismMoc {
    /**
     * Mocデータの作成
     */
    static create(mocBytes, shouldCheckMocConsistency) {
      let cubismMoc = null;
      if (shouldCheckMocConsistency) {
        const consistency = this.hasMocConsistency(mocBytes);
        if (!consistency) {
          CubismLogError(`Inconsistent MOC3.`);
          return cubismMoc;
        }
      }
      const moc = Live2DCubismCore.Moc.fromArrayBuffer(mocBytes);
      if (moc) {
        cubismMoc = new _CubismMoc(moc);
        cubismMoc._mocVersion = Live2DCubismCore.Version.csmGetMocVersion(
          moc,
          mocBytes
        );
      }
      return cubismMoc;
    }
    /**
     * Mocデータを削除
     *
     * Mocデータを削除する
     */
    static delete(moc) {
      moc._moc._release();
      moc._moc = null;
      moc = null;
    }
    /**
     * モデルを作成する
     *
     * @return Mocデータから作成されたモデル
     */
    createModel() {
      let cubismModel = null;
      const model = Live2DCubismCore.Model.fromMoc(
        this._moc
      );
      if (model) {
        cubismModel = new CubismModel(model);
        cubismModel.initialize();
        ++this._modelCount;
      }
      return cubismModel;
    }
    /**
     * モデルを削除する
     */
    deleteModel(model) {
      if (model != null) {
        model.release();
        model = null;
        --this._modelCount;
      }
    }
    /**
     * コンストラクタ
     */
    constructor(moc) {
      this._moc = moc;
      this._modelCount = 0;
      this._mocVersion = 0;
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      CSM_ASSERT(this._modelCount == 0);
      this._moc._release();
      this._moc = null;
    }
    /**
     * 最新の.moc3 Versionを取得
     */
    getLatestMocVersion() {
      return Live2DCubismCore.Version.csmGetLatestMocVersion();
    }
    /**
     * 読み込んだモデルの.moc3 Versionを取得
     */
    getMocVersion() {
      return this._mocVersion;
    }
    /**
     * .moc3 の整合性を検証する
     */
    static hasMocConsistency(mocBytes) {
      const isConsistent = Live2DCubismCore.Moc.prototype.hasMocConsistency(mocBytes);
      return isConsistent === 1 ? true : false;
    }
    // 読み込んだモデルの.moc3 Version
  };
  var Live2DCubismFramework34;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismMoc = CubismMoc;
  })(Live2DCubismFramework34 || (Live2DCubismFramework34 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/model/cubismmodeluserdatajson.ts
  var Meta3 = "Meta";
  var UserDataCount2 = "UserDataCount";
  var TotalUserDataSize2 = "TotalUserDataSize";
  var UserData2 = "UserData";
  var Target2 = "Target";
  var Id4 = "Id";
  var Value6 = "Value";
  var CubismModelUserDataJson = class {
    /**
     * コンストラクタ
     * @param buffer    userdata3.jsonが読み込まれているバッファ
     * @param size      バッファのサイズ
     */
    constructor(buffer, size) {
      this._json = CubismJson.create(buffer, size);
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      CubismJson.delete(this._json);
    }
    /**
     * ユーザーデータ個数の取得
     * @return ユーザーデータの個数
     */
    getUserDataCount() {
      return this._json.getRoot().getValueByString(Meta3).getValueByString(UserDataCount2).toInt();
    }
    /**
     * ユーザーデータ総文字列数の取得
     *
     * @return ユーザーデータ総文字列数
     */
    getTotalUserDataSize() {
      return this._json.getRoot().getValueByString(Meta3).getValueByString(TotalUserDataSize2).toInt();
    }
    /**
     * ユーザーデータのタイプの取得
     *
     * @return ユーザーデータのタイプ
     */
    getUserDataTargetType(i) {
      return this._json.getRoot().getValueByString(UserData2).getValueByIndex(i).getValueByString(Target2).getRawString();
    }
    /**
     * ユーザーデータのターゲットIDの取得
     *
     * @param i インデックス
     * @return ユーザーデータターゲットID
     */
    getUserDataId(i) {
      return CubismFramework.getIdManager().getId(
        this._json.getRoot().getValueByString(UserData2).getValueByIndex(i).getValueByString(Id4).getRawString()
      );
    }
    /**
     * ユーザーデータの文字列の取得
     *
     * @param i インデックス
     * @return ユーザーデータ
     */
    getUserDataValue(i) {
      return this._json.getRoot().getValueByString(UserData2).getValueByIndex(i).getValueByString(Value6).getRawString();
    }
  };
  var Live2DCubismFramework35;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismModelUserDataJson = CubismModelUserDataJson;
  })(Live2DCubismFramework35 || (Live2DCubismFramework35 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/model/cubismmodeluserdata.ts
  var ArtMesh = "ArtMesh";
  var CubismModelUserDataNode = class {
    // ユーザーデータ
  };
  var CubismModelUserData = class _CubismModelUserData {
    /**
     * インスタンスの作成
     *
     * @param buffer    userdata3.jsonが読み込まれているバッファ
     * @param size      バッファのサイズ
     * @return 作成されたインスタンス
     */
    static create(buffer, size) {
      const ret = new _CubismModelUserData();
      ret.parseUserData(buffer, size);
      return ret;
    }
    /**
     * インスタンスを破棄する
     *
     * @param modelUserData 破棄するインスタンス
     */
    static delete(modelUserData) {
      if (modelUserData != null) {
        modelUserData.release();
        modelUserData = null;
      }
    }
    /**
     * ArtMeshのユーザーデータのリストの取得
     *
     * @return ユーザーデータリスト
     */
    getArtMeshUserDatas() {
      return this._artMeshUserDataNode;
    }
    /**
     * userdata3.jsonのパース
     *
     * @param buffer    userdata3.jsonが読み込まれているバッファ
     * @param size      バッファのサイズ
     */
    parseUserData(buffer, size) {
      let json = new CubismModelUserDataJson(
        buffer,
        size
      );
      if (!json) {
        json.release();
        json = void 0;
        return;
      }
      const typeOfArtMesh = CubismFramework.getIdManager().getId(ArtMesh);
      const nodeCount = json.getUserDataCount();
      for (let i = 0; i < nodeCount; i++) {
        const addNode = new CubismModelUserDataNode();
        addNode.targetId = json.getUserDataId(i);
        addNode.targetType = CubismFramework.getIdManager().getId(
          json.getUserDataTargetType(i)
        );
        addNode.value = new csmString(json.getUserDataValue(i));
        this._userDataNodes.pushBack(addNode);
        if (addNode.targetType == typeOfArtMesh) {
          this._artMeshUserDataNode.pushBack(addNode);
        }
      }
      json.release();
      json = void 0;
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._userDataNodes = new csmVector();
      this._artMeshUserDataNode = new csmVector();
    }
    /**
     * デストラクタ相当の処理
     *
     * ユーザーデータ構造体配列を解放する
     */
    release() {
      for (let i = 0; i < this._userDataNodes.getSize(); ++i) {
        this._userDataNodes.set(i, null);
      }
      this._userDataNodes = null;
    }
    // 閲覧リストの保持
  };
  var Live2DCubismFramework36;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismModelUserData = CubismModelUserData;
    Live2DCubismFramework40.CubismModelUserDataNode = CubismModelUserDataNode;
  })(Live2DCubismFramework36 || (Live2DCubismFramework36 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/model/cubismusermodel.ts
  var CubismUserModel = class _CubismUserModel {
    /**
     * 初期化状態の取得
     *
     * 初期化されている状態か？
     *
     * @return true     初期化されている
     * @return false    初期化されていない
     */
    isInitialized() {
      return this._initialized;
    }
    /**
     * 初期化状態の設定
     *
     * 初期化状態を設定する。
     *
     * @param v 初期化状態
     */
    setInitialized(v) {
      this._initialized = v;
    }
    /**
     * 更新状態の取得
     *
     * 更新されている状態か？
     *
     * @return true     更新されている
     * @return false    更新されていない
     */
    isUpdating() {
      return this._updating;
    }
    /**
     * 更新状態の設定
     *
     * 更新状態を設定する
     *
     * @param v 更新状態
     */
    setUpdating(v) {
      this._updating = v;
    }
    /**
     * マウスドラッグ情報の設定
     * @param ドラッグしているカーソルのX位置
     * @param ドラッグしているカーソルのY位置
     */
    setDragging(x, y) {
      this._dragManager.set(x, y);
    }
    /**
     * 加速度の情報を設定する
     * @param x X軸方向の加速度
     * @param y Y軸方向の加速度
     * @param z Z軸方向の加速度
     */
    setAcceleration(x, y, z) {
      this._accelerationX = x;
      this._accelerationY = y;
      this._accelerationZ = z;
    }
    /**
     * モデル行列を取得する
     * @return モデル行列
     */
    getModelMatrix() {
      return this._modelMatrix;
    }
    /**
     * 不透明度の設定
     * @param a 不透明度
     */
    setOpacity(a) {
      this._opacity = a;
    }
    /**
     * 不透明度の取得
     * @return 不透明度
     */
    getOpacity() {
      return this._opacity;
    }
    /**
     * モデルデータを読み込む
     *
     * @param buffer    moc3ファイルが読み込まれているバッファ
     */
    loadModel(buffer, shouldCheckMocConsistency = false) {
      this._moc = CubismMoc.create(buffer, shouldCheckMocConsistency);
      if (this._moc == null) {
        CubismLogError("Failed to CubismMoc.create().");
        return;
      }
      this._model = this._moc.createModel();
      if (this._model == null) {
        CubismLogError("Failed to CreateModel().");
        return;
      }
      this._model.saveParameters();
      this._modelMatrix = new CubismModelMatrix(
        this._model.getCanvasWidth(),
        this._model.getCanvasHeight()
      );
    }
    /**
     * モーションデータを読み込む
     * @param buffer motion3.jsonファイルが読み込まれているバッファ
     * @param size バッファのサイズ
     * @param name モーションの名前
     * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
     * @return モーションクラス
     */
    loadMotion(buffer, size, name, onFinishedMotionHandler) {
      if (buffer == null || size == 0) {
        CubismLogError("Failed to loadMotion().");
        return null;
      }
      return CubismMotion.create(buffer, size, onFinishedMotionHandler);
    }
    /**
     * 表情データの読み込み
     * @param buffer expファイルが読み込まれているバッファ
     * @param size バッファのサイズ
     * @param name 表情の名前
     */
    loadExpression(buffer, size, name) {
      if (buffer == null || size == 0) {
        CubismLogError("Failed to loadExpression().");
        return null;
      }
      return CubismExpressionMotion.create(buffer, size);
    }
    /**
     * ポーズデータの読み込み
     * @param buffer pose3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     */
    loadPose(buffer, size) {
      if (buffer == null || size == 0) {
        CubismLogError("Failed to loadPose().");
        return;
      }
      this._pose = CubismPose.create(buffer, size);
    }
    /**
     * モデルに付属するユーザーデータを読み込む
     * @param buffer userdata3.jsonが読み込まれているバッファ
     * @param size バッファのサイズ
     */
    loadUserData(buffer, size) {
      if (buffer == null || size == 0) {
        CubismLogError("Failed to loadUserData().");
        return;
      }
      this._modelUserData = CubismModelUserData.create(buffer, size);
    }
    /**
     * 物理演算データの読み込み
     * @param buffer  physics3.jsonが読み込まれているバッファ
     * @param size    バッファのサイズ
     */
    loadPhysics(buffer, size) {
      if (buffer == null || size == 0) {
        CubismLogError("Failed to loadPhysics().");
        return;
      }
      this._physics = CubismPhysics.create(buffer, size);
    }
    /**
     * 当たり判定の取得
     * @param drawableId 検証したいDrawableのID
     * @param pointX X位置
     * @param pointY Y位置
     * @return true ヒットしている
     * @return false ヒットしていない
     */
    isHit(drawableId, pointX, pointY) {
      const drawIndex = this._model.getDrawableIndex(drawableId);
      if (drawIndex < 0) {
        return false;
      }
      const count = this._model.getDrawableVertexCount(drawIndex);
      const vertices = this._model.getDrawableVertices(drawIndex);
      let left = vertices[0];
      let right = vertices[0];
      let top = vertices[1];
      let bottom = vertices[1];
      for (let j = 1; j < count; ++j) {
        const x = vertices[Constant.vertexOffset + j * Constant.vertexStep];
        const y = vertices[Constant.vertexOffset + j * Constant.vertexStep + 1];
        if (x < left) {
          left = x;
        }
        if (x > right) {
          right = x;
        }
        if (y < top) {
          top = y;
        }
        if (y > bottom) {
          bottom = y;
        }
      }
      const tx = this._modelMatrix.invertTransformX(pointX);
      const ty = this._modelMatrix.invertTransformY(pointY);
      return left <= tx && tx <= right && top <= ty && ty <= bottom;
    }
    /**
     * モデルの取得
     * @return モデル
     */
    getModel() {
      return this._model;
    }
    /**
     * レンダラの取得
     * @return レンダラ
     */
    getRenderer() {
      return this._renderer;
    }
    /**
     * レンダラを作成して初期化を実行する
     * @param maskBufferCount バッファの生成数
     */
    createRenderer(maskBufferCount = 1) {
      if (this._renderer) {
        this.deleteRenderer();
      }
      this._renderer = new CubismRenderer_WebGL();
      this._renderer.initialize(this._model, maskBufferCount);
    }
    /**
     * レンダラの解放
     */
    deleteRenderer() {
      if (this._renderer != null) {
        this._renderer.release();
        this._renderer = null;
      }
    }
    /**
     * イベント発火時の標準処理
     *
     * Eventが再生処理時にあった場合の処理をする。
     * 継承で上書きすることを想定している。
     * 上書きしない場合はログ出力をする。
     *
     * @param eventValue 発火したイベントの文字列データ
     */
    motionEventFired(eventValue) {
      CubismLogInfo("{0}", eventValue.s);
    }
    /**
     * イベント用のコールバック
     *
     * CubismMotionQueueManagerにイベント用に登録するためのCallback。
     * CubismUserModelの継承先のEventFiredを呼ぶ。
     *
     * @param caller 発火したイベントを管理していたモーションマネージャー、比較用
     * @param eventValue 発火したイベントの文字列データ
     * @param customData CubismUserModelを継承したインスタンスを想定
     */
    static cubismDefaultMotionEventCallback(caller, eventValue, customData) {
      const model = customData;
      if (model != null) {
        model.motionEventFired(eventValue);
      }
    }
    /**
     * コンストラクタ
     */
    constructor() {
      this._moc = null;
      this._model = null;
      this._motionManager = null;
      this._expressionManager = null;
      this._eyeBlink = null;
      this._breath = null;
      this._modelMatrix = null;
      this._pose = null;
      this._dragManager = null;
      this._physics = null;
      this._modelUserData = null;
      this._initialized = false;
      this._updating = false;
      this._opacity = 1;
      this._lipsync = true;
      this._lastLipSyncValue = 0;
      this._dragX = 0;
      this._dragY = 0;
      this._accelerationX = 0;
      this._accelerationY = 0;
      this._accelerationZ = 0;
      this._mocConsistency = false;
      this._debugMode = false;
      this._renderer = null;
      this._motionManager = new CubismMotionManager();
      this._motionManager.setEventCallback(
        _CubismUserModel.cubismDefaultMotionEventCallback,
        this
      );
      this._expressionManager = new CubismExpressionMotionManager();
      this._dragManager = new CubismTargetPoint();
    }
    /**
     * デストラクタに相当する処理
     */
    release() {
      if (this._motionManager != null) {
        this._motionManager.release();
        this._motionManager = null;
      }
      if (this._expressionManager != null) {
        this._expressionManager.release();
        this._expressionManager = null;
      }
      if (this._moc != null) {
        this._moc.deleteModel(this._model);
        this._moc.release();
        this._moc = null;
      }
      this._modelMatrix = null;
      CubismPose.delete(this._pose);
      CubismEyeBlink.delete(this._eyeBlink);
      CubismBreath.delete(this._breath);
      this._dragManager = null;
      CubismPhysics.delete(this._physics);
      CubismModelUserData.delete(this._modelUserData);
      this.deleteRenderer();
    }
    // レンダラ
  };
  var Live2DCubismFramework37;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismUserModel = CubismUserModel;
  })(Live2DCubismFramework37 || (Live2DCubismFramework37 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/icubismmodelsetting.ts
  var ICubismModelSetting = class {
  };
  var Live2DCubismFramework38;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.ICubismModelSetting = ICubismModelSetting;
  })(Live2DCubismFramework38 || (Live2DCubismFramework38 = {}));

  // desktop-pet/_sdk/samples2/Framework/src/cubismmodelsettingjson.ts
  var FileReferences = "FileReferences";
  var Groups2 = "Groups";
  var Layout = "Layout";
  var HitAreas = "HitAreas";
  var Moc = "Moc";
  var Textures = "Textures";
  var Physics = "Physics";
  var Pose = "Pose";
  var Expressions = "Expressions";
  var Motions = "Motions";
  var UserData3 = "UserData";
  var Name = "Name";
  var FilePath = "File";
  var Id5 = "Id";
  var Ids = "Ids";
  var SoundPath = "Sound";
  var FadeInTime2 = "FadeInTime";
  var FadeOutTime2 = "FadeOutTime";
  var LipSync = "LipSync";
  var EyeBlink = "EyeBlink";
  var CubismModelSettingJson = class extends ICubismModelSetting {
    /**
     * 引数付きコンストラクタ
     *
     * @param buffer    Model3Jsonをバイト配列として読み込んだデータバッファ
     * @param size      Model3Jsonのデータサイズ
     */
    constructor(buffer, size) {
      super();
      this._json = CubismJson.create(buffer, size);
      if (this.getJson()) {
        this._jsonValue = new csmVector();
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(Groups2)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Moc)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Motions)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Expressions)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Textures)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Physics)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(FileReferences).getValueByString(Pose)
        );
        this._jsonValue.pushBack(
          this.getJson().getRoot().getValueByString(HitAreas)
        );
      }
    }
    /**
     * デストラクタ相当の処理
     */
    release() {
      CubismJson.delete(this._json);
      this._jsonValue = null;
    }
    /**
     * CubismJsonオブジェクトを取得する
     *
     * @return CubismJson
     */
    getJson() {
      return this._json;
    }
    /**
     * Mocファイルの名前を取得する
     * @return Mocファイルの名前
     */
    getModelFileName() {
      if (!this.isExistModelFile()) {
        return "";
      }
      return this._jsonValue.at(1 /* FrequestNode_Moc */).getRawString();
    }
    /**
     * モデルが使用するテクスチャの数を取得する
     * テクスチャの数
     */
    getTextureCount() {
      if (!this.isExistTextureFiles()) {
        return 0;
      }
      return this._jsonValue.at(4 /* FrequestNode_Textures */).getSize();
    }
    /**
     * テクスチャが配置されたディレクトリの名前を取得する
     * @return テクスチャが配置されたディレクトリの名前
     */
    getTextureDirectory() {
      const texturePath = this._jsonValue.at(4 /* FrequestNode_Textures */).getValueByIndex(0).getRawString();
      const pathArray = texturePath.split("/");
      const arrayLength = pathArray.length - 1;
      let textureDirectoryStr = "";
      for (let i = 0; i < arrayLength; i++) {
        textureDirectoryStr += pathArray[i];
        if (i < arrayLength - 1) {
          textureDirectoryStr += "/";
        }
      }
      return textureDirectoryStr;
    }
    /**
     * モデルが使用するテクスチャの名前を取得する
     * @param index 配列のインデックス値
     * @return テクスチャの名前
     */
    getTextureFileName(index) {
      return this._jsonValue.at(4 /* FrequestNode_Textures */).getValueByIndex(index).getRawString();
    }
    /**
     * モデルに設定された当たり判定の数を取得する
     * @return モデルに設定された当たり判定の数
     */
    getHitAreasCount() {
      if (!this.isExistHitAreas()) {
        return 0;
      }
      return this._jsonValue.at(7 /* FrequestNode_HitAreas */).getSize();
    }
    /**
     * 当たり判定に設定されたIDを取得する
     *
     * @param index 配列のindex
     * @return 当たり判定に設定されたID
     */
    getHitAreaId(index) {
      return CubismFramework.getIdManager().getId(
        this._jsonValue.at(7 /* FrequestNode_HitAreas */).getValueByIndex(index).getValueByString(Id5).getRawString()
      );
    }
    /**
     * 当たり判定に設定された名前を取得する
     * @param index 配列のインデックス値
     * @return 当たり判定に設定された名前
     */
    getHitAreaName(index) {
      return this._jsonValue.at(7 /* FrequestNode_HitAreas */).getValueByIndex(index).getValueByString(Name).getRawString();
    }
    /**
     * 物理演算設定ファイルの名前を取得する
     * @return 物理演算設定ファイルの名前
     */
    getPhysicsFileName() {
      if (!this.isExistPhysicsFile()) {
        return "";
      }
      return this._jsonValue.at(5 /* FrequestNode_Physics */).getRawString();
    }
    /**
     * パーツ切り替え設定ファイルの名前を取得する
     * @return パーツ切り替え設定ファイルの名前
     */
    getPoseFileName() {
      if (!this.isExistPoseFile()) {
        return "";
      }
      return this._jsonValue.at(6 /* FrequestNode_Pose */).getRawString();
    }
    /**
     * 表情設定ファイルの数を取得する
     * @return 表情設定ファイルの数
     */
    getExpressionCount() {
      if (!this.isExistExpressionFile()) {
        return 0;
      }
      return this._jsonValue.at(3 /* FrequestNode_Expressions */).getSize();
    }
    /**
     * 表情設定ファイルを識別する名前（別名）を取得する
     * @param index 配列のインデックス値
     * @return 表情の名前
     */
    getExpressionName(index) {
      return this._jsonValue.at(3 /* FrequestNode_Expressions */).getValueByIndex(index).getValueByString(Name).getRawString();
    }
    /**
     * 表情設定ファイルの名前を取得する
     * @param index 配列のインデックス値
     * @return 表情設定ファイルの名前
     */
    getExpressionFileName(index) {
      return this._jsonValue.at(3 /* FrequestNode_Expressions */).getValueByIndex(index).getValueByString(FilePath).getRawString();
    }
    /**
     * モーショングループの数を取得する
     * @return モーショングループの数
     */
    getMotionGroupCount() {
      if (!this.isExistMotionGroups()) {
        return 0;
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getKeys().getSize();
    }
    /**
     * モーショングループの名前を取得する
     * @param index 配列のインデックス値
     * @return モーショングループの名前
     */
    getMotionGroupName(index) {
      if (!this.isExistMotionGroups()) {
        return null;
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getKeys().at(index);
    }
    /**
     * モーショングループに含まれるモーションの数を取得する
     * @param groupName モーショングループの名前
     * @return モーショングループの数
     */
    getMotionCount(groupName) {
      if (!this.isExistMotionGroupName(groupName)) {
        return 0;
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getSize();
    }
    /**
     * グループ名とインデックス値からモーションファイル名を取得する
     * @param groupName モーショングループの名前
     * @param index     配列のインデックス値
     * @return モーションファイルの名前
     */
    getMotionFileName(groupName, index) {
      if (!this.isExistMotionGroupName(groupName)) {
        return "";
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(FilePath).getRawString();
    }
    /**
     * モーションに対応するサウンドファイルの名前を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return サウンドファイルの名前
     */
    getMotionSoundFileName(groupName, index) {
      if (!this.isExistMotionSoundFile(groupName, index)) {
        return "";
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(SoundPath).getRawString();
    }
    /**
     * モーション開始時のフェードイン処理時間を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return フェードイン処理時間[秒]
     */
    getMotionFadeInTimeValue(groupName, index) {
      if (!this.isExistMotionFadeIn(groupName, index)) {
        return -1;
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(FadeInTime2).toFloat();
    }
    /**
     * モーション終了時のフェードアウト処理時間を取得する
     * @param groupName モーショングループの名前
     * @param index 配列のインデックス値
     * @return フェードアウト処理時間[秒]
     */
    getMotionFadeOutTimeValue(groupName, index) {
      if (!this.isExistMotionFadeOut(groupName, index)) {
        return -1;
      }
      return this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(FadeOutTime2).toFloat();
    }
    /**
     * ユーザーデータのファイル名を取得する
     * @return ユーザーデータのファイル名
     */
    getUserDataFile() {
      if (!this.isExistUserDataFile()) {
        return "";
      }
      return this.getJson().getRoot().getValueByString(FileReferences).getValueByString(UserData3).getRawString();
    }
    /**
     * レイアウト情報を取得する
     * @param outLayoutMap csmMapクラスのインスタンス
     * @return true レイアウト情報が存在する
     * @return false レイアウト情報が存在しない
     */
    getLayoutMap(outLayoutMap) {
      const map = this.getJson().getRoot().getValueByString(Layout).getMap();
      if (map == null) {
        return false;
      }
      let ret = false;
      for (const ite = map.begin(); ite.notEqual(map.end()); ite.preIncrement()) {
        outLayoutMap.setValue(ite.ptr().first, ite.ptr().second.toFloat());
        ret = true;
      }
      return ret;
    }
    /**
     * 目パチに関連付けられたパラメータの数を取得する
     * @return 目パチに関連付けられたパラメータの数
     */
    getEyeBlinkParameterCount() {
      if (!this.isExistEyeBlinkParameters()) {
        return 0;
      }
      let num = 0;
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); i++) {
        const refI = this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i);
        if (refI.isNull() || refI.isError()) {
          continue;
        }
        if (refI.getValueByString(Name).getRawString() == EyeBlink) {
          num = refI.getValueByString(Ids).getVector().getSize();
          break;
        }
      }
      return num;
    }
    /**
     * 目パチに関連付けられたパラメータのIDを取得する
     * @param index 配列のインデックス値
     * @return パラメータID
     */
    getEyeBlinkParameterId(index) {
      if (!this.isExistEyeBlinkParameters()) {
        return null;
      }
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); i++) {
        const refI = this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i);
        if (refI.isNull() || refI.isError()) {
          continue;
        }
        if (refI.getValueByString(Name).getRawString() == EyeBlink) {
          return CubismFramework.getIdManager().getId(
            refI.getValueByString(Ids).getValueByIndex(index).getRawString()
          );
        }
      }
      return null;
    }
    /**
     * リップシンクに関連付けられたパラメータの数を取得する
     * @return リップシンクに関連付けられたパラメータの数
     */
    getLipSyncParameterCount() {
      if (!this.isExistLipSyncParameters()) {
        return 0;
      }
      let num = 0;
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); i++) {
        const refI = this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i);
        if (refI.isNull() || refI.isError()) {
          continue;
        }
        if (refI.getValueByString(Name).getRawString() == LipSync) {
          num = refI.getValueByString(Ids).getVector().getSize();
          break;
        }
      }
      return num;
    }
    /**
     * リップシンクに関連付けられたパラメータの数を取得する
     * @param index 配列のインデックス値
     * @return パラメータID
     */
    getLipSyncParameterId(index) {
      if (!this.isExistLipSyncParameters()) {
        return null;
      }
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); i++) {
        const refI = this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i);
        if (refI.isNull() || refI.isError()) {
          continue;
        }
        if (refI.getValueByString(Name).getRawString() == LipSync) {
          return CubismFramework.getIdManager().getId(
            refI.getValueByString(Ids).getValueByIndex(index).getRawString()
          );
        }
      }
      return null;
    }
    /**
     * モデルファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistModelFile() {
      const node = this._jsonValue.at(1 /* FrequestNode_Moc */);
      return !node.isNull() && !node.isError();
    }
    /**
     * テクスチャファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistTextureFiles() {
      const node = this._jsonValue.at(4 /* FrequestNode_Textures */);
      return !node.isNull() && !node.isError();
    }
    /**
     * 当たり判定のキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistHitAreas() {
      const node = this._jsonValue.at(7 /* FrequestNode_HitAreas */);
      return !node.isNull() && !node.isError();
    }
    /**
     * 物理演算ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistPhysicsFile() {
      const node = this._jsonValue.at(5 /* FrequestNode_Physics */);
      return !node.isNull() && !node.isError();
    }
    /**
     * ポーズ設定ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistPoseFile() {
      const node = this._jsonValue.at(6 /* FrequestNode_Pose */);
      return !node.isNull() && !node.isError();
    }
    /**
     * 表情設定ファイルのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistExpressionFile() {
      const node = this._jsonValue.at(
        3 /* FrequestNode_Expressions */
      );
      return !node.isNull() && !node.isError();
    }
    /**
     * モーショングループのキーが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionGroups() {
      const node = this._jsonValue.at(2 /* FrequestNode_Motions */);
      return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーショングループのキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionGroupName(groupName) {
      const node = this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName);
      return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するサウンドファイルのキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionSoundFile(groupName, index) {
      const node = this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(SoundPath);
      return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するフェードイン時間のキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionFadeIn(groupName, index) {
      const node = this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(FadeInTime2);
      return !node.isNull() && !node.isError();
    }
    /**
     * 引数で指定したモーションに対応するフェードアウト時間のキーが存在するかどうかを確認する
     * @param groupName  グループ名
     * @param index 配列のインデックス値
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistMotionFadeOut(groupName, index) {
      const node = this._jsonValue.at(2 /* FrequestNode_Motions */).getValueByString(groupName).getValueByIndex(index).getValueByString(FadeOutTime2);
      return !node.isNull() && !node.isError();
    }
    /**
     * UserDataのファイル名が存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistUserDataFile() {
      const node = this.getJson().getRoot().getValueByString(FileReferences).getValueByString(UserData3);
      return !node.isNull() && !node.isError();
    }
    /**
     * 目ぱちに対応付けられたパラメータが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistEyeBlinkParameters() {
      if (this._jsonValue.at(0 /* FrequestNode_Groups */).isNull() || this._jsonValue.at(0 /* FrequestNode_Groups */).isError()) {
        return false;
      }
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); ++i) {
        if (this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i).getValueByString(Name).getRawString() == EyeBlink) {
          return true;
        }
      }
      return false;
    }
    /**
     * リップシンクに対応付けられたパラメータが存在するかどうかを確認する
     * @return true キーが存在する
     * @return false キーが存在しない
     */
    isExistLipSyncParameters() {
      if (this._jsonValue.at(0 /* FrequestNode_Groups */).isNull() || this._jsonValue.at(0 /* FrequestNode_Groups */).isError()) {
        return false;
      }
      for (let i = 0; i < this._jsonValue.at(0 /* FrequestNode_Groups */).getSize(); ++i) {
        if (this._jsonValue.at(0 /* FrequestNode_Groups */).getValueByIndex(i).getValueByString(Name).getRawString() == LipSync) {
          return true;
        }
      }
      return false;
    }
  };
  var Live2DCubismFramework39;
  ((Live2DCubismFramework40) => {
    Live2DCubismFramework40.CubismModelSettingJson = CubismModelSettingJson;
  })(Live2DCubismFramework39 || (Live2DCubismFramework39 = {}));
  return __toCommonJS(entry_exports);
})();
